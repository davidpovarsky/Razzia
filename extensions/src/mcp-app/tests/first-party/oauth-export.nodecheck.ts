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

function isOAuthObservationRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function requireOAuthObservationRecord(
  value: unknown,
): Record<string, unknown> {
  if (!isOAuthObservationRecord(value)) {
    throw new Error("Invalid synthetic OAuth evidence record")
  }

  return value
}

function requireOAuthObservationString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Missing synthetic OAuth evidence text")
  }

  return value
}

function requireOAuthObservationPresent<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Missing synthetic OAuth evidence value")
  }

  return value
}

type OAuthDraftObservation = Record<string, unknown> & { draftId: string }

function isOAuthDraftObservation(
  value: unknown,
): value is OAuthDraftObservation {
  return isOAuthObservationRecord(value) && typeof value.draftId === "string"
}

function requireOAuthDraftObservation(value: unknown): OAuthDraftObservation {
  if (!isOAuthDraftObservation(value)) {
    throw new Error("Invalid synthetic OAuth draft evidence")
  }

  return value
}

type InitializedFValue = Awaited<ReturnType<typeof fixture>>
let f: InitializedFValue | undefined = undefined
function requireInitializedF(): InitializedFValue {
  if (f === undefined) {
    throw new Error("Fixture state f was read before initialization")
  }

  return f
}
type InitializedIssuerValue = Awaited<ReturnType<typeof createFirstPartyOAuth>>
let issuer: InitializedIssuerValue | undefined = undefined
function requireInitializedIssuer(): InitializedIssuerValue {
  if (issuer === undefined) {
    throw new Error("Fixture state issuer was read before initialization")
  }

  return issuer
}
type InitializedRemoteValue = ReturnType<
  Awaited<ReturnType<typeof createFirstPartyOAuth>>["remote"]
>
let remote: InitializedRemoteValue | undefined = undefined
function requireInitializedRemote(): InitializedRemoteValue {
  if (remote === undefined) {
    throw new Error("Fixture state remote was read before initialization")
  }

  return remote
}
type InitializedOptionsValue = FirstPartyOAuthOptions
let options: InitializedOptionsValue | undefined = undefined
function requireInitializedOptions(): InitializedOptionsValue {
  if (options === undefined) {
    throw new Error("Fixture state options was read before initialization")
  }

  return options
}
let rights = true
let rightsEffect: (() => void) | undefined = undefined
const clientId = "synthetic-export-client"
const redirectUri = "https://host.example.invalid/export/callback"
const config = {
  issuer: `${origin}/oauth`,
  resource: `${origin}/mcp`,
  resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
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
    configRoot: requireInitializedF().root,
    keyId: "synthetic-export-issuer",
    signingPrivateKeyPem: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    ticketEncryptionKey: randomBytes(32),
    consentPageUrl: `${origin}/studio/oauth-consent`,
    clients: [{ clientId, redirectUris: [redirectUri], scopes: allowed }],
    exportPolicy: {
      authoring: policy,
      canExport(context) {
        assert.ok(
          requireInitializedF().sessions.some(
            (session) => session.owner === context.accountId,
          ),
        )
        const effect = rightsEffect
        rightsEffect = undefined
        effect?.()

        return rights
      },
    },
  }
  issuer = await createFirstPartyOAuth(requireInitializedOptions())
  remote = requireInitializedIssuer().remote({
    allowedOrigins: [],
    dependencies: {
      authoring: policy,
      drafts: requireInitializedIssuer().draftRepository(policy),
      exports: requireInitializedIssuer().exports,
      // Explicit synthetic host budget, not a production policy.

      rateLimit: () => Promise.resolve(true),
    },
  })
})
after(async () => {
  await remote?.close()
  f?.close()
})
const sha = (value: string) => createHash("sha256").update(value).digest("hex")
const grantFile = (owner: string) =>
  join(
    requireInitializedF().root,
    "tenants",
    owner,
    "extensions/mcp-oauth/grants.sqlite",
  )
