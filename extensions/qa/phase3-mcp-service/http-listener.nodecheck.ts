import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto"
import http from "node:http"
import net from "node:net"
import { Duplex, PassThrough } from "node:stream"
import { after, before, test } from "node:test"
import { Client, StreamableHTTPClientTransport } from "./mcp-client.ts"
import { createOAuthConsentClient } from "../../src/components/oauth-consent/client.ts"
import {
  createNativeSaveConsentClient,
  nativeSaveRequestIdFromPath,
} from "../../src/components/native-save-consent/client.ts"
import {
  createPrincipalRateLimiter,
  createProtectedMcpNodeListener,
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

    const pendingSaveResponse = await client.callTool({
      name: "save_game",
      arguments: {
        contractVersion: "0.1.0",
        draftId: created.data.draftId,
        expectedRevision: 1,
        intent: "createNew",
        idempotencyKey: key(),
      },
    })
    const pendingSave = pendingSaveResponse.structuredContent as {
      ok: boolean
      error: { code: string; consentRequestId: string; consentUrl: string }
    }
    assert.equal(pendingSave.error.code, "CONSENT_REQUIRED")
    // ChatGPT's error transport may discard structuredContent. The trusted
    // consent link must also survive in its text-only tool error.
    const approvalText = pendingSaveResponse.content.find(
      (item) => item.type === "text",
    )
    assert.ok(approvalText && approvalText.type === "text")
    assert.deepEqual(JSON.parse(approvalText.text), {
      ok: false,
      code: "CONSENT_REQUIRED",
      consentRequestId: pendingSave.error.consentRequestId,
      consentUrl: pendingSave.error.consentUrl,
    })
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

function resolveRequestUrl(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === "string") {
    return new URL(input, origin)
  }

  if (input instanceof URL) {
    return input
  }

  return new URL(input.url)
}

function createBackpressureSocket(holdAfterBytes = 1) {
  const chunks: Buffer[] = []
  let writtenBytes = 0
  let paused = false
  let pendingCallback: ((error?: Error | null) => void) | null = null
  let notifyPaused: (() => void) | null = null
  const pausedPromise = new Promise<void>((resolve) => {
    notifyPaused = resolve
  })

  const socket = new Duplex({
    highWaterMark: 16,
    read() {
      return undefined
    },
    write(chunk: Buffer | string, _encoding, callback) {
      const part = typeof chunk === "string" ? Buffer.from(chunk) : chunk
      chunks.push(part)
      writtenBytes += part.byteLength

      if (!paused && writtenBytes >= holdAfterBytes) {
        paused = true
        pendingCallback = callback
        notifyPaused?.()

        return
      }

      callback()
    },
    destroy(error, callback) {
      const pending = pendingCallback
      pendingCallback = null
      pending?.(error ?? undefined)
      callback(error)
    },
  })
  socket.on("error", () => undefined)

  return {
    socket,
    pausedPromise,
    getBytes: () => Buffer.concat(chunks).byteLength,
    release() {
      const pending = pendingCallback
      pendingCallback = null
      pending?.()
    },
  }
}

function sendRawTcpAndRead(port: number, payload: string, timeoutMs = 2000) {
  return new Promise<{ raw: string; closed: boolean; errorCode?: string }>(
    (resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
        socket.write(payload)
      })
      const chunks: Buffer[] = []
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          socket.destroy()
          resolve({
            raw: Buffer.concat(chunks).toString("utf8"),
            closed: false,
            errorCode: "TEST_TIMEOUT",
          })
        }
      }, timeoutMs)
      const finish = (closed: boolean, errorCode?: string) => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timer)
        resolve({
          raw: Buffer.concat(chunks).toString("utf8"),
          closed,
          errorCode,
        })
      }
      socket.on("data", (chunk: Buffer) => chunks.push(chunk))
      socket.on("end", () => finish(true))
      socket.on("close", () => finish(true))
      socket.on("error", (err: NodeJS.ErrnoException) => finish(true, err.code))
    },
  )
}

