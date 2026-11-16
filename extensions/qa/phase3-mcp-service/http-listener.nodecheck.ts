import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto"
import http from "node:http"
import net from "node:net"
import { after, before, test } from "node:test"
import { Client, StreamableHTTPClientTransport } from "./mcp-client.ts"
import { createOAuthConsentClient } from "../../src/components/oauth-consent/client.ts"
import {
  createNativeSaveConsentClient,
  nativeSaveRequestIdFromPath,
} from "../../src/components/native-save-consent/client.ts"
import {
  createPrincipalRateLimiter,
  createProtectedMcpService,
  listenProtectedMcpHttpServer,
  type ProtectedMcpService,
} from "../../src/mcp-app/first-party/index.ts"
import {
  createInput,
  fixture,
  key,
  origin,
  policy,
} from "../../src/mcp-app/tests/first-party/fixtures.ts"

let currentFixture: Awaited<ReturnType<typeof fixture>> | null = null
let signingPem = ""
let ticketKey: Uint8Array = new Uint8Array()

function getFixture() {
  assert.ok(currentFixture)

  return currentFixture
}
const clientId = "phase3-http-listener-client"
const redirectUri = "https://host.example.invalid/listener/callback"
const scopes = [
  "tadazz.catalog.read",
  "tadazz.drafts.read",
  "tadazz.drafts.write",
  "tadazz.library.write",
]
const activeClosers: Array<() => Promise<void>> = []

function rawHttpRequest(
  port: number,
  options: {
    method: string
    path: string
    headers?: Record<string, string>
    body?: string
  },
) {
  return new Promise<{
    status: number
    headers: http.IncomingHttpHeaders
    body: string
  }>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        )
      },
    )
    req.on("error", reject)

    if (options.body !== undefined) {
      req.write(options.body)
    }

    req.end()
  })
}

before(async () => {
  currentFixture = await fixture()
  const pair = generateKeyPairSync("ed25519")
  signingPem = pair.privateKey.export({ type: "pkcs8", format: "pem" })
  ticketKey = randomBytes(32)
})

after(async () => {
  await Promise.allSettled(activeClosers.map((close) => close()))
  currentFixture?.close()
})

test("listener refuses disabled service and non-loopback bind without explicit opt-in", async () => {
  const f = getFixture()
  const disabled = await createProtectedMcpService({
    enabled: false,
    config: {
      issuer: `${origin}/oauth`,
      resource: `${origin}/mcp`,
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
      firstPartyOrigins: [origin],
    },
    configRoot: f.root,
    consentPageUrl: `${origin}/studio/oauth-consent`,
    keyId: "disabled-key",
    signingPrivateKeyPem: signingPem,
    ticketEncryptionKey: ticketKey,
    clients: [{ clientId, redirectUris: [redirectUri], scopes }],
    allowedOrigins: [],
    authoring: policy,
    rateLimit: createPrincipalRateLimiter(),
  })

  await assert.rejects(
    listenProtectedMcpHttpServer(disabled, { port: 0 }),
    /disabled/i,
  )

  const enabled = await createProtectedMcpService({
    enabled: true,
    config: {
      issuer: `${origin}/oauth`,
      resource: `${origin}/mcp`,
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
      firstPartyOrigins: [origin],
    },
    configRoot: f.root,
    consentPageUrl: `${origin}/studio/oauth-consent`,
    keyId: "loopback-guard-key",
    signingPrivateKeyPem: signingPem,
    ticketEncryptionKey: ticketKey,
    clients: [{ clientId, redirectUris: [redirectUri], scopes }],
    allowedOrigins: [],
    authoring: policy,
    rateLimit: createPrincipalRateLimiter(),
  })
  activeClosers.push(() => enabled.close())

  await assert.rejects(
    listenProtectedMcpHttpServer(enabled, { host: "0.0.0.0", port: 0 }),
    /loopback/i,
  )
})

