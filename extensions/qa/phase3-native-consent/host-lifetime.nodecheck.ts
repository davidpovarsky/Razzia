import assert from "node:assert/strict"
import { once } from "node:events"
import { connect } from "node:net"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  createNativeConsentHost,
  extractRawPathname,
  listenNativeConsentHost,
} from "../../src/mcp-app/native-host/index.ts"

test("raw routing refuses normalized, encoded-separator, fragment and malformed paths", () => {
  for (const path of [
    "/api/../mcp",
    "/api/%2e%2e/mcp",
    "/mcp\\x",
    "/mcp%2fx",
    "/mcp%5cx",
    "/mcp#fragment",
    "/%ZZ",
    "//mcp",
  ]) {
    assert.equal(extractRawPathname(path), null, path)
  }
  assert.equal(
    extractRawPathname("/studio/oauth-consent?oauth_request=a%2Fb"),
    "/studio/oauth-consent",
  )
})

test("native bridge streams a response before its producer completes", async () => {
  const bodyControl: { close: (() => void) | null } = { close: null }
  const host = await createNativeConsentHost({
    enabled: false,
    nativeAppFetch: () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("first"))
            bodyControl.close = () => controller.close()
          },
        }),
      ),
  })
  const listener = await listenNativeConsentHost(host, { port: 0 })

  try {
    const response = await fetch(`${listener.origin}/api/stream`, {
      signal: AbortSignal.timeout(3000),
    })
    const { body } = response
    assert(body)
    const reader = body.getReader()
    const first = await reader.read()
    assert.equal(new TextDecoder().decode(first.value), "first")
    const finish = bodyControl.close
    assert(finish)
    bodyControl.close = null
    finish()
    assert.equal((await reader.read()).done, true)
  } finally {
    bodyControl.close?.()
    await listener.close()
  }
})

test("a slow non-machine body is torn down before dispatch and drain settles", async () => {
  let dispatches = 0
  const host = await createNativeConsentHost({
    enabled: false,
    responseTimeoutMs: 100,
    nativeAppFetch: () => {
      dispatches += 1

      return new Response("unexpected")
    },
  })
  const listener = await listenNativeConsentHost(host, { port: 0 })
  const socket = connect(listener.port, "127.0.0.1")
  socket.on("error", () => undefined)

  try {
    await once(socket, "connect")
    const closed = once(socket, "close")
    socket.write(
      "POST /api/slow HTTP/1.1\r\nHost: localhost\r\nContent-Length: 999\r\n\r\nx",
    )
    await closed
    await host.drain()
    assert.equal(dispatches, 0)
  } finally {
    socket.destroy()
    await listener.close()
  }
})

test("client disconnect aborts the same native Request and settles tracked work", async () => {
  let onEntered: (signal: AbortSignal) => void = () => {
    throw new Error("Barrier not initialized")
  }
  const entered = new Promise<AbortSignal>((resolve) => {
    onEntered = resolve
  })
  const host = await createNativeConsentHost({
    enabled: false,
    responseTimeoutMs: 2000,
    nativeAppFetch: (request) => {
      onEntered(request.signal)

      return new Promise<Response>((resolve) => {
        request.signal.addEventListener(
          "abort",
          () => resolve(new Response(null)),
          { once: true },
        )
      })
    },
  })
  const listener = await listenNativeConsentHost(host, { port: 0 })
  const socket = connect(listener.port, "127.0.0.1")
  socket.on("error", () => undefined)

  try {
    await once(socket, "connect")
    socket.write("GET /api/wait HTTP/1.1\r\nHost: localhost\r\n\r\n")
    const signal = await entered
    socket.destroy()
    await host.drain()
    assert.equal(signal.aborted, true)
  } finally {
    socket.destroy()
    await listener.close()
  }
})

test("Socket.IO shutdown settles with an idle non-HTTP socket", async () => {
  const root = mkdtempSync(join(tmpdir(), "tadazz-host-close-synthetic-"))
  const previous = {
    CONFIG_PATH: process.env.CONFIG_PATH,
    JWT_SECRET: process.env.JWT_SECRET,
    TADAZZ_ACCOUNTS_ENABLED: process.env.TADAZZ_ACCOUNTS_ENABLED,
  }
  process.env.CONFIG_PATH = root
  process.env.JWT_SECRET =
    "synthetic-close-test-secret-with-at-least-32-characters"
  process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
  const host = await createNativeConsentHost({ enabled: false })
  const listener = await listenNativeConsentHost(host, {
    port: 0,
    attachSocketServer: true,
  })
  const socket = connect(listener.port, "127.0.0.1")
  socket.on("error", () => undefined)
  let shuttingDown: Promise<void> | null = null
  const cleanup: { deadline: ReturnType<typeof setTimeout> | null } = {
    deadline: null,
  }

  try {
    await once(socket, "connect")
    shuttingDown = listener.close()
    await Promise.race([
      shuttingDown,
      new Promise<never>((_resolve, reject) => {
        cleanup.deadline = setTimeout(
          () => reject(new Error("Shutdown blocked on idle socket")),
          1000,
        )
      }),
    ])
  } finally {
    if (cleanup.deadline) {
      clearTimeout(cleanup.deadline)
    }

    socket.destroy()
    await shuttingDown
    const registry = await import("@razzia/socket/services/registry")
    registry.default.getInstance().stopCleanupTask()
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key)
      } else {
        process.env[key] = value
      }
    }
    rmSync(root, { recursive: true, force: true })
  }
})