function api(
  path: string,
  body?: Record<string, string>,
  session?: Session,
  instance = requireInitializedIssuer(),
) {
  const json = path === "/oauth/inspect" || path === "/oauth/approve"

  return instance.fetch(
    new Request(origin + path, {
      method: body ? "POST" : "GET",
      headers: {
        host: new URL(origin).host,
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
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
async function linked(
  session = requireInitializedF().sessions[0],
  scopes = allowed,
) {
  const verifier = randomBytes(32).toString("base64url")
  const response = await api(
    `/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      resource: config.resource,
      scope: scopes.join(" "),
      state: key(),
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    })}`,
  )
  assert.equal(response.status, 302)
  const ticket = requireOAuthObservationPresent(
    new URL(
      requireOAuthObservationPresent(response.headers.get("location")),
    ).searchParams.get("oauth_request"),
  )

  const inspected = requireOAuthObservationRecord(
    await (await api("/oauth/inspect", { ticket }, session)).json(),
  )

  const approval = await api(
    "/oauth/approve",
    {
      ticket,
      proof: requireOAuthObservationString(inspected.proof),
      decision: "allow",
    },
    session,
  )
  assert.equal(approval.status, 200)
  const approved = requireOAuthObservationRecord(await approval.json())

  const code = requireOAuthObservationPresent(
    new URL(
      requireOAuthObservationString(approved.redirectUrl),
    ).searchParams.get("code"),
  )

  const exchanged = await api("/oauth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    resource: config.resource,
  })
  assert.equal(exchanged.status, 200)

  return {
    token: requireOAuthObservationString(
      requireOAuthObservationRecord(await exchanged.json()).access_token,
    ),
    code,
  }
}
let requestId = 0
async function rpc(token: string, name: string, args: unknown) {
  const response = await requireInitializedRemote().fetch(
    new Request(config.resource, {
      method: "POST",
      headers: {
        host: new URL(origin).host,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: (requestId += 1),
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
    ? requireOAuthObservationRecord(
        JSON.parse(
          requireOAuthObservationPresent(
            text
              .split("\n")
              .filter((line) => line.startsWith("data: "))
              .at(-1),
          ).slice(6),
        ),
      )
    : requireOAuthObservationRecord(JSON.parse(text))

  return requireOAuthObservationRecord(
    requireOAuthObservationRecord(wire.result).structuredContent,
  )
}
async function draft(token: string, title = "Synthetic exported draft") {
  const input = createInput(title)
  const result = await rpc(token, "create_game_draft", input)
  assert.equal(result.ok, true, JSON.stringify(result))

  return { ...requireOAuthDraftObservation(result.data), input }
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
function download(url: string, instance = requireInitializedIssuer()) {
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
  const metadata = requireOAuthObservationRecord(result.data)

  const path = grantFile(requireInitializedF().sessions[0].owner)
  const priorFileState = {
    bytes: readFileSync(path),
    mtime: statSync(path).mtimeMs,
  }
  const response = await download(
    requireOAuthObservationString(metadata.downloadUrl),
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.equal(response.headers.get("referrer-policy"), "no-referrer")
  assert.equal(response.headers.get("x-content-type-options"), "nosniff")
  assert.match(
    requireOAuthObservationPresent(response.headers.get("content-disposition")),
    /^attachment; filename="tadazz-[A-Za-z0-9_-]+\.tada\.json"$/,
  )
  const body = await response.text()
  assert.equal(sha(body), metadata.sha256)
  assert.equal(Buffer.byteLength(body), metadata.bytes)
  assert.equal(response.headers.get("content-length"), String(metadata.bytes))
  const stored = await requireInitializedIssuer()
    .draftRepository(policy)
    .get(
      await requireInitializedIssuer().verifyAccessToken(grant.token),
      created.draftId,
    )
  assert.equal(body, requireOAuthObservationPresent(stored).authoredShowJson)
  assert.ok(
    Date.parse(requireOAuthObservationString(metadata.expiresAt)) <=
      Date.now() + 60_000,
  )
  assert.ok(
    !requireOAuthObservationString(metadata.downloadUrl).includes(
      requireInitializedF().sessions[0].owner,
    ) &&
      !requireOAuthObservationString(metadata.downloadUrl).includes(
        grant.token,
      ),
  )
  assert.deepEqual(readFileSync(path), priorFileState.bytes)
  assert.equal(statSync(path).mtimeMs, priorFileState.mtime)
  assert.equal(existsSync(`${path}-journal`), false)
  assert.equal(
    existsSync(
      join(
        requireInitializedF().root,
        "tenants",
        requireInitializedF().sessions[0].owner,
        "quizz",
      ),
    ),
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
    requireOAuthObservationRecord(
      JSON.parse(
        await (
          await download(
            requireOAuthObservationString(
              requireOAuthObservationRecord(replay.data).downloadUrl,
            ),
          )
        ).text(),
      ),
    ).title,
    "Before edit",
  )
  assert.equal(
    requireOAuthObservationRecord(
      (await rpc(grant.token, "export_game", { ...input, expectedRevision: 2 }))
        .error,
    ).code,
    "REQUEST_KEY_REUSED",
  )
  assert.equal(
    requireOAuthObservationRecord(
      (await rpc(grant.token, "export_game", exportInput(created.draftId)))
        .error,
    ).code,
    "REVISION_CONFLICT",
  )
})

test("ordinary export needs scopes/owner/rights, with no new per-export consent", async () => {
  const grant = await linked()
  const created = await draft(grant.token)
  const other = await linked(requireInitializedF().sessions[1])
  assert.equal(
    requireOAuthObservationRecord(
      (await rpc(other.token, "export_game", exportInput(created.draftId)))
        .error,
    ).code,
    "NOT_FOUND",
  )
  const narrow = await linked(requireInitializedF().sessions[0], [
    "tadazz.drafts.read",
    "tadazz.drafts.write",
  ])
  assert.equal(
    requireOAuthObservationRecord(
      (await rpc(narrow.token, "export_game", exportInput(created.draftId)))
        .error,
    ).code,
    "SCOPE_REQUIRED",
  )
  rights = false
  const priorBytes = readFileSync(
    grantFile(requireInitializedF().sessions[0].owner),
  )

  try {
    assert.equal(
      requireOAuthObservationRecord(
        (await rpc(grant.token, "export_game", exportInput(created.draftId)))
          .error,
      ).code,
      "EXPORT_UNAVAILABLE",
    )
  } finally {
    rights = true
  }

  assert.deepEqual(
    readFileSync(grantFile(requireInitializedF().sessions[0].owner)),
    priorBytes,
  )
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
  const response = await download(
    requireOAuthObservationString(
      requireOAuthObservationRecord(exported.data).downloadUrl,
    ),
  )
  assert.equal(response.status, 200)
  const body = await response.text()
  const imported = preflightShowImport(body, "synthetic.enhanced.json")
  assert.equal(imported.ok, true)
  assert.ok(imported.normalizedBundleDraft)
  assert.equal(sha(body), requireOAuthObservationRecord(exported.data).sha256)
  assert.equal(
    existsSync(
      join(
        requireInitializedF().root,
        "tenants",
        requireInitializedF().sessions[0].owner,
        "quizz",
      ),
    ),
    false,
  )
})

test("capability delivery rechecks current rights and actual native revocation after the rights callback", async () => {
  const minted = await requireInitializedF().tokens.mintToken(
    requireInitializedF().sessions[0].owner,
    "manager",
  )
  const claims = await requireInitializedF().tokens.verifyToken(minted.token)
  const session = {
    token: minted.token,
    owner: requireInitializedF().sessions[0].owner,
    sid: requireOAuthObservationPresent(claims.sid),
  }
  const grant = await linked(session)
  const created = await draft(grant.token)
  const input = exportInput(created.draftId)
  const exported = await rpc(grant.token, "export_game", input)
  assert.equal(exported.ok, true, JSON.stringify(exported))
  rights = false

  try {
    assert.equal(
      (
        await download(
          requireOAuthObservationString(
            requireOAuthObservationRecord(exported.data).downloadUrl,
          ),
        )
      ).status,
      404,
    )
    assert.equal(
      requireOAuthObservationRecord(
        (await rpc(grant.token, "export_game", input)).error,
      ).code,
      "EXPORT_UNAVAILABLE",
    )
  } finally {
    rights = true
  }

  rightsEffect = () =>
    requireInitializedF().accounts.revokeAccountSession(session.sid)
  assert.equal(
    (
      await download(
        requireOAuthObservationString(
          requireOAuthObservationRecord(exported.data).downloadUrl,
        ),
      )
    ).status,
    404,
  )
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
  const url = new URL(
    requireOAuthObservationString(
      requireOAuthObservationRecord(result.data).downloadUrl,
    ),
  )
  const encoded = requireOAuthObservationPresent(url.pathname.split("/").at(-1))

  const changed =
    encoded.slice(0, 12) + (encoded[12] === "A" ? "B" : "A") + encoded.slice(13)
  const protocol = createOAuthProtocol(requireInitializedOptions())
  const ticket = protocol.readDownloadTicket(encoded)
  const expired = protocol.downloadTicket({
    ...ticket,
    expiresAt: Date.now() - 1,
  })
  assert.throws(() => protocol.readDownloadTicket(expired), /invalid_grant/)
  for (const invalid of [changed, grant.code, grant.token, expired]) {
    const rejected = await download(`${origin}/oauth/downloads/${invalid}`)
    assert.equal(rejected.status, 404)
    assert.equal(await rejected.text(), "")
  }
  const { exportPolicy: _unused, ...disabledOptions } =
    requireInitializedOptions()
  const disabled = await createFirstPartyOAuth(disabledOptions)
  await assert.rejects(
    createFirstPartyOAuth({
      ...requireInitializedOptions(),
      config: { ...config, firstPartyOrigins: [] },
    }),
    /explicitly allowed/,
  )
  assert.equal(disabled.exports, undefined)
  assert.equal(
    (
      await download(
        requireOAuthObservationString(
          requireOAuthObservationRecord(result.data).downloadUrl,
        ),
        disabled,
      )
    ).status,
    404,
  )
})

test("same persistent issuer can deliver after restart; structural principals and changed stored bytes are denied", async () => {
  const grant = await linked()
  const created = await draft(grant.token)
  const input = exportInput(created.draftId)
  const result = await rpc(grant.token, "export_game", input)
  assert.equal(result.ok, true, JSON.stringify(result))
  const fresh = await createFirstPartyOAuth(requireInitializedOptions())
  assert.equal(
    (
      await download(
        requireOAuthObservationString(
          requireOAuthObservationRecord(result.data).downloadUrl,
        ),
        fresh,
      )
    ).status,
    200,
  )
  const p = await requireInitializedIssuer().verifyAccessToken(grant.token)
  await assert.rejects(
    requireOAuthObservationPresent(
      requireInitializedIssuer().exports,
    ).createAuthorizedDownload(
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
  const db = new DatabaseSync(
    grantFile(requireInitializedF().sessions[0].owner),
  )
  const prior = requireOAuthObservationPresent(
    db
      .prepare(
        "SELECT outcome FROM operations WHERE grant_id=? AND kind='export' AND request_key=?",
      )
      .get(p.grantId, input.idempotencyKey),
  )

  const damaged = requireOAuthObservationRecord(
    JSON.parse(requireOAuthObservationString(prior.outcome)),
  )
  damaged.body = `${requireOAuthObservationString(damaged.body)} `
  requireOAuthObservationRecord(damaged.data).sha256 = sha(
    requireOAuthObservationString(damaged.body),
  )
  requireOAuthObservationRecord(damaged.data).bytes = Buffer.byteLength(
    requireOAuthObservationString(damaged.body),
  )
  db.prepare(
    "UPDATE operations SET outcome=? WHERE grant_id=? AND kind='export' AND request_key=?",
  ).run(JSON.stringify(damaged), p.grantId, input.idempotencyKey)
  db.close()
  assert.equal(
    (
      await download(
        requireOAuthObservationString(
          requireOAuthObservationRecord(result.data).downloadUrl,
        ),
      )
    ).status,
    404,
  )
})
