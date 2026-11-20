import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto"
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import { createFirstPartyOAuth } from "../../first-party/oauth.ts"
import type { PackageAuthoringPort } from "../../server/package-authoring.ts"
import { ToolError } from "../../server/errors.ts"
import { fixture, origin, key, type Session } from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
let issuer: Awaited<ReturnType<typeof createFirstPartyOAuth>>
const clientId = "synthetic-package-authoring-client"
const callback = "https://host.example.invalid/package/callback"
const allScopes = [
  "tadazz.catalog.read",
  "tadazz.drafts.read",
  "tadazz.drafts.write",
  "tadazz.library.write",
  "tadazz.exports.read",
]
const config = {
  issuer: origin + "/oauth",
  resource: origin + "/mcp",
  resourceMetadataUrl: origin + "/.well-known/oauth-protected-resource/mcp",
  firstPartyOrigins: [origin],
}

before(async () => {
  f = await fixture()
  const pair = generateKeyPairSync("ed25519")
  issuer = await createFirstPartyOAuth({
    config,
    configRoot: f.root,
    keyId: "synthetic-package-key",
    signingPrivateKeyPem: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    ticketEncryptionKey: randomBytes(32),
    consentPageUrl: origin + "/studio/oauth-consent",
    clients: [{ clientId, redirectUris: [callback], scopes: allScopes }],
  })
})
after(() => f?.close())

function api(route: string, body?: Record<string, string>, session?: Session) {
  const firstParty = route === "/oauth/inspect" || route === "/oauth/approve"

  return issuer.fetch(
    new Request(origin + route, {
      method: body ? "POST" : "GET",
      headers: {
        host: new URL(origin).host,
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
        ...(body
          ? {
              "content-type": firstParty
                ? "application/json"
                : "application/x-www-form-urlencoded",
            }
          : {}),
        ...(firstParty ? { origin } : {}),
      },
      ...(body
        ? {
            body: firstParty ? JSON.stringify(body) : new URLSearchParams(body),
          }
        : {}),
    }),
  )
}

/** Actual synthetic manager consent, PKCE exchange and issuer verification. */
async function linked(session = f.sessions[0], scopes = allScopes) {
  const verifier = randomBytes(32).toString("base64url")
  const started = await api(
    "/oauth/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: callback,
        resource: config.resource,
        scope: scopes.join(" "),
        state: key(),
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }),
  )
  assert.equal(started.status, 302)
  const location = started.headers.get("location")
  assert(location)
  const ticket = new URL(location).searchParams.get("oauth_request")
  assert(ticket)
  const inspected = await api("/oauth/inspect", { ticket }, session)
  assert.equal(inspected.status, 200)
  const inspection = await inspected.json()
  const allowed = await api(
    "/oauth/approve",
    {
      ticket,
      decision: "allow",
      proof: inspection.proof,
    },
    session,
  )
  assert.equal(allowed.status, 200)
  const approval = await allowed.json()
  const code = new URL(approval.redirectUrl).searchParams.get("code")
  assert(code)
  const exchanged = await api("/oauth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: callback,
    resource: config.resource,
    code,
    code_verifier: verifier,
  })
  assert.equal(exchanged.status, 200)
  const tokens = (await exchanged.json()) as {
    access_token: string
    refresh_token: string
  }

  return {
    tokens,
    principal: await issuer.verifyAccessToken(tokens.access_token),
  }
}