test("loopback TCP listener enforces pre-Request header/Host/URL limits and executes genuine OAuth + MCP + native-save consent over TCP", async () => {
  const f = getFixture()
  const hostHeader = new URL(origin).host
  let abortObserved = false
  let requestEntered = false
  let notifyAbortCheck: (() => void) | null = null
  const abortCheckDone = new Promise<void>((resolve) => {
    notifyAbortCheck = resolve
  })
  const baseLimiter = createPrincipalRateLimiter()
  const service: ProtectedMcpService = await createProtectedMcpService({
    enabled: true,
    config: {
      issuer: `${origin}/oauth`,
      resource: `${origin}/mcp`,
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
      firstPartyOrigins: [origin],
    },
    configRoot: f.root,
    consentPageUrl: `${origin}/studio/oauth-consent`,
    keyId: "tcp-listener-key",
    signingPrivateKeyPem: signingPem,
    ticketEncryptionKey: ticketKey,
    clients: [{ clientId, redirectUris: [redirectUri], scopes }],
    allowedOrigins: [],
    authoring: policy,
    rateLimit: async (principal, toolName) => {
      if (toolName === "get_game_draft" && !requestEntered) {
        requestEntered = true
        notifyAbortCheck?.()
        await new Promise((resolve) => {
          setTimeout(resolve, 250)
        })
        abortObserved = true
      }

      return baseLimiter(principal, toolName)
    },
    nativeSave: {
      consentPageUrl: `${origin}/studio/native-save-consent`,
      operations: {
        lookup: () => ({ status: "absent" }),
        create: () => {
          throw new Error("Unexpected create without Linux C1")
        },
      },
    },
  })
  const listener = await listenProtectedMcpHttpServer(service, { port: 0 })
  activeClosers.push(() => listener.close())
  const { port } = listener

  for (const [label, req] of [
    [
      "wrong Host",
      {
        method: "GET",
        path: "/oauth/jwks.json",
        headers: { host: "bad.host" },
      },
    ],
    [
      "x-forwarded-host",
      {
        method: "GET",
        path: "/oauth/jwks.json",
        headers: { host: hostHeader, "x-forwarded-host": hostHeader },
      },
    ],
    [
      "protocol-relative URL",
      {
        method: "GET",
        path: "//evil.invalid/mcp",
        headers: { host: hostHeader },
      },
    ],
    [
      "too many headers",
      {
        method: "GET",
        path: "/oauth/jwks.json",
        headers: {
          host: hostHeader,
          ...Object.fromEntries(
            Array.from({ length: 33 }, (_, idx) => [`x-h-${idx}`, "1"]),
          ),
        },
      },
    ],
    [
      "oversized content-length",
      {
        method: "POST",
        path: "/mcp",
        headers: {
          host: hostHeader,
          "content-type": "application/json",
          "content-length": "65537",
        },
        body: "",
      },
    ],
    [
      "GET with content-length",
      {
        method: "GET",
        path: "/oauth/jwks.json",
        headers: {
          host: hostHeader,
          "content-length": "5",
        },
        body: "hello",
      },
    ],
  ] as const) {
    const rejected = await rawHttpRequest(port, req)
    assert.ok(
      [400, 403, 413].includes(rejected.status),
      `${label} unexpected status ${rejected.status}`,
    )
  }

  const unmatchedTcp = await rawHttpRequest(port, {
    method: "GET",
    path: "/not-an-mcp-or-oauth-route",
    headers: { host: hostHeader },
  })
  assert.equal(unmatchedTcp.status, 404)

  const duplicateHostReply = await new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.write(
        `GET /oauth/jwks.json HTTP/1.1\r\nHost: ${hostHeader}\r\nHost: evil.example.invalid\r\nConnection: close\r\n\r\n`,
      )
    })
    const chunks: Buffer[] = []
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
    })
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    socket.on("error", reject)
  })
  assert.match(duplicateHostReply, /^HTTP\/1\.1 400 /u)

  const prMeta = await rawHttpRequest(port, {
    method: "GET",
    path: "/.well-known/oauth-protected-resource/mcp",
    headers: { host: hostHeader },
  })
  assert.equal(prMeta.status, 200)
  assert.equal(
    (JSON.parse(prMeta.body) as { resource: string }).resource,
    `${origin}/mcp`,
  )

  const verifier = randomBytes(32).toString("base64url")
  const state = randomBytes(24).toString("base64url")
  const authorize = await rawHttpRequest(port, {
    method: "GET",
    path: `/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      resource: `${origin}/mcp`,
      scope: scopes.join(" "),
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    })}`,
    headers: { host: hostHeader },
  })
  assert.equal(authorize.status, 302)
  const ticket =
    new URL(authorize.headers.location ?? "").searchParams.get(
      "oauth_request",
    ) ?? ""

  const resolveRequestUrl = (input: Parameters<typeof fetch>[0]): URL => {
    if (typeof input === "string") {
      return new URL(input, origin)
    }

    if (input instanceof URL) {
      return input
    }

    return new URL(input.url)
  }

  const resolveBodyText = (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<string | undefined> => {
    if (typeof init?.body === "string") {
      return Promise.resolve(init.body)
    }

    if (input instanceof Request && input.body) {
      return input.text()
    }

    return Promise.resolve(undefined)
  }

  const transportFetch: typeof fetch = async (input, init) => {
    const url = resolveRequestUrl(input)
    const headers: Record<string, string> = { host: hostHeader }
    new Headers(
      input instanceof Request ? input.headers : init?.headers,
    ).forEach((value, name) => {
      if (name.toLowerCase() !== "host") {
        headers[name] = value
      }
    })
    const body = await resolveBodyText(input, init)
    const res = await rawHttpRequest(port, {
      method: (input instanceof Request ? input.method : init?.method) ?? "GET",
      path: `${url.pathname}${url.search}`,
      headers,
      body,
    })

    return new Response(res.body || null, {
      status: res.status,
      headers: res.headers as Record<string, string>,
    })
  }

  const consentClient = createOAuthConsentClient({
    issuerBasePath: "/oauth",
    getNativeToken: () => f.sessions[0].token,
    request: (path, init) => {
      const headers = new Headers(init?.headers)
      headers.set("origin", origin)

      return transportFetch(path, { ...init, headers })
    },
  })
  const inspected = await consentClient.inspect(ticket)
  const redirect = new URL(await consentClient.approve(ticket, inspected))
  const tokenRes = await rawHttpRequest(port, {
    method: "POST",
    path: "/oauth/token",
    headers: {
      host: hostHeader,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code: redirect.searchParams.get("code") ?? "",
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource: `${origin}/mcp`,
    }).toString(),
  })
  assert.equal(tokenRes.status, 200)
  const accessToken = (JSON.parse(tokenRes.body) as { access_token: string })
    .access_token

  const client = new Client({ name: "tcp-sdk-client", version: "1.0.0" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      authProvider: { token: () => Promise.resolve(accessToken) },
      fetch: transportFetch,
    }),
  )

  try {
    const created = (
      await client.callTool({
        name: "create_game_draft",
        arguments: createInput("TCP loopback draft"),
      })
    ).structuredContent as { ok: boolean; data: { draftId: string } }
    assert.equal(created.ok, true)

    const abortedReq = http.request({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/mcp",
      headers: {
        host: hostHeader,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
    })
    abortedReq.on("error", () => undefined)
    abortedReq.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 77,
        method: "tools/call",
        params: {
          name: "get_game_draft",
          arguments: {
            contractVersion: "0.1.0",
            draftId: created.data.draftId,
          },
        },
      }),
    )
    await abortCheckDone
    abortedReq.destroy()

    const pendingSave = (
      await client.callTool({
        name: "save_game",
        arguments: {
          contractVersion: "0.1.0",
          draftId: created.data.draftId,
          expectedRevision: 1,
          intent: "createNew",
          idempotencyKey: key(),
        },
      })
    ).structuredContent as {
      ok: boolean
      error: { code: string; consentRequestId: string; consentUrl: string }
    }
    assert.equal(pendingSave.error.code, "CONSENT_REQUIRED")
    const reqUrl = new URL(pendingSave.error.consentUrl)
    const id = nativeSaveRequestIdFromPath(reqUrl.pathname)
    assert.equal(id, pendingSave.error.consentRequestId)
    assert.ok(id)

    const saveClient = createNativeSaveConsentClient({
      issuerBasePath: "/oauth",
      accountId: f.sessions[0].owner,
      getNativeToken: () => f.sessions[0].token,
      request: (path, init) => {
        const headers = new Headers(init?.headers)
        headers.set("origin", origin)

        return transportFetch(path, { ...init, headers })
      },
    })
    const saveInspect = await saveClient.inspect(id)
    assert.equal(saveInspect.state, "pending")
    const saveApproved = await saveClient.approve(id, saveInspect)
    assert.equal(saveApproved.state, "approved")
  } finally {
    await client.close()
  }

  await listener.close()
  assert.equal(abortObserved, true)
  const afterClose = await service.fetch(
    new Request(`${origin}/oauth/jwks.json`, {
      headers: { host: hostHeader },
    }),
  )
  assert.equal(afterClose.status, 503)
})
