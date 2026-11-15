import assert from "node:assert/strict"
import { test } from "node:test"
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import { createRemoteMcpApp } from "../../server/http.ts"
import { PREVIEW_RESOURCE } from "../../contracts/schemas.ts"
import {
  config,
  principal,
  MemoryDrafts,
  show,
  newKey,
  data,
  code,
} from "./fixtures.ts"
import type {
  Dependencies,
  VerifiedPrincipal,
} from "../../server/dependencies.ts"

const tokenA = "synthetic-oauth-access-token-A"
const tokenB = "synthetic-oauth-access-token-B"
function setup(overrides: Dependencies = {}, responseTimeoutMs?: number) {
  const a = principal()
  const b = principal()
  const tokens = new Map([
    [tokenA, a],
    [tokenB, b],
  ])
  const app = createRemoteMcpApp({
    config,
    ...(responseTimeoutMs === undefined ? {} : { responseTimeoutMs }),
    allowedOrigins: ["https://chat.example.invalid"],
    verifyAccessToken: async (token) => {
      const p = tokens.get(token)
      if (!p) throw new Error("private backend detail must not escape")
      return p
    },
    dependencies: {
      rateLimit: async () => true,
      drafts: new MemoryDrafts(),
      authoring: { allowedPublicAssetUrls: new Set() },
      ...overrides,
    },
  })
  const request = (
    body?: unknown,
    headers: Record<string, string> = {},
    path = config.resource,
    method = "POST",
    signal?: AbortSignal,
  ) =>
    new Request(path, {
      method,
      headers: {
        host: new URL(config.resource).host,
        authorization: "Bearer " + tokenA,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    })
  const connect = async (token = tokenA) => {
    const transport = new StreamableHTTPClientTransport(
      new URL(config.resource),
      {
        authProvider: { token: async () => token },
        fetch: async (input, init) => {
          const r = new Request(input, init)
          r.headers.set("host", new URL(config.resource).host)
          return app.fetch(r)
        },
      },
    )
    const client = new Client({
      name: "private-http-protocol-test",
      version: "1",
    })
    await client.connect(transport)
    return client
  }
  return { app, a, b, tokens, request, connect }
}
const list = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }
test("official HTTP client negotiates, discovers eight strict tools and reads the honest placeholder", async () => {
  const h = setup()
  const client = await h.connect()
  try {
    const tools = await client.listTools()
    assert.equal(tools.tools.length, 8)
    assert.equal(
      tools.tools.filter(
        (t) => (t._meta?.ui as { resourceUri?: string })?.resourceUri,
      ).length,
      1,
    )
    assert.equal((await client.listResources()).resources.length, 3)
    const resource = await client.readResource({ uri: PREVIEW_RESOURCE })
    assert.equal(resource.contents.length, 1)
    assert.equal(
      "text" in resource.contents[0]! &&
        resource.contents[0]!.text.includes("<body></body>"),
      true,
    )
  } finally {
    await client.close()
  }
})
test("HTTP draft CAS preserves tenant boundaries, revoked token denial and safe missing preview", async () => {
  const h = setup()
  const a = await h.connect()
  const b = await h.connect(tokenB)
  const args = {
    contractVersion: "0.1.0",
    authoredShowJson: JSON.stringify(show()),
    idempotencyKey: newKey(),
  }
  try {
    const created = data(
      await a.callTool({ name: "create_game_draft", arguments: args }),
    )
    const draftId = String(created.draftId)
    const cross = await b.callTool({
      name: "get_game_draft",
      arguments: { contractVersion: "0.1.0", draftId },
    })
    assert.equal(code(cross), "NOT_FOUND")
    const input = {
      ...args,
      draftId,
      expectedRevision: 1,
      idempotencyKey: newKey(),
    }
    const updated = data(
      await a.callTool({ name: "update_game_draft", arguments: input }),
    )
    assert.equal(updated.revision, 2)
    assert.equal(
      code(
        await a.callTool({
          name: "update_game_draft",
          arguments: { ...input, idempotencyKey: newKey() },
        }),
      ),
      "REVISION_CONFLICT",
    )
    assert.equal(
      code(
        await a.callTool({
          name: "preview_game",
          arguments: { contractVersion: "0.1.0", draftId, expectedRevision: 2 },
        }),
      ),
      "PREVIEW_UNAVAILABLE",
    )
    h.tokens.delete(tokenA)
    const response = await h.app.fetch(h.request(list))
    assert.equal(response.status, 401)
    assert.match(
      response.headers.get("www-authenticate") ?? "",
      /resource_metadata=/u,
    )
    assert.equal((await response.text()).includes("private backend"), false)
  } finally {
    await a.close()
    await b.close()
  }
})
test("metadata advertises the exact protected resource and least initial scope without a private token", async () => {
  const h = setup()
  const response = await h.app.fetch(
    h.request(
      undefined,
      { authorization: "" },
      config.resourceMetadataUrl,
      "GET",
    ),
  )
  assert.equal(response.status, 200)
  const metadata = await response.json()
  assert.equal(metadata.resource, config.resource)
  assert.deepEqual(metadata.authorization_servers, [config.issuer])
  assert.deepEqual(metadata.scopes_supported, ["tadazz.catalog.read"])
  assert.equal(response.headers.get("cache-control"), "no-store")
})
test("origin/host/TLS/query/proxy/session/body and method attacks fail before private tool dispatch", async () => {
  let writes = 0
  const h = setup({
    catalog: {
      listThemes: async () => {
        writes++
        return {}
      },
      listTemplates: async () => {
        writes++
        return {}
      },
    },
  })
  for (const [request, expected] of [
    [h.request(list, { origin: "https://attacker.invalid" }), 403],
    [h.request(list, { host: "attacker.invalid" }), 403],
    [h.request(list, {}, config.resource.replace("https:", "http:")), 403],
    [h.request(list, {}, config.resource + "?access_token=secret"), 400],
    [h.request(list, { "x-forwarded-host": "attacker.invalid" }), 400],
    [h.request(list, { authorization: "Bearer manager-token" }), 401],
    [h.request(list, { "mcp-session-id": "stolen-session" }), 400],
    [h.request(list, { "content-type": "text/plain" }), 415],
    [h.request(list, { "content-length": "65537" }), 413],
    [h.request({ padding: "x".repeat(65_537) }), 413],
    [h.request([list]), 400],
    [h.request(undefined, {}, config.resource, "GET"), 405],
  ] as const)
    assert.equal((await h.app.fetch(request)).status, expected)
  assert.equal(writes, 0)
})
test("allowed browser origins can read OAuth challenge, while arbitrary preflight headers are rejected", async () => {
  const h = setup()
  const response = await h.app.fetch(
    h.request(list, {
      authorization: "",
      origin: "https://chat.example.invalid",
    }),
  )
  assert.equal(response.status, 401)
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://chat.example.invalid",
  )
  assert.match(
    response.headers.get("access-control-expose-headers") ?? "",
    /WWW-Authenticate/u,
  )
  const allowed = await h.app.fetch(
    h.request(
      undefined,
      {
        origin: "https://chat.example.invalid",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, mcp-method, mcp-name",
      },
      config.resource,
      "OPTIONS",
    ),
  )
  assert.equal(allowed.status, 204)
  const denied = await h.app.fetch(
    h.request(
      undefined,
      {
        origin: "https://chat.example.invalid",
        "access-control-request-method": "POST",
        "access-control-request-headers": "x-account-id",
      },
      config.resource,
      "OPTIONS",
    ),
  )
  assert.equal(denied.status, 403)
})
test("aborted unsettled authorization keeps all 32 HTTP slots occupied until real work settles", async () => {
  let release!: (p: VerifiedPrincipal) => void
  let started = 0
  let entered!: () => void
  const allEntered = new Promise<void>((resolve) => {
    entered = resolve
  })
  const held = new Promise<VerifiedPrincipal>((resolve) => {
    release = resolve
  })
  const p = principal()
  const app = createRemoteMcpApp({
    config,
    allowedOrigins: [],
    verifyAccessToken: async () => {
      if (++started === 32) entered()
      return held
    },
    dependencies: {},
  })
  const controllers = Array.from({ length: 32 }, () => new AbortController())
  const request = (signal?: AbortSignal) =>
    new Request(config.resource, {
      method: "POST",
      signal,
      headers: {
        host: new URL(config.resource).host,
        authorization: "Bearer " + tokenA,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(list),
    })
  const pending = controllers.map((c) => app.fetch(request(c.signal)))
  await allEntered
  controllers.forEach((c) => c.abort())
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal((await app.fetch(request())).status, 429)
  release(p)
  assert.deepEqual(
    (await Promise.all(pending)).map((r) => r.status),
    Array(32).fill(400),
  )
  await app.drain()
  assert.equal((await app.fetch(request())).status, 200)
})

test("legacy SSE retains all32 cancelled handler admissions until actual dependency work settles", async () => {
  let release!: (value: unknown) => void
  let entered!: () => void
  let started = 0
  const allEntered = new Promise<void>((resolve) => {
    entered = resolve
  })
  const held = new Promise<unknown>((resolve) => {
    release = resolve
  })
  const h = setup({
    catalog: {
      listThemes: async () => ({ items: [] }),
      listTemplates: async () => {
        if (++started === 32) entered()
        return held
      },
    },
  })
  const controllers = Array.from({ length: 32 }, () => new AbortController())
  const calls = controllers.map((controller, id) =>
    h.app.fetch(
      h.request(
        {
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: {
            name: "list_game_templates",
            arguments: { contractVersion: "0.1.0" },
          },
        },
        {},
        config.resource,
        "POST",
        controller.signal,
      ),
    ),
  )
  await allEntered
  controllers.forEach((controller) => controller.abort())
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal((await h.app.fetch(h.request(list))).status, 429)
  release({ items: [] })
  assert.deepEqual(
    (await Promise.all(calls)).map((response) => response.status),
    Array(32).fill(400),
  )
  await h.app.drain()
  assert.equal((await h.app.fetch(h.request(list))).status, 200)
})

test(
  "HTTP deadline responds while shutdown still waits for actual legacy dependency settlement",
  { timeout: 5000 },
  async () => {
    let release!: (value: unknown) => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const held = new Promise<unknown>((resolve) => {
      release = resolve
    })
    const h = setup(
      {
        catalog: {
          listThemes: async () => ({ items: [] }),
          listTemplates: async () => {
            entered()
            return held
          },
        },
      },
      100,
    )
    const call = h.app.fetch(
      h.request({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "list_game_templates",
          arguments: { contractVersion: "0.1.0" },
        },
      }),
    )
    await started
    assert.equal((await call).status, 504)
    let closed = false
    const closing = h.app.close().then(() => {
      closed = true
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(closed, false)
    release({ items: [] })
    await closing
    assert.equal(closed, true)
    assert.equal((await h.app.fetch(h.request(list))).status, 503)
  },
)