test("enforces bounded body pull, clean 413 on chunked >64KiB, listener teardown, and 204 without Content-Length", async () => {
  const f = getFixture()
  const hostHeader = new URL(origin).host
  const allowedOrigin = "https://chat.example.invalid"
  const service = await createProtectedMcpService({
    enabled: true,
    config: {
      issuer: `${origin}/oauth`,
      resource: `${origin}/mcp`,
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
      firstPartyOrigins: [origin],
    },
    configRoot: f.root,
    consentPageUrl: `${origin}/studio/oauth-consent`,
    keyId: "body-stream-and-204-key",
    signingPrivateKeyPem: signingPem,
    ticketEncryptionKey: ticketKey,
    clients: [{ clientId, redirectUris: [redirectUri], scopes }],
    allowedOrigins: [allowedOrigin],
    authoring: policy,
    rateLimit: async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 40)
      })

      return true
    },
  })
  const listener = await listenProtectedMcpHttpServer(service, { port: 0 })
  activeClosers.push(() => listener.close())
  const { port } = listener

  const preflightRaw = await sendRawTcpAndRead(
    port,
    `OPTIONS /mcp HTTP/1.1\r\nHost: ${hostHeader}\r\nOrigin: ${allowedOrigin}\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: authorization, content-type\r\nConnection: close\r\n\r\n`,
  )
  const [preflightHeaders] = preflightRaw.raw.split("\r\n\r\n")
  assert.match(preflightHeaders, /^HTTP\/1\.1 204 /u)
  assert.equal(/^content-length:/imu.test(preflightHeaders), false)

  const oversizedChunk = "a".repeat(70_000)
  const chunkHex = oversizedChunk.length.toString(16)
  const oauthChunked = await sendRawTcpAndRead(
    port,
    `POST /oauth/token HTTP/1.1\r\nHost: ${hostHeader}\r\nContent-Type: application/x-www-form-urlencoded\r\nTransfer-Encoding: chunked\r\n\r\n${chunkHex}\r\n${oversizedChunk}\r\n0\r\n\r\n`,
  )
  assert.match(oauthChunked.raw, /^HTTP\/1\.1 413 /u)
  assert.match(oauthChunked.raw, /^connection:\s*close/imu)

  const verifier = randomBytes(32).toString("base64url")
  const authorize = await rawHttpRequest(port, {
    method: "GET",
    path: `/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      resource: `${origin}/mcp`,
      scope: scopes.join(" "),
      state: randomBytes(24).toString("base64url"),
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    })}`,
    headers: { host: hostHeader },
  })
  const ticket =
    new URL(authorize.headers.location ?? "").searchParams.get(
      "oauth_request",
    ) ?? ""
  const consentClient = createOAuthConsentClient({
    issuerBasePath: "/oauth",
    getNativeToken: () => f.sessions[0].token,
    request: async (path, init) => {
      const headers: Record<string, string> = { host: hostHeader, origin }
      new Headers(init?.headers).forEach((value, name) => {
        headers[name] = value
      })
      const body = typeof init?.body === "string" ? init.body : undefined
      const res = await rawHttpRequest(port, {
        method: init?.method ?? "GET",
        path: resolveRequestUrl(path).pathname + resolveRequestUrl(path).search,
        headers,
        body,
      })

      return new Response(res.body || null, {
        status: res.status,
        headers: res.headers as Record<string, string>,
      })
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
  const accessToken = (JSON.parse(tokenRes.body) as { access_token: string })
    .access_token

  const mcpChunked = await sendRawTcpAndRead(
    port,
    `POST /mcp HTTP/1.1\r\nHost: ${hostHeader}\r\nAuthorization: Bearer ${accessToken}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n${chunkHex}\r\n${oversizedChunk}\r\n0\r\n\r\n`,
  )
  assert.match(mcpChunked.raw, /^HTTP\/1\.1 413 /u)

  const nodeListener = createProtectedMcpNodeListener(service)
  const socketIn = new PassThrough()
  const socketOut = new PassThrough()
  const req = new http.IncomingMessage(socketIn as unknown as net.Socket)
  req.method = "POST"
  req.url = "/mcp"
  req.rawHeaders = [
    "Host",
    hostHeader,
    "Content-Type",
    "application/json",
    "Transfer-Encoding",
    "chunked",
  ]
  const res = new http.ServerResponse(req)
  res.assignSocket(socketOut as unknown as net.Socket)
  const resDone = new Promise<void>((resolve) => {
    res.once("finish", () => resolve())
    res.once("close", () => resolve())
  })
  req.push(Buffer.from('{"hello":"world"}'))
  nodeListener(req, res)
  await resDone
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(res.statusCode, 401)
  assert.notEqual(req.readableFlowing, true)
  assert.equal(req.listenerCount("data"), 0)
  assert.equal(req.listenerCount("end"), 0)
  assert.equal(req.listenerCount("error"), 0)
  assert.equal(req.listenerCount("aborted"), 0)

  let inspectedPausedBeforeRead: boolean | null = null
  let pulledStreamBody: ReadableStream<Uint8Array> | null = null
  const customPullService: ProtectedMcpService = {
    enabled: true,
    config: service.config,
    supportedScopes: service.supportedScopes,
    isClosed: () => false,
    async fetch(request) {
      inspectedPausedBeforeRead = reqPull.isPaused()
      pulledStreamBody = request.body
      const reader = pulledStreamBody?.getReader()
      assert.ok(reader)
      const first = await reader.read()
      assert.equal(first.done, false)
      const pausedBetweenChunks = reqPull.isPaused()
      assert.equal(pausedBetweenChunks, true)
      await reader.cancel()

      return Response.json({ ok: true }, { status: 200 })
    },
    drain: () => Promise.resolve(undefined),
    close: () => Promise.resolve(undefined),
  }
  const customListener = createProtectedMcpNodeListener(customPullService)
  const pullIn = new PassThrough()
  const pullOut = new PassThrough()
  const reqPull = new http.IncomingMessage(pullIn as unknown as net.Socket)
  reqPull.method = "POST"
  reqPull.url = "/mcp"
  reqPull.rawHeaders = [
    "Host",
    hostHeader,
    "Content-Type",
    "application/json",
    "Transfer-Encoding",
    "chunked",
  ]
  const resPull = new http.ServerResponse(reqPull)
  resPull.assignSocket(pullOut as unknown as net.Socket)
  const pullResDone = new Promise<void>((resolve) => {
    resPull.once("finish", () => resolve())
    resPull.once("close", () => resolve())
  })
  reqPull.push(Buffer.from('{"a":1}'))
  reqPull.push(Buffer.from('{"b":2}'))
  reqPull.push(null)
  customListener(reqPull, resPull)
  await pullResDone
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(resPull.statusCode, 200)
  assert.equal(inspectedPausedBeforeRead, true)
  assert.equal(reqPull.listenerCount("data"), 0)
  assert.equal(reqPull.listenerCount("end"), 0)
  assert.equal(reqPull.listenerCount("error"), 0)
  assert.equal(reqPull.listenerCount("aborted"), 0)
})

test("bounds TCP response deadlines, slow readers in drain(), pre-header sockets, and maxConnections", async () => {
  const f = getFixture()
  const hostHeader = new URL(origin).host
  const largeHtml = `<!doctype html><html><body>${"x".repeat(1_500_000)}</body></html>`
  const largeHtmlHash = createHash("sha256").update(largeHtml).digest("hex")
  let slowDelayMs = 0

  const service = await createProtectedMcpService({
    enabled: true,
    config: {
      issuer: `${origin}/oauth`,
      resource: `${origin}/mcp`,
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
      firstPartyOrigins: [origin],
    },
    configRoot: f.root,
    consentPageUrl: `${origin}/studio/oauth-consent`,
    keyId: "tcp-deadlines-key",
    signingPrivateKeyPem: signingPem,
    ticketEncryptionKey: ticketKey,
    clients: [{ clientId, redirectUris: [redirectUri], scopes }],
    allowedOrigins: [],
    authoring: policy,
    rateLimit: async () => {
      if (slowDelayMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, slowDelayMs)
        })
      }

      return true
    },
    previewUiResource: {
      html: largeHtml,
      sha256: largeHtmlHash,
      csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
      canServe: () => true,
    },
  })

  const listener = await listenProtectedMcpHttpServer(service, {
    port: 0,
    responseTimeoutMs: 5000,
  })
  activeClosers.push(() => listener.close())
  assert.ok(
    typeof listener.server.maxConnections === "number" &&
      listener.server.maxConnections > 0,
    `Expected finite server.maxConnections, got ${String(listener.server.maxConnections)}`,
  )
  assert.ok(
    listener.server.timeout > 0,
    `Expected positive server.timeout, got ${listener.server.timeout}`,
  )

  const verifier = randomBytes(32).toString("base64url")
  const authorize = await rawHttpRequest(listener.port, {
    method: "GET",
    path: `/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      resource: `${origin}/mcp`,
      scope: scopes.join(" "),
      state: randomBytes(24).toString("base64url"),
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    })}`,
    headers: { host: hostHeader },
  })
  const ticket =
    new URL(authorize.headers.location ?? "").searchParams.get(
      "oauth_request",
    ) ?? ""
  const consentClient = createOAuthConsentClient({
    issuerBasePath: "/oauth",
    getNativeToken: () => f.sessions[0].token,
    request: async (path, init) => {
      const headers: Record<string, string> = { host: hostHeader, origin }
      new Headers(init?.headers).forEach((value, name) => {
        headers[name] = value
      })
      const body = typeof init?.body === "string" ? init.body : undefined
      const res = await rawHttpRequest(listener.port, {
        method: init?.method ?? "GET",
        path: resolveRequestUrl(path).pathname + resolveRequestUrl(path).search,
        headers,
        body,
      })

      return new Response(res.body || null, {
        status: res.status,
        headers: res.headers as Record<string, string>,
      })
    },
  })
  const inspected = await consentClient.inspect(ticket)
  const redirect = new URL(await consentClient.approve(ticket, inspected))
  const tokenRes = await rawHttpRequest(listener.port, {
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
  const accessToken = (JSON.parse(tokenRes.body) as { access_token: string })
    .access_token

  const largeReqBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "resources/read",
    params: { uri: "ui://tadazz/quiz-preview/v1.html" },
  })
  const tcpCloseStart = Date.now()
  const tcpCloseRaw = await sendRawTcpAndRead(
    listener.port,
    `POST /mcp HTTP/1.1\r\nHost: ${hostHeader}\r\nAuthorization: Bearer ${accessToken}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nContent-Length: ${Buffer.byteLength(largeReqBody)}\r\nConnection: close\r\n\r\n${largeReqBody}`,
    1500,
  )
  const tcpCloseMs = Date.now() - tcpCloseStart
  const [tcpCloseHeaders] = tcpCloseRaw.raw.split("\r\n\r\n")
  assert.equal(tcpCloseRaw.closed, true)
  assert.equal(tcpCloseRaw.errorCode, undefined)
  assert.match(tcpCloseHeaders, /^HTTP\/1\.1 200 /u)
  assert.equal(/^connection:\s*keep-alive/imu.test(tcpCloseHeaders), false)
  assert.ok(
    tcpCloseMs < 1200,
    `Expected prompt Connection: close EOF, got ${tcpCloseMs}ms`,
  )
  assert.ok(Buffer.byteLength(tcpCloseRaw.raw, "utf8") > 1_500_000)

  const directNodeListener = createProtectedMcpNodeListener(service)
  const barrier = createBackpressureSocket()
  const slowReqIn = new PassThrough()
  const slowReq = new http.IncomingMessage(slowReqIn as unknown as net.Socket)
  slowReq.method = "POST"
  slowReq.url = "/mcp"
  slowReq.rawHeaders = [
    "Host",
    hostHeader,
    "Authorization",
    `Bearer ${accessToken}`,
    "Content-Type",
    "application/json",
    "Accept",
    "application/json, text/event-stream",
    "Content-Length",
    String(Buffer.byteLength(largeReqBody)),
    "Connection",
    "close",
  ]
  const slowRes = new http.ServerResponse(slowReq)
  slowRes.assignSocket(barrier.socket as unknown as net.Socket)
  const slowResSettled = new Promise<void>((resolve) => {
    slowRes.once("finish", () => resolve())
    slowRes.once("close", () => resolve())
  })
  slowReq.complete = true
  slowReq.push(Buffer.from(largeReqBody))
  slowReq.push(null)
  directNodeListener(slowReq, slowRes)
  await barrier.pausedPromise

  let drainedWhilePaused = false
  const draining = service.drain().then(() => {
    drainedWhilePaused = true
  })
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 60)
  })
  assert.equal(drainedWhilePaused, false)
  assert.equal(slowRes.writableFinished, false)
  assert.equal(slowRes.statusCode, 200)

  barrier.release()
  await slowResSettled
  await draining
  assert.equal(drainedWhilePaused, true)
  assert.ok(barrier.getBytes() > 1_500_000)

  const tightListener = await listenProtectedMcpHttpServer(service, {
    port: 0,
    responseTimeoutMs: 150,
  })
  activeClosers.push(() => tightListener.close())

  slowDelayMs = 450
  const slowHandlerStarted = Date.now()
  const slowHandlerBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "list_themes", arguments: { contractVersion: "0.1.0" } },
  })
  const slowHandlerRes = await rawHttpRequest(tightListener.port, {
    method: "POST",
    path: "/mcp",
    headers: {
      host: hostHeader,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "content-length": String(Buffer.byteLength(slowHandlerBody)),
    },
    body: slowHandlerBody,
  })
  const slowHandlerMs = Date.now() - slowHandlerStarted
  slowDelayMs = 0
  assert.equal(slowHandlerRes.status, 504)
  assert.ok(
    slowHandlerMs < 400,
    `Expected < 400ms post-end deadline, got ${slowHandlerMs}ms`,
  )

  const idleSocketStart = Date.now()
  const idleClosedMs = await new Promise<number>((resolve, reject) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port: tightListener.port,
    })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error("0-byte pre-header socket did not close on timeout"))
    }, 600)
    socket.on("close", () => {
      clearTimeout(timer)
      resolve(Date.now() - idleSocketStart)
    })
    socket.on("error", () => undefined)
  })
  assert.ok(idleClosedMs < 450)

  const partialHeaderStart = Date.now()
  const partialClosedMs = await new Promise<number>((resolve, reject) => {
    const socket = net.createConnection(
      { host: "127.0.0.1", port: tightListener.port },
      () => {
        socket.write(`GET /oauth/jwks.json HTTP/1.1\r\nHost: ${hostHeader}\r\n`)
      },
    )
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error("Partial-header socket did not close on timeout"))
    }, 600)
    socket.on("close", () => {
      clearTimeout(timer)
      resolve(Date.now() - partialHeaderStart)
    })
    socket.on("error", () => undefined)
  })
  assert.ok(partialClosedMs < 450)

  const tightDirectListener = createProtectedMcpNodeListener(service, {
    responseTimeoutMs: 150,
  })
  const stalledWriteBarrier = createBackpressureSocket()
  const stalledWriteIn = new PassThrough()
  const stalledWriteReq = new http.IncomingMessage(
    stalledWriteIn as unknown as net.Socket,
  )
  stalledWriteReq.method = "POST"
  stalledWriteReq.url = "/mcp"
  stalledWriteReq.rawHeaders = [
    "Host",
    hostHeader,
    "Authorization",
    `Bearer ${accessToken}`,
    "Content-Type",
    "application/json",
    "Accept",
    "application/json, text/event-stream",
    "Content-Length",
    String(Buffer.byteLength(largeReqBody)),
    "Connection",
    "close",
  ]
  const stalledWriteRes = new http.ServerResponse(stalledWriteReq)
  stalledWriteRes.assignSocket(
    stalledWriteBarrier.socket as unknown as net.Socket,
  )
  const stalledWriteSettled = new Promise<void>((resolve) => {
    stalledWriteRes.once("finish", () => resolve())
    stalledWriteRes.once("close", () => resolve())
  })
  const stalledWriteStart = Date.now()
  stalledWriteReq.complete = true
  stalledWriteReq.push(Buffer.from(largeReqBody))
  stalledWriteReq.push(null)
  tightDirectListener(stalledWriteReq, stalledWriteRes)
  await stalledWriteBarrier.pausedPromise
  await stalledWriteSettled
  await service.drain()
  const stalledWriteMs = Date.now() - stalledWriteStart
  stalledWriteBarrier.release()
  assert.equal(stalledWriteRes.statusCode, 200)
  assert.ok(
    stalledWriteMs >= 100 && stalledWriteMs < 500,
    `Expected ~150ms write timeout drain, got ${stalledWriteMs}ms`,
  )
  assert.equal(stalledWriteRes.writableFinished, false)
  assert.equal(stalledWriteRes.destroyed, true)
  assert.ok(stalledWriteBarrier.getBytes() < 1_500_000)

  const cappedListener = await listenProtectedMcpHttpServer(service, {
    port: 0,
    maxConnections: 2,
    responseTimeoutMs: 5000,
  })
  activeClosers.push(() => cappedListener.close())
  const held1 = net.createConnection({
    host: "127.0.0.1",
    port: cappedListener.port,
  })
  const held2 = net.createConnection({
    host: "127.0.0.1",
    port: cappedListener.port,
  })
  await Promise.all([
    new Promise<void>((r) => {
      held1.once("connect", () => r())
    }),
    new Promise<void>((r) => {
      held2.once("connect", () => r())
    }),
  ])
  const thirdAttempt = await sendRawTcpAndRead(
    cappedListener.port,
    `GET /oauth/jwks.json HTTP/1.1\r\nHost: ${hostHeader}\r\nConnection: close\r\n\r\n`,
    500,
  )
  assert.equal(thirdAttempt.raw.includes("200 OK"), false)
  held1.destroy()
  held2.destroy()
})

