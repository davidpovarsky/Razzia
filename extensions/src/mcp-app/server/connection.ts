import type {
  McpServer,
  ServerContext,
  CallToolResult,
  Transport,
} from "@modelcontextprotocol/server"
import {
  CallToolRequestSchema,
  CancelledNotificationSchema,
} from "@modelcontextprotocol/core"
import { inputs, toolNames } from "../contracts/tools.ts"
import type {
  Dependencies,
  ServerConfig,
  VerifiedPrincipal,
} from "./dependencies.ts"
import { authorize } from "./authorization.ts"
import { failureResult } from "./results.ts"
import { ToolError } from "./errors.ts"
import {
  RequestLifetimes,
  boundedInput,
  type Operation,
} from "./request-boundary.ts"

/**
 * Public Transport composition. Internal SDK IDs never repeat; original client
 * request IDs are restored on the wire. No business/data IDs change.
 */

export function guardedConnection(
  server: McpServer,
  deps: Dependencies,
  config: ServerConfig,
) {
  const lives = new RequestLifetimes()
  let connected = false
  let closeInner: (() => Promise<void>) | undefined = undefined

  let cancelSdk: ((op: Operation) => void) | undefined = undefined

  return {
    async run(
      context: ServerContext,
      handler: (p: VerifiedPrincipal) => Promise<CallToolResult>,
    ) {
      const op = lives.bySdk.get(String(context.mcpReq.id))

      if (!op || !op.tool || !lives.current(op)) {
        throw new ToolError("SCOPE_REQUIRED")
      }

      op.work += 1
      const aborted = () => lives.cancel(op)
      context.mcpReq.signal.addEventListener("abort", aborted, { once: true })
      op.dispose.push(() =>
        context.mcpReq.signal.removeEventListener("abort", aborted),
      )

      try {
        if (op.cancelled || context.mcpReq.signal.aborted) {
          lives.cancel(op)
          // Admission-time cancellation may predate the SDK controller.

          cancelSdk?.(op)
          throw new ToolError("SCOPE_REQUIRED")
        }

        const { principal } = op

        if (!principal) {
          throw new ToolError("SCOPE_REQUIRED")
        }

        return await handler(principal)
      } finally {
        op.sdkPending = false
        // Cancel does not release still-running dependency work.

        lives.settledWork(op)
      }
    },
    // oxlint-disable-next-line typescript/no-invalid-void-type -- TypeScript this: void declares a receiver-free callback; it is erased and is not a runtime argument.
    async connect(this: void, inner: Transport) {
      if (connected || lives.closed) {
        throw new Error("One guarded connection per factory")
      }

      connected = true
      let closePromise: Promise<void> | undefined = undefined

      const report = (message: string) =>
        transport.onerror?.(new Error(message))
      const end = () => {
        if (lives.closed) {
          return
        }

        lives.close()
        // Also abort SDK controllers if inner.close rejects.

        transport.onclose?.()
      }
      closeInner = () => {
        // Terminal BEFORE awaiting the underlying transport.

        end()
        closePromise ??= Promise.resolve()
          .then(() => inner.close())
          .catch(() => {
            report("Transport close failed")
            throw new Error("Transport close failed")
          })

        return closePromise
      }
      const closeConnectedTransport = closeInner
      const terminate = (message: string) => {
        report(message)
        // Failure is already reported safely.

        void closeConnectedTransport().catch(() => {
          /* The close path already reports its failure through the guarded transport. */
        })
      }
      cancelSdk = (op) => {
        if (!lives.closed && op.forwarded) {
          transport.onmessage?.({
            jsonrpc: "2.0",
            method: "notifications/cancelled",
            params: { requestId: op.sdkId, reason: "Request cancelled" },
          })
        }
      }
      const cancel = (op: Operation) => {
        lives.cancel(op)
        cancelSdk?.(op)
      }
      const transport: Transport = {
        get sessionId() {
          return inner.sessionId
        },
        get hasPerRequestStream() {
          return inner.hasPerRequestStream
        },
        setProtocolVersion: (version) => inner.setProtocolVersion?.(version),
        setSupportedProtocolVersions: (versions) =>
          inner.setSupportedProtocolVersions?.(versions),
        async send(message, options) {
          if (lives.closed) {
            throw new Error("Transport closed")
          }

          const response = !("method" in message) && "id" in message
          const op = response ? lives.bySdk.get(String(message.id)) : undefined
          // Retired late completion.

          if (response && !op && lives.isInternal(message.id)) {
            return
          }

          if (op && (!lives.current(op) || op.cancelled)) {
            lives.replied(op)

            return
          }

          const related = options?.relatedRequestId
          const parent =
            related === undefined ? undefined : lives.bySdk.get(String(related))

          if (related !== undefined && lives.isInternal(related) && !parent) {
            return
          }

          if (parent && (!lives.current(parent) || parent.cancelled)) {
            return
          }

          const releaseSend = lives.retainSend(op, parent)

          try {
            await inner.send(
              op ? { ...message, id: op.wireId } : message,
              parent
                ? { ...options, relatedRequestId: parent.wireId }
                : options,
            )
          } catch {
            report("Transport send failed")
            await closeConnectedTransport().catch(() => {
              /* Preserve the original send failure after the close attempt settles. */
            })
            throw new Error("Transport send failed")
          } finally {
            if (op) {
              lives.replied(op)
            }

            releaseSend()
          }
        },
        close: () => closeConnectedTransport(),
        async start() {
          inner.onclose = end
          inner.onerror = () => terminate("Transport failure")
          inner.onmessage = (message, extra) => {
            if (lives.closed) {
              return
            }

            if (!("method" in message)) {
              transport.onmessage?.(message, extra)

              return
            }

            if (message.method === "notifications/cancelled") {
              const parsed = CancelledNotificationSchema.safeParse(message)

              if (
                parsed.success &&
                parsed.data.params.requestId !== undefined
              ) {
                const op = lives.byWire.get(parsed.data.params.requestId)

                if (op) {
                  cancel(op)
                }
              }

              return
            }

            if (!("id" in message)) {
              transport.onmessage?.(message, extra)

              return
            }

            const tool = message.method === "tools/call"
            let op: Operation | undefined = undefined

            try {
              op = lives.admit(message.id, tool)
            } catch {
              terminate("Invalid request lifetime")

              return
            }

            const forward = () => {
              op.forwarded = true
              op.sdkPending = tool
              transport.onmessage?.({ ...message, id: op.sdkId }, extra)
            }
            // Current public resources have no private dependency work.

            if (!tool) {
              forward()

              return
            }

            const signal = extra?.request?.signal
            const aborted = () => cancel(op)
            signal?.addEventListener("abort", aborted, { once: true })
            op.dispose.push(() => signal?.removeEventListener("abort", aborted))

            if (signal?.aborted) {
              cancel(op)
            }

            const incoming = message as unknown as {
              params?: { name?: unknown }
            }
            const name = toolNames.find((n) => n === incoming.params?.name)
            const isCurrentOperation = (operation: Operation) =>
              lives.current(operation) && !operation.cancelled
            void (async () => {
              try {
                if (!isCurrentOperation(op)) {
                  return
                }

                const principal = await authorize({ name, extra, deps, config })

                if (!isCurrentOperation(op)) {
                  return
                }

                boundedInput(message)
                const request = CallToolRequestSchema.safeParse(message)

                if (
                  !request.success ||
                  !name ||
                  !inputs[name].safeParse(request.data.params.arguments ?? {})
                    .success
                ) {
                  throw new ToolError("VALIDATION_FAILED")
                }

                op.principal = principal
                forward()
              } catch (error) {
                if (!isCurrentOperation(op)) {
                  return
                }

                const result = server.server.projectCallToolResult(
                  failureResult({ name, error, config }),
                  undefined,
                )
                await transport.send(
                  { jsonrpc: "2.0", id: op.sdkId, result },
                  { relatedRequestId: op.sdkId },
                )
              } finally {
                if (!op.forwarded) {
                  lives.replied(op)
                }

                lives.settledWork(op)
              }
            })().catch(() => terminate("Tool request failed"))
          }

          try {
            await inner.start()
          } catch {
            terminate("Transport start failed")
            throw new Error("Transport start failed")
          }
        },
      }

      try {
        await server.connect(transport)
      } catch {
        await closeInner().catch(() => {
          /* Preserve the connection failure after the close attempt settles. */
        })
        throw new Error("Transport connection failed")
      }
    },
    // oxlint-disable-next-line typescript/no-invalid-void-type -- TypeScript this: void declares a receiver-free callback; it is erased and is not a runtime argument.
    async close(this: void) {
      if (closeInner) {
        await closeInner()
      } else {
        lives.close()
        await server.close()
      }
    },
  }
}
