import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { preflightShowImport } from "@razzia/extensions/core"
import {
  createFirstPartyOAuth,
  type FirstPartyOAuthOptions,
} from "../../first-party/oauth.ts"
import { createOAuthProtocol } from "../../first-party/oauth-protocol.ts"
import { hashJson } from "../../contracts/canonical.ts"
import {
  fixture,
  origin,
  policy,
  key,
  createInput,
  type Session,
} from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
let issuer: Awaited<ReturnType<typeof createFirstPartyOAuth>>
let remote: ReturnType<
  Awaited<ReturnType<typeof createFirstPartyOAuth>>["remote"]
>
let options: FirstPartyOAuthOptions
let rights = true
let rightsEffect: (() => void) | undefined
const clientId = "synthetic-export-client"
const redirectUri = "https://host.example.invalid/export/callback"
const config = {
  issuer: origin + "/oauth",
  resource: origin + "/mcp",
  resourceMetadataUrl: origin + "/.well-known/oauth-protected-resource/mcp",
  firstPartyOrigins: [origin],
}
const allowed = [
  "tadazz.drafts.read",
  "tadazz.drafts.write",
  "tadazz.exports.read",
]
before(async () => {
  f = await fixture()
  const pair = generateKeyPairSync("ed25519")
  options = {
    config,
    configRoot: f.root,
    keyId: "synthetic-export-issuer",
    signingPrivateKeyPem: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    ticketEncryptionKey: randomBytes(32),
    consentPageUrl: origin + "/studio/oauth-consent",
    clients: [{ clientId, redirectUris: [redirectUri], scopes: allowed }],
    exportPolicy: {
      authoring: policy,
      canExport(context) {
        assert.ok(
          f.sessions.some((session) => session.owner === context.accountId),
        )
        const effect = rightsEffect
        rightsEffect = undefined
        effect?.()
        return rights
      },
    },
  }
  issuer = await createFirstPartyOAuth(options)
  remote = issuer.remote({
    allowedOrigins: [],
    dependencies: {
      authoring: policy,
      drafts: issuer.draftRepository(policy),
      exports: issuer.exports,
      rateLimit: async () => true, // Explicit synthetic host budget, not a production policy.
    },
  })
})
after(async () => {
  await remote?.close()
  f?.close()
})
const sha = (value: string) => createHash("sha256").update(value).digest("hex")
const grantFile = (owner: string) =>
  join(f.root, "tenants", owner, "extensions/mcp-oauth/grants.sqlite")
