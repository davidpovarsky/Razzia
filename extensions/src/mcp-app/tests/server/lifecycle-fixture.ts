import { Client } from "@modelcontextprotocol/client"
import {
  McpServer,
  type CallToolResult,
  type JSONRPCMessage,
  type ServerContext,
  type Transport,
  type TransportSendOptions,
} from "@modelcontextprotocol/server"
import type { Dependencies } from "../../server/dependencies.ts"
import { createTadazzMcpServer } from "../../server/factory.ts"
import { guardedConnection } from "../../server/connection.ts"
import { inputs } from "../../contracts/tools.ts"
import { config, principal, newKey } from "./fixtures.ts"
import { setImmediate as immediate } from "node:timers/promises"

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
export async function drain() {
  for (let i = 0; i < 8; i++) await immediate()
}
export async function until(check: () => boolean) {
  for (let i = 0; i < 500; i++) {
    if (check()) return
    await immediate()
  }
  throw new Error("Expected lifecycle state")
}

/** Test-only read-only linked transports. The observed mode uses public SDK
 * APIs to observe errors/signals on the SAME guarded connection implementation. */
export async function lifecycleHarness(
  overrides: Dependencies = {},
  work?: (context: ServerContext) => Promise<CallToolResult>,
  beforeSend?: (
    message: JSONRPCMessage,
    options?: TransportSendOptions,
  ) => Promise<void>,
) {
  const p = principal()
  const deps: Dependencies = {
    prevalidationLimit: async () => true,
    authorize: async () => p,
    rateLimit: async () => true,
    authoring: { allowedPublicAssetUrls: new Set() },
    drafts: {
      async get() {
        return undefined
      },
      async create() {
        throw new Error("Read only fixture")
      },
      async replace() {
        throw new Error("Read only fixture")
      },
    },
    ...overrides,
  }
  const errors: string[] = []
  let server: ReturnType<typeof createTadazzMcpServer>
  if (work) {
    const sdk = new McpServer({ name: "lifecycle-observer", version: "1" })
    sdk.server.onerror = (error) => errors.push(error.message)
    const guarded = guardedConnection(sdk, deps, config)
    sdk.registerTool(
      "get_game_draft",
      { inputSchema: inputs.get_game_draft },
      (_args, context) => guarded.run(context, () => work(context)),
    )
    server = { connect: guarded.connect, close: guarded.close }
  } else server = createTadazzMcpServer(config, deps)
  const client = new Client({ name: "synthetic-lifecycle", version: "1" })
  client.onerror = () => {} // Raw-ID witnesses deliberately have no client pending promise.
  const clientMessages: JSONRPCMessage[] = []
  const serverMessages: JSONRPCMessage[] = []
  const flags = {
    failSend: false,
    failClose: false,
    closed: false,
    sends: 0,
    closes: 0,
  }
  const closeBoth = () => {
    if (flags.closed) return
    flags.closed = true
    ct.onclose?.()
    st.onclose?.()
  }
  const ct: Transport = {
    start: async () => {},
    send: async (message) => {
      clientMessages.push(structuredClone(message))
      queueMicrotask(() => st.onmessage?.(structuredClone(message)))
    },
    close: async () => closeBoth(),
  }
  const st: Transport = {
    start: async () => {},
    send: async (message, options) => {
      flags.sends++
      if (flags.failSend) throw new Error("synthetic-secret-send")
      await beforeSend?.(message, options)
      serverMessages.push(structuredClone(message))
      queueMicrotask(() => ct.onmessage?.(structuredClone(message)))
    },
    close: async () => {
      flags.closes++
      if (flags.failClose) throw new Error("synthetic-secret-close")
      closeBoth()
    },
  }
  await server.connect(st)
  await client.connect(ct)
  return {
    p,
    client,
    server,
    flags,
    errors,
    clientMessages,
    serverMessages,
    read(signal?: AbortSignal) {
      return client.callTool(
        {
          name: "get_game_draft",
          arguments: { contractVersion: "0.1.0", draftId: newKey() },
        },
        { signal },
      )
    },
    injectRead(
      id: string | number,
      extraArguments: Record<string, unknown> = {},
    ) {
      return ct.send({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: {
          name: "get_game_draft",
          arguments: {
            contractVersion: "0.1.0",
            draftId: newKey(),
            ...extraArguments,
          },
        },
      })
    },
    cancel(id: string | number) {
      return client.notification({
        method: "notifications/cancelled",
        params: { requestId: id },
      })
    },
    injectPublic(id: string | number) {
      return ct.send({ jsonrpc: "2.0", id, method: "tools/list", params: {} })
    },
    async close() {
      await client.close()
      await server.close().catch(() => {})
    },
  }
}