async function revoke(refresh: string) {
  assert.equal(
    (
      await api("/oauth/revoke", {
        client_id: clientId,
        token: refresh,
        token_type_hint: "refresh_token",
      })
    ).status,
    200,
  )
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

function packageStatus(uploadId: string) {
  return {
    uploadId,
    packageId: "synthetic-owned-package",
    version: "1.0.0",
    title: "Synthetic owned package",
    phase: "validated",
    revision: 1,
    sourceDigest: "a".repeat(64),
    buildDigest: null,
    reviewed: false,
    contents: [{ id: "synthetic-game", kind: "game" }],
    installedGameIds: [],
  }
}

test("real issuer and SDK derive each package owner from the verified account", async () => {
  const a = await linked()
  const b = await linked(f.sessions[1])
  const uploads = new Map([
    [f.sessions[0].owner, key()],
    [f.sessions[1].owner, key()],
  ])
  const seen: string[] = []
  const adapter: PackageAuthoringPort = {
    async call(p, name, input) {
      assert.equal(name, "get_package_status")
      seen.push(p.accountId)
      if (
        !("uploadId" in input) ||
        uploads.get(p.accountId) !== input.uploadId
      ) {
        throw new ToolError("NOT_FOUND")
      }

      return { data: packageStatus(input.uploadId) }
    },
  }
  const remote = issuer.remote({
    allowedOrigins: [],
    dependencies: {
      packages: issuer.packages(adapter),
      rateLimit: async () => true,
    },
  })
  async function connect(token: string) {
    const client = new Client({ name: "package-authority-qa", version: "1" })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.resource), {
        authProvider: { token: async () => token },
        fetch: async (input, init) => {
          const request = new Request(input, init)
          request.headers.set("host", new URL(config.resource).host)

          return remote.fetch(request)
        },
      }),
    )

    return client
  }
  const clientA = await connect(a.tokens.access_token)
  const clientB = await connect(b.tokens.access_token)
  async function call(client: Client, uploadId: string, extra = {}) {
    return (
      await client.callTool({
        name: "get_package_status",
        arguments: { contractVersion: "0.1.0", uploadId, ...extra },
      })
    ).structuredContent as {
      ok: boolean
      data?: { uploadId: string }
      error?: { code: string }
    }
  }

  try {
    const ownA = uploads.get(f.sessions[0].owner)!
    const ownB = uploads.get(f.sessions[1].owner)!
    assert.equal((await call(clientA, ownA)).data?.uploadId, ownA)
    assert.equal((await call(clientB, ownB)).data?.uploadId, ownB)
    assert.equal((await call(clientB, ownA)).error?.code, "NOT_FOUND")
    const count = seen.length
    await assert.rejects(
      call(clientA, ownA, {
        accountId: f.sessions[1].owner,
      }),
      /Invalid tool request/u,
    )
    assert.equal(seen.length, count)
    assert.deepEqual(seen, [
      f.sessions[0].owner,
      f.sessions[1].owner,
      f.sessions[1].owner,
    ])
  } finally {
    await Promise.all([clientA.close(), clientB.close()])
    await remote.close()
  }
})

test("a copied or forged principal cannot enter the package adapter", async () => {
  const { principal: p } = await linked()
  let calls = 0
  const port = issuer.packages({
    async call() {
      calls++

      return { data: { items: [] } }
    },
  })
  for (const forged of [
    { ...p },
    { ...p, accountId: f.sessions[1].owner },
    { ...p, subject: key() },
    { ...p, grantId: key() },
  ]) {
    await assert.rejects(
      port.call(forged, "list_packages", {
        contractVersion: "0.1.0",
      }),
      /SCOPE_REQUIRED/u,
    )
  }
  assert.equal(calls, 0)
})

test("genuine read-only authority cannot upload or request account installation", async () => {
  const { principal: p } = await linked(f.sessions[0], ["tadazz.drafts.read"])
  let calls = 0
  const port = issuer.packages({
    async call() {
      calls++
      throw new Error("write adapter must not be called")
    },
  })
  await assert.rejects(
    port.call(p, "begin_package_upload", {
      contractVersion: "0.1.0",
      filename: "synthetic.tadazz",
      totalBytes: 22,
      sha256: "a".repeat(64),
      idempotencyKey: key(),
    }),
    /SCOPE_REQUIRED/u,
  )
  await assert.rejects(
    port.call(p, "install_package", {
      contractVersion: "0.1.0",
      uploadId: key(),
      expectedRevision: 1,
      selectedContentIds: ["synthetic-game"],
      idempotencyKey: key(),
    }),
    /SCOPE_REQUIRED/u,
  )
  assert.equal(calls, 0)
})

test("grant revocation while a package call awaits prevents its result from escaping", async () => {
  const linkedAccount = await linked()
  const entered = deferred()
  const gate = deferred()
  let calls = 0
  const port = issuer.packages({
    async call() {
      calls++
      entered.resolve()
      await gate.promise

      return { data: { items: [] } }
    },
  })
  const pending = port.call(linkedAccount.principal, "list_packages", {
    contractVersion: "0.1.0",
  })
  // Attach the rejection observer before releasing asynchronous adapter work.
  const rejected = assert.rejects(pending, /SCOPE_REQUIRED/u)
  await entered.promise
  await revoke(linkedAccount.tokens.refresh_token)
  gate.resolve()
  await rejected
  assert.equal(calls, 1)
})

test("revoked authority cannot replay an earlier package mutation or reach cached native data", async () => {
  const linkedAccount = await linked()
  const transferId = key()
  const input = {
    contractVersion: "0.1.0" as const,
    filename: "synthetic.tadazz",
    totalBytes: 22,
    sha256: "a".repeat(64),
    idempotencyKey: key(),
  }
  let calls = 0
  const port = issuer.packages({
    async call() {
      calls++

      return {
        data: {
          transferId,
          totalBytes: 22,
          receivedBytes: 0,
          chunkBytes: 24_000,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }
    },
  })
  await port.call(linkedAccount.principal, "begin_package_upload", input)
  await revoke(linkedAccount.tokens.refresh_token)
  await assert.rejects(
    port.call(linkedAccount.principal, "begin_package_upload", input),
    /SCOPE_REQUIRED/u,
  )
  await assert.rejects(
    issuer.verifyAccessToken(linkedAccount.tokens.access_token),
    /SCOPE_REQUIRED/u,
  )
  assert.equal(calls, 1)
})