function api(
  path: string,
  body?: Record<string, string>,
  session?: Session,
  instance = issuer,
) {
  const json = path === "/oauth/inspect" || path === "/oauth/approve"
  return instance.fetch(
    new Request(origin + path, {
      method: body ? "POST" : "GET",
      headers: {
        host: new URL(origin).host,
        ...(session ? { authorization: "Bearer " + session.token } : {}),
        ...(body
          ? {
              "content-type": json
                ? "application/json"
                : "application/x-www-form-urlencoded",
            }
          : {}),
        ...(json ? { origin } : {}),
      },
      ...(body
        ? { body: json ? JSON.stringify(body) : new URLSearchParams(body) }
        : {}),
    }),
  )
}
async function linked(session = f.sessions[0], scopes = allowed) {
  const verifier = randomBytes(32).toString("base64url")
  const response = await api(
    "/oauth/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        resource: config.resource,
        scope: scopes.join(" "),
        state: key(),
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }),
  )
  assert.equal(response.status, 302)
  const ticket = new URL(response.headers.get("location")!).searchParams.get(
    "oauth_request",
  )!
  const inspected = await (
    await api("/oauth/inspect", { ticket }, session)
  ).json()
  const approval = await api(
    "/oauth/approve",
    { ticket, proof: inspected.proof, decision: "allow" },
    session,
  )
  assert.equal(approval.status, 200)
  const approved = await approval.json()
  const code = new URL(approved.redirectUrl).searchParams.get("code")!
  const exchanged = await api("/oauth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    resource: config.resource,
  })
  assert.equal(exchanged.status, 200)
  return { token: (await exchanged.json()).access_token as string, code }
}
let requestId = 0
async function rpc(token: string, name: string, args: unknown) {
  const response = await remote.fetch(
    new Request(config.resource, {
      method: "POST",
      headers: {
        host: new URL(origin).host,
        authorization: "Bearer " + token,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++requestId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  )
  assert.equal(response.status, 200)
  const text = await response.text()
  const wire = response.headers
    .get("content-type")
    ?.startsWith("text/event-stream")
    ? JSON.parse(
        text
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .at(-1)!
          .slice(6),
      )
    : JSON.parse(text)
  return wire.result.structuredContent
}
async function draft(token: string, title = "Synthetic exported draft") {
  const input = createInput(title)
  const result = await rpc(token, "create_game_draft", input)
  assert.equal(result.ok, true, JSON.stringify(result))
  return { ...result.data, input }
}
const exportInput = (
  draftId: string,
  expectedRevision = 1,
  format: "tada-json" | "enhanced-bundle" = "tada-json",
) => ({
  contractVersion: "0.1.0" as const,
  draftId,
  expectedRevision,
  format,
  idempotencyKey: key(),
})
function download(url: string, instance = issuer) {
  return instance.fetch(
    new Request(url, { headers: { host: new URL(origin).host } }),
  )
}

test("real export RPC delivers exact authored bytes with bounded private attachment headers and no GET writes", async () => {
  const grant = await linked()
  const created = await draft(grant.token)
  const result = await rpc(
    grant.token,
    "export_game",
    exportInput(created.draftId),
  )
  assert.equal(result.ok, true, JSON.stringify(result))
  const metadata = result.data
  const path = grantFile(f.sessions[0].owner)
  const before = { bytes: readFileSync(path), mtime: statSync(path).mtimeMs }
  const response = await download(metadata.downloadUrl)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.equal(response.headers.get("referrer-policy"), "no-referrer")
  assert.equal(response.headers.get("x-content-type-options"), "nosniff")
  assert.match(
    response.headers.get("content-disposition")!,
    /^attachment; filename="tadazz-[A-Za-z0-9_-]+\.tada\.json"$/,
  )
  const body = await response.text()
  assert.equal(sha(body), metadata.sha256)
  assert.equal(Buffer.byteLength(body), metadata.bytes)
  assert.equal(response.headers.get("content-length"), String(metadata.bytes))
  const stored = await issuer
    .draftRepository(policy)
    .get(await issuer.verifyAccessToken(grant.token), created.draftId)
  assert.equal(body, stored!.authoredShowJson)
  assert.ok(Date.parse(metadata.expiresAt) <= Date.now() + 60_000)
  assert.ok(
    !metadata.downloadUrl.includes(f.sessions[0].owner) &&
      !metadata.downloadUrl.includes(grant.token),
  )
  assert.deepEqual(readFileSync(path), before.bytes)
  assert.equal(statSync(path).mtimeMs, before.mtime)
  assert.equal(existsSync(path + "-journal"), false)
  assert.equal(
    existsSync(join(f.root, "tenants", f.sessions[0].owner, "quizz")),
    false,
  )
})

test("export replay returns the same exact old snapshot before current draft lookup; changed key payload is denied", async () => {
  const grant = await linked()
  const created = await draft(grant.token, "Before edit")
  const input = exportInput(created.draftId)
  const initial = await rpc(grant.token, "export_game", input)
  assert.equal(initial.ok, true, JSON.stringify(initial))
  const changed = await rpc(grant.token, "update_game_draft", {
    contractVersion: "0.1.0",
    draftId: created.draftId,
    expectedRevision: 1,
    authoredShowJson: createInput("After edit").authoredShowJson,
    idempotencyKey: key(),
  })
  assert.equal(changed.ok, true, JSON.stringify(changed))
  const replay = await rpc(grant.token, "export_game", input)
  assert.deepEqual(replay.data, initial.data)
  assert.equal(
    JSON.parse(await (await download(replay.data.downloadUrl)).text()).title,
    "Before edit",
  )
  assert.equal(
    (await rpc(grant.token, "export_game", { ...input, expectedRevision: 2 }))
      .error.code,
    "REQUEST_KEY_REUSED",
  )
  assert.equal(
    (await rpc(grant.token, "export_game", exportInput(created.draftId))).error
      .code,
    "REVISION_CONFLICT",
  )
})

test("ordinary export needs scopes/owner/rights, with no new per-export consent", async () => {
  const grant = await linked()
  const created = await draft(grant.token)
  const other = await linked(f.sessions[1])
  assert.equal(
    (await rpc(other.token, "export_game", exportInput(created.draftId))).error
      .code,
    "NOT_FOUND",
  )
  const narrow = await linked(f.sessions[0], [
    "tadazz.drafts.read",
    "tadazz.drafts.write",
  ])
  assert.equal(
    (await rpc(narrow.token, "export_game", exportInput(created.draftId))).error
      .code,
    "SCOPE_REQUIRED",
  )
  rights = false
  const before = readFileSync(grantFile(f.sessions[0].owner))
  try {
    assert.equal(
      (await rpc(grant.token, "export_game", exportInput(created.draftId)))
        .error.code,
      "EXPORT_UNAVAILABLE",
    )
  } finally {
    rights = true
  }
  assert.deepEqual(readFileSync(grantFile(f.sessions[0].owner)), before)
})

test("enhanced export uses the existing converter/importer and does not allocate native storage", async () => {
  const grant = await linked()
  const created = await draft(grant.token)
  const exported = await rpc(
    grant.token,
    "export_game",
    exportInput(created.draftId, 1, "enhanced-bundle"),
  )
  assert.equal(exported.ok, true, JSON.stringify(exported))
  const response = await download(exported.data.downloadUrl)
  assert.equal(response.status, 200)
  const body = await response.text()
  const imported = preflightShowImport(body, "synthetic.enhanced.json")
  assert.equal(imported.ok, true)
  assert.ok(imported.normalizedBundleDraft)
  assert.equal(sha(body), exported.data.sha256)
  assert.equal(
    existsSync(join(f.root, "tenants", f.sessions[0].owner, "quizz")),
    false,
  )
})

test("capability delivery rechecks current rights and actual native revocation after the rights callback", async () => {
  const minted = await f.tokens.mintToken(f.sessions[0].owner, "manager")
  const claims = await f.tokens.verifyToken(minted.token)
  const session = {
    token: minted.token,
    owner: f.sessions[0].owner,
    sid: claims.sid!,
  }
  const grant = await linked(session)
  const created = await draft(grant.token)
  const input = exportInput(created.draftId)
  const exported = await rpc(grant.token, "export_game", input)
  assert.equal(exported.ok, true, JSON.stringify(exported))
  rights = false
  try {
    assert.equal((await download(exported.data.downloadUrl)).status, 404)
    assert.equal(
      (await rpc(grant.token, "export_game", input)).error.code,
      "EXPORT_UNAVAILABLE",
    )
  } finally {
    rights = true
  }
  rightsEffect = () => f.accounts.revokeAccountSession(session.sid)
  assert.equal((await download(exported.data.downloadUrl)).status, 404)
})

test("tampered/purpose-confused/expired capabilities disclose no file; default export remains absent", async () => {
  const grant = await linked()
  const created = await draft(grant.token)
  const result = await rpc(
    grant.token,
    "export_game",
    exportInput(created.draftId),
  )
  assert.equal(result.ok, true, JSON.stringify(result))
  const url = new URL(result.data.downloadUrl)
  const encoded = url.pathname.split("/").at(-1)!
  const changed =
    encoded.slice(0, 12) + (encoded[12] === "A" ? "B" : "A") + encoded.slice(13)
  const protocol = createOAuthProtocol(options)
  const ticket = protocol.readDownloadTicket(encoded)
  const expired = protocol.downloadTicket({
    ...ticket,
    expiresAt: Date.now() - 1,
  })
  assert.throws(() => protocol.readDownloadTicket(expired), /invalid_grant/)
  for (const invalid of [changed, grant.code, grant.token, expired]) {
    const rejected = await download(origin + "/oauth/downloads/" + invalid)
    assert.equal(rejected.status, 404)
    assert.equal(await rejected.text(), "")
  }
  const { exportPolicy: _unused, ...disabledOptions } = options
  const disabled = await createFirstPartyOAuth(disabledOptions)
  await assert.rejects(
    createFirstPartyOAuth({
      ...options,
      config: { ...config, firstPartyOrigins: [] },
    }),
    /explicitly allowed/,
  )
  assert.equal(disabled.exports, undefined)
  assert.equal((await download(result.data.downloadUrl, disabled)).status, 404)
})

test("same persistent issuer can deliver after restart; structural principals and changed stored bytes are denied", async () => {
  const grant = await linked()
  const created = await draft(grant.token)
  const input = exportInput(created.draftId)
  const result = await rpc(grant.token, "export_game", input)
  assert.equal(result.ok, true, JSON.stringify(result))
  const fresh = await createFirstPartyOAuth(options)
  assert.equal((await download(result.data.downloadUrl, fresh)).status, 200)
  const p = await issuer.verifyAccessToken(grant.token)
  await assert.rejects(
    issuer.exports!.createAuthorizedDownload(
      { ...p },
      { draftId: input.draftId, expectedRevision: 1 },
      input.format,
      {
        idempotencyKey: input.idempotencyKey,
        inputDigest: hashJson(input),
        correlationId: key(),
      },
    ),
    /SCOPE_REQUIRED/,
  )
  const db = new DatabaseSync(grantFile(f.sessions[0].owner))
  const prior = db
    .prepare(
      "SELECT outcome FROM operations WHERE grant_id=? AND kind='export' AND request_key=?",
    )
    .get(p.grantId, input.idempotencyKey)!
  const damaged = JSON.parse(prior.outcome as string)
  damaged.body += " "
  damaged.data.sha256 = sha(damaged.body)
  damaged.data.bytes = Buffer.byteLength(damaged.body)
  db.prepare(
    "UPDATE operations SET outcome=? WHERE grant_id=? AND kind='export' AND request_key=?",
  ).run(JSON.stringify(damaged), p.grantId, input.idempotencyKey)
  db.close()
  assert.equal((await download(result.data.downloadUrl)).status, 404)
})
