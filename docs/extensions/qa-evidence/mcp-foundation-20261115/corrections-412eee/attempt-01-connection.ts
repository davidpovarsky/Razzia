import type {
  McpServer,
  RequestId,
  Transport,
} from "@modelcontextprotocol/server"
import { CallToolRequestSchema } from "@modelcontextprotocol/core"
import { canonicalJson, utf8Bytes } from "../contracts/canonical.ts"
import { LIMITS } from "../contracts/schemas.ts"
import {
  inputs,
  outputs,
  toolNames,
  type ToolName,
} from "../contracts/tools.ts"
import type {
  Dependencies,
  ServerConfig,
  VerifiedPrincipal,
} from "./dependencies.ts"
import { authorize } from "./authorization.ts"
import { failureResult } from "./results.ts"
import { ToolError } from "./errors.ts"
import { z } from "zod"

/** Bounded walk BEFORE canonicalization/schema diagnostics. No arbitrary keys,
 * values, validation issues or exception text are returned to the caller. */
function boundedInput(value: unknown) {
  let elements = 0
  let textUnits = 0
  const seen = new Set<object>()
  const walk = (v: unknown, depth: number) => {
    if (++elements > 100 || depth > 16) throw new ToolError("VALIDATION_FAILED")
    if (typeof v === "string") {
      textUnits += v.length
      if (textUnits > LIMITS.request) throw new ToolError("VALIDATION_FAILED")
    } else if (v && typeof v === "object") {
      if (seen.has(v)) throw new ToolError("VALIDATION_FAILED")
      seen.add(v)
      for (const key of Object.keys(v)) {
        textUnits += key.length
        if (textUnits > LIMITS.request) throw new ToolError("VALIDATION_FAILED")
        walk((v as Record<string, unknown>)[key], depth + 1)
      }
    }
  }
  walk(value, 0)
  if (utf8Bytes(canonicalJson(value)) > LIMITS.request)
    throw new ToolError("VALIDATION_FAILED")
}

/** Supported SDK Transport composition, not mutation of McpServer/SDK methods.
 * The bare SDK is deliberately not returned: every connection uses this guard.
 * This guards decoded MCP messages, NOT HTTP parsing/TLS/Origin or OAuth itself. */
export function guardedConnection(
  server: McpServer,
  deps: Dependencies,
  config: ServerConfig,
) {
  const authorized = new Map<RequestId, VerifiedPrincipal>()
  const pending = new Set<RequestId>()
  let connected = false
  const projectionSchemas = Object.fromEntries(
    toolNames.map((name) => [name, z.toJSONSchema(outputs[name])]),
  )
  return {
    principal(id: RequestId) {
      const p = authorized.get(id)
      if (!p) throw new ToolError("SCOPE_REQUIRED")
      return p
    },
    async connect(inner: Transport) {
      if (connected) throw new Error("One guarded connection per factory")
      connected = true
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
          if (
            !("method" in message) &&
            "id" in message &&
            message.id !== null
          ) {
            authorized.delete(message.id)
            pending.delete(message.id)
          }
          await inner.send(message, options)
        },
        async close() {
          pending.clear()
          authorized.clear()
          await inner.close()
        },
        async start() {
          inner.onclose = () => {
            pending.clear()
            authorized.clear()
            transport.onclose?.()
          }
          inner.onerror = () =>
            transport.onerror?.(new Error("Transport failure"))
          inner.onmessage = (message, extra) => {
            if (!("method" in message) || message.method !== "tools/call") {
              transport.onmessage?.(message, extra)
              return
            }
            const id = "id" in message ? message.id : undefined
            if (
              (typeof id !== "string" && typeof id !== "number") ||
              (typeof id === "string" && id.length > 128) ||
              (typeof id === "number" && !Number.isSafeInteger(id)) ||
              pending.has(id) ||
              pending.size >= 32
            ) {
              // Bound in-flight work before any async dependency; no reflected ID/input.
              void transport
                .close()
                .catch(() => transport.onerror?.(new Error("Transport closed")))
              return
            }
            pending.add(id)
            const incoming = message as unknown as {
              params?: { name?: unknown }
            }
            const name = toolNames.find((n) => n === incoming.params?.name)
            void (async () => {
              try {
                const p = await authorize(name, extra, deps, config)
                boundedInput(message)
                const request = CallToolRequestSchema.safeParse(message)
                if (
                  !request.success ||
                  !name ||
                  !inputs[name].safeParse(request.data.params.arguments ?? {})
                    .success
                )
                  throw new ToolError("VALIDATION_FAILED")
                if (!pending.has(id)) return // Connection closed during authorization.
                authorized.set(id, p)
                transport.onmessage?.(message, extra)
              } catch (error) {
                pending.delete(id)
                authorized.delete(id)
                const result = server.server.projectCallToolResult(
                  failureResult(name, error, config),
                  name ? projectionSchemas[name] : undefined,
                )
                await inner.send(
                  { jsonrpc: "2.0", id, result },
                  { relatedRequestId: id },
                )
              }
            })().catch(() =>
              transport.onerror?.(new Error("Tool request failed")),
            )
          }
          await inner.start()
        },
      }
      await server.connect(transport)
    },
    async close() {
      await server.close()
    },
  }
}