test("enforces 32-slot admission across backpressured writes and returns 504 on response-stream deadline", async () => {
  const f = getFixture()
  const hostHeader = new URL(origin).host
  const largeHtml = `<!doctype html><html><body>${"y".repeat(1_500_000)}</body></html>`
  const service = await createProtectedMcpService({
    enabled: true,
    config: {
      issuer: `${origin}/oauth`,
      resource: `${origin}/mcp`,
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
      firstPartyOrigins: [origin],
    },
    configRoot: f.root,
    consentPageUrl: `${origin}/studio/oauth-consent`,
    keyId: "backpressure-budget-key",
    signingPrivateKeyPem: signingPem,
    ticketEncryptionKey: ticketKey,
    clients: [{ clientId, redirectUris: [redirectUri], scopes }],
    allowedOrigins: [],
    authoring: policy,
    rateLimit: createPrincipalRateLimiter({ readsPerMinute: 120 }),
    previewUiResource: {
      html: largeHtml,
      sha256: createHash("sha256").update(largeHtml).digest("hex"),
      csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
      canServe: () => true,
    },
  })
  activeClosers.push(() => service.close())

  const verifier = randomBytes(32).toString("base64url")
  const authorize = await service.fetch(
    new Request(
      `${origin}/oauth/authorize?${new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        resource: `${origin}/mcp`,
        scope: scopes.join(" "),
        state: randomBytes(24).toString("base64url"),
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }).toString()}`,
      { headers: { host: hostHeader } },
    ),
  )
  const ticket =
    new URL(authorize.headers.get("location") ?? "").searchParams.get(
      "oauth_request",
    ) ?? ""
  const consentClient = createOAuthConsentClient({
    issuerBasePath: "/oauth",
    getNativeToken: () => f.sessions[0].token,
    request: (path, init) => {
      const headers = new Headers(init?.headers)
      headers.set("host", hostHeader)
      headers.set("origin", origin)

      return service.fetch(
        new Request(resolveRequestUrl(path).href, { ...init, headers }),
      )
    },
  })
  const inspected = await consentClient.inspect(ticket)
  const redirect = new URL(await consentClient.approve(ticket, inspected))
  const tokenRes = await service.fetch(
    new Request(`${origin}/oauth/token`, {
      method: "POST",
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
    }),
  )
  const accessToken = ((await tokenRes.json()) as { access_token: string })
    .access_token

  const directListener = createProtectedMcpNodeListener(service)
  const reqBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "resources/read",
    params: { uri: "ui://tadazz/quiz-preview/v1.html" },
  })
  const barriers = Array.from({ length: 32 }, () => createBackpressureSocket())
  const barrierResponses: http.ServerResponse[] = []
  const settledAll = barriers.map((barrier) => {
    const reqIn = new PassThrough()
    const req = new http.IncomingMessage(reqIn as unknown as net.Socket)
    req.method = "POST"
    req.url = "/mcp"
    req.rawHeaders = [
      "Host",
      hostHeader,
      "Authorization",
      `Bearer ${accessToken}`,
      "Content-Type",
      "application/json",
      "Accept",
      "application/json, text/event-stream",
      "Content-Length",
      String(Buffer.byteLength(reqBody)),
    ]
    const res = new http.ServerResponse(req)
    barrierResponses.push(res)
    res.assignSocket(barrier.socket as unknown as net.Socket)
    const done = new Promise<void>((resolve) => {
      res.once("finish", () => resolve())
      res.once("close", () => resolve())
    })
    req.complete = true
    req.push(Buffer.from(reqBody))
    req.push(null)
    directListener(req, res)

    return done
  })
  await Promise.all(barriers.map((barrier) => barrier.pausedPromise))

  const overflowWhileWriting = await service.fetch(
    new Request(`${origin}/oauth/jwks.json`, {
      headers: { host: hostHeader },
    }),
  )
  assert.equal(overflowWhileWriting.status, 429)

  for (const barrier of barriers) {
    barrier.release()
  }

  await Promise.all(settledAll)
  await service.drain()

  for (const res of barrierResponses) {
    assert.equal(res.statusCode, 200)
  }

  const admittedAfterWrites = await service.fetch(
    new Request(`${origin}/oauth/jwks.json`, {
      headers: { host: hostHeader },
    }),
  )
  assert.equal(admittedAfterWrites.status, 200)

  let streamCancelled = false
  const streamTimeoutService: ProtectedMcpService = {
    enabled: true,
    config: service.config,
    supportedScopes: service.supportedScopes,
    isClosed: () => false,
    fetch: () =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("partial"))
            },
            cancel() {
              streamCancelled = true
            },
          }),
          { status: 200 },
        ),
      ),
    drain: () => Promise.resolve(undefined),
    close: () => Promise.resolve(undefined),
  }
  const streamTimeoutListener = createProtectedMcpNodeListener(
    streamTimeoutService,
    { responseTimeoutMs: 100 },
  )
  const streamOutChunks: Buffer[] = []
  const streamIn = new PassThrough()
  const streamOut = new PassThrough()
  streamOut.on("data", (chunk: Buffer) => streamOutChunks.push(chunk))
  const streamReq = new http.IncomingMessage(streamIn as unknown as net.Socket)
  streamReq.method = "GET"
  streamReq.url = "/oauth/jwks.json"
  streamReq.rawHeaders = ["Host", hostHeader]
  const streamRes = new http.ServerResponse(streamReq)
  streamRes.assignSocket(streamOut as unknown as net.Socket)
  const streamResDone = new Promise<void>((resolve) => {
    streamRes.once("finish", () => resolve())
    streamRes.once("close", () => resolve())
  })
  streamReq.complete = true
  streamReq.push(null)
  streamTimeoutListener(streamReq, streamRes)
  await streamResDone
  assert.equal(streamRes.statusCode, 504)
  assert.equal(streamCancelled, true)
  assert.match(
    Buffer.concat(streamOutChunks).toString("utf8"),
    /^HTTP\/1\.1 504 /u,
  )
})
