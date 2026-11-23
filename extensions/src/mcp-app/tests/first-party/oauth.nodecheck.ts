import assert from "node:assert/strict"
import { after, before, beforeEach, test } from "node:test"
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto"
import { z } from "zod"
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import {
  createFirstPartyOAuth,
  type FirstPartyOAuthOptions,
} from "../../first-party/oauth.ts"
import { normalizeDraft } from "../../server/authoring.ts"
import { hashJson } from "../../contracts/canonical.ts"
import {
  createOAuthProtocol,
  tokenDigest,
} from "../../first-party/oauth-protocol.ts"
import {
  fixture,
  createInput,
  key,
  origin,
  policy,
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

function requireOAuthObservationArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid synthetic OAuth evidence array")
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
type InitializedOptionsValue = FirstPartyOAuthOptions
let options: InitializedOptionsValue | undefined = undefined
function requireInitializedOptions(): InitializedOptionsValue {
  if (options === undefined) {
    throw new Error("Fixture state options was read before initialization")
  }

  return options
}
const clientId = "private-synthetic-chat-client"
const redirectUri = "https://host.example.invalid/oauth/callback"
const config = {
  issuer: `${origin}/oauth`,
  resource: `${origin}/mcp`,
  resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
}
const scope = "tadazz.catalog.read tadazz.drafts.read tadazz.drafts.write"
before(async () => {
  f = await fixture()
  const pair = generateKeyPairSync("ed25519")
  options = {
    config,
    configRoot: requireInitializedF().root,
    consentPageUrl: `${origin}/studio/oauth-consent`,
    keyId: "synthetic-oauth-issuer",
    signingPrivateKeyPem: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    ticketEncryptionKey: randomBytes(32),
    clients: [
      { clientId, redirectUris: [redirectUri], scopes: scope.split(" ") },
    ],
  }
  issuer = await createFirstPartyOAuth(requireInitializedOptions())
})
after(() => f?.close())
beforeEach(async () => {
  // Each clock-controlled case gets a real fresh ingress budget, while the
  // actual tenant/account stores and deployment-owned synthetic keys persist.
  issuer = await createFirstPartyOAuth(requireInitializedOptions())
})
const file = (owner: string) =>
  join(
    requireInitializedF().root,
    "tenants",
    owner,
    "extensions/mcp-oauth/grants.sqlite",
  )
function request(
  path: string,
  method = "GET",
  body?: Record<string, string>,
  session?: Session,
  extra: Record<string, string> = {},
  instance = requireInitializedIssuer(),
) {
  const firstParty = path === "/oauth/inspect" || path === "/oauth/approve"

  return instance.fetch(
    new Request(origin + path, {
      method,
      headers: {
        host: new URL(origin).host,
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
        ...(method === "GET"
          ? {}
          : {
              "content-type": firstParty
                ? "application/json"
                : "application/x-www-form-urlencoded",
            }),
        ...(firstParty ? { origin } : {}),
        ...extra,
      },
      ...(body
        ? {
            body: firstParty
              ? JSON.stringify(body)
              : new URLSearchParams(body).toString(),
          }
        : {}),
    }),
  )
}
async function begin(changes: Record<string, string> = {}) {
  const verifier = randomBytes(32).toString("base64url")
  const state = randomBytes(24).toString("base64url")
  const params = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    resource: config.resource,
    scope,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...changes,
  }
  const response = await request(
    `/oauth/authorize?${new URLSearchParams(params)}`,
  )

  return {
    response,
    verifier,
    state,
    params,
    ticket:
      new URL(response.headers.get("location") ?? origin).searchParams.get(
        "oauth_request",
      ) ?? "",
  }
}
async function approve(
  session = requireInitializedF().sessions[0],
  instance = requireInitializedIssuer(),
) {
  const begun = await begin()
  assert.equal(begun.response.status, 302)
  const inspected = await request(
    "/oauth/inspect",
    "POST",
    { ticket: begun.ticket },
    session,
    {},
    instance,
  )
  assert.equal(inspected.status, 200)
  const review = requireOAuthObservationRecord(await inspected.json())
  assert.deepEqual(review.scopes, scope.split(" "))
  const allowed = await request(
    "/oauth/approve",
    "POST",
    {
      ticket: begun.ticket,
      proof: requireOAuthObservationString(review.proof),
      decision: "allow",
    },
    session,
    {},
    instance,
  )
  assert.equal(allowed.status, 200, await allowed.clone().text())
  const result = requireOAuthObservationRecord(await allowed.json())
  const redirect = new URL(requireOAuthObservationString(result.redirectUrl))
  assert.equal(redirect.origin + redirect.pathname, redirectUri)
  assert.equal(redirect.searchParams.get("state"), begun.state)
  assert.equal(redirect.searchParams.get("iss"), config.issuer)

  return {
    ...begun,
    grantId: requireOAuthObservationString(result.grantId),
    code: requireOAuthObservationPresent(redirect.searchParams.get("code")),
  }
}
async function exchange(
  grant: Awaited<ReturnType<typeof approve>>,
  changes: Record<string, string> = {},
  instance = requireInitializedIssuer(),
) {
  return request(
    "/oauth/token",
    "POST",
    {
      grant_type: "authorization_code",
      client_id: clientId,
      code: grant.code,
      code_verifier: grant.verifier,
      redirect_uri: redirectUri,
      resource: config.resource,
      ...changes,
    },
    undefined,
    {},
    instance,
  )
}
const tokenResponseSchema = z.strictObject({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive().max(300),
  scope: z.string().min(1),
})

async function readTokens(response: Response) {
  return tokenResponseSchema.parse((await response.json()) as unknown)
}

async function linked(session = requireInitializedF().sessions[0]) {
  const grant = await approve(session)
  const response = await exchange(grant)
  assert.equal(response.status, 200, await response.clone().text())

  return { ...grant, tokens: await readTokens(response) }
}
async function freshSession(): Promise<Session> {
  const minted = await requireInitializedF().tokens.mintToken(
    requireInitializedF().sessions[0].owner,
    "manager",
  )
  const claims = await requireInitializedF().tokens.verifyToken(minted.token)
  assert.ok(claims.sid)

  return {
    owner: requireInitializedF().sessions[0].owner,
    sid: claims.sid,
    token: minted.token,
  }
}
function rotateCredential(
  credential: string,
  changes: Record<string, string> = {},
  instance = requireInitializedIssuer(),
) {
  return request(
    "/oauth/token",
    "POST",
    {
      grant_type: "refresh_token",
      client_id: clientId,
      resource: config.resource,
      refresh_token: credential,
      ...changes,
    },
    undefined,
    {},
    instance,
  )
}
async function legacyConnection(session: Session) {
  // Reconstruct only the historical token/store representation after a real
  // native-account consent + PKCE exchange. No principal or approval is forged.
  const grant = await linked(session)
  const claims = await requireInitializedF().tokens.verifyToken(session.token)
  const expiresAt = claims.exp * 1000
  const credential = createOAuthProtocol(requireInitializedOptions()).refresh({
    accountId: session.owner,
    grantId: grant.grantId,
    clientId,
    nonce: randomBytes(24).toString("base64url"),
    expiresAt: claims.exp,
  })
  const db = new DatabaseSync(file(session.owner))

  try {
    db.prepare("UPDATE grants SET expires_ms=? WHERE id=?").run(
      expiresAt,
      grant.grantId,
    )
    db.prepare("DELETE FROM refresh WHERE grant_id=?").run(grant.grantId)
    db.prepare(
      "INSERT INTO refresh(digest,grant_id,expires_ms,used) VALUES(?,?,?,0)",
    ).run(tokenDigest(credential), grant.grantId, expiresAt)
    db.prepare(
      "DELETE FROM operations WHERE grant_id=? AND kind='oauth-token-retry'",
    ).run(grant.grantId)
  } finally {
    db.close()
  }

  return { ...grant, credential, expiresAt }
}
test("discovery and JWKS expose public configuration without creating a tenant grant store", async () => {
  const response = await request(
    "/.well-known/oauth-authorization-server/oauth",
  )
  assert.equal(response.status, 200)
  const metadata = requireOAuthObservationRecord(await response.json())
  assert.equal(metadata.issuer, config.issuer)
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"])
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ["none"])
  const jwks = requireOAuthObservationRecord(
    await (await request("/oauth/jwks.json")).json(),
  )

  assert.equal(
    requireOAuthObservationRecord(requireOAuthObservationArray(jwks.keys)[0])
      .kty,
    "OKP",
  )
  assert.equal(
    requireOAuthObservationRecord(requireOAuthObservationArray(jwks.keys)[0]).d,
    undefined,
  )
  assert.equal(existsSync(file(requireInitializedF().sessions[0].owner)), false)
  assert.equal(
    existsSync(join(requireInitializedF().root, "grants.sqlite")),
    false,
  )
})
test("exact client/redirect/resource/PKCE/scope admission rejects unsafe authorization requests", async () => {
  for (const changes of [
    { client_id: "unknown" },
    { redirect_uri: "https://attacker.invalid/callback" },
    { redirect_uri: `${redirectUri}/` },
    { resource: config.issuer },
    { code_challenge_method: "plain" },
    { scope: "tadazz.library.write" },
    { scope: `${scope} tadazz.drafts.read` },
    { state: "short" },
  ] as Array<Record<string, string>>) {
    assert.equal((await begin(changes)).response.status, 400)
  }
  const response = await request("/oauth/authorize?client_id=a&client_id=b")
  assert.equal(response.status, 400)
  assert.equal(response.headers.get("location"), null)
})
test("ChatGPT authorization hints are ignored without altering exact client, PKCE, scopes or grant", async () => {
  const hint = "synthetic-user@example.invalid"
  const extras = {
    prompt: "consent",
    login_hint: hint,
    id_token_hint: "synthetic-id-token",
    target_flow: "chatgpt_siwc",
  }
  const begun = await begin(extras)
  assert.equal(begun.response.status, 302)
  const inspect = await request(
    "/oauth/inspect",
    "POST",
    { ticket: begun.ticket },
    requireInitializedF().sessions[0],
  )
  assert.equal(inspect.status, 200)
  const responseText = await inspect.text()
  assert.equal(responseText.includes(hint), false)
  assert.equal(responseText.includes("synthetic-id-token"), false)
  assert.equal(responseText.includes("chatgpt_siwc"), false)
  const review = z
    .object({ scopes: z.array(z.string()), proof: z.string() })
    .parse(JSON.parse(responseText) as unknown)
  assert.deepEqual(review.scopes, scope.split(" "))
  const allowed = await request(
    "/oauth/approve",
    "POST",
    { ticket: begun.ticket, proof: review.proof, decision: "allow" },
    requireInitializedF().sessions[0],
  )
  assert.equal(allowed.status, 200)
  const approved = z
    .object({ redirectUrl: z.string() })
    .parse((await allowed.json()) as unknown)
  const redirect = new URL(approved.redirectUrl)
  assert.equal(redirect.origin + redirect.pathname, redirectUri)
  assert.equal(redirect.searchParams.get("state"), begun.state)
  assert.equal(redirect.searchParams.get("iss"), config.issuer)
  const authorizationCode = redirect.searchParams.get("code")
  assert.ok(authorizationCode)
  const tokenResponse = await request("/oauth/token", "POST", {
    grant_type: "authorization_code",
    client_id: clientId,
    code: authorizationCode,
    code_verifier: begun.verifier,
    redirect_uri: redirectUri,
    resource: config.resource,
  })
  assert.equal(tokenResponse.status, 200)
  const tokens = z
    .object({ access_token: z.string() })
    .parse((await tokenResponse.json()) as unknown)
  const principal = await requireInitializedIssuer().verifyAccessToken(
    tokens.access_token,
  )
  assert.equal(principal.clientId, clientId)
  assert.equal(principal.accountId, requireInitializedF().sessions[0].owner)
  assert.equal(
    (
      await begin({
        ...extras,
        redirect_uri: "https://attacker.invalid/callback",
      })
    ).response.status,
    400,
  )
  assert.equal(
    (await begin({ ...extras, resource: config.issuer })).response.status,
    400,
  )
})
test("consent requires real manager identity, same origin and the exact account/session/ticket proof", async () => {
  const begun = await begin()
  assert.equal(
    (await request("/oauth/inspect", "POST", { ticket: begun.ticket })).status,
    401,
  )
  assert.equal(
    (
      await request(
        "/oauth/inspect",
        "POST",
        { ticket: begun.ticket },
        requireInitializedF().sessions[0],
        { origin: "https://attacker.invalid" },
      )
    ).status,
    403,
  )
  const review = requireOAuthObservationRecord(
    await (
      await request(
        "/oauth/inspect",
        "POST",
        { ticket: begun.ticket },
        requireInitializedF().sessions[0],
      )
    ).json(),
  )

  assert.equal(
    (
      await request(
        "/oauth/approve",
        "POST",
        {
          ticket: begun.ticket,
          proof: requireOAuthObservationString(review.proof),
          decision: "allow",
        },
        requireInitializedF().sessions[1],
      )
    ).status,
    403,
  )
  assert.equal(
    (
      await request(
        "/oauth/approve",
        "POST",
        { ticket: begun.ticket, proof: "0".repeat(64), decision: "allow" },
        requireInitializedF().sessions[0],
      )
    ).status,
    403,
  )
  assert.equal(existsSync(file(requireInitializedF().sessions[1].owner)), false)
})
test("real account PKCE flow stores only token digests and survives a fresh issuer instance", async () => {
  const grant = await linked()
  const p = await requireInitializedIssuer().verifyAccessToken(
    grant.tokens.access_token,
  )
  assert.equal(p.accountId, requireInitializedF().sessions[0].owner)
  assert.equal(p.grantId, grant.grantId)
  assert.equal(p.clientId, clientId)
  const bytes = readFileSync(file(p.accountId))
  for (const secret of [
    grant.tokens.access_token,
    grant.tokens.refresh_token,
    grant.code,
    grant.ticket,
    requireInitializedF().sessions[0].token,
  ]) {
    assert.equal(bytes.includes(Buffer.from(secret)), false)
  }
  assert.equal(statSync(file(p.accountId)).mode & 0o777, 0o600)
  const reopened = await createFirstPartyOAuth(requireInitializedOptions())
  assert.equal(
    (await reopened.verifyAccessToken(grant.tokens.access_token)).grantId,
    grant.grantId,
  )
  const priorBytes = readFileSync(file(p.accountId))
  const mtime = statSync(file(p.accountId)).mtimeMs
  await reopened.verifyAccessToken(grant.tokens.access_token)
  assert.deepEqual(readFileSync(file(p.accountId)), priorBytes)
  assert.equal(statSync(file(p.accountId)).mtimeMs, mtime)
})
test("wrong PKCE/client/resource/redirect cannot consume a valid code; code replay after the retry window revokes its grant", async (t) => {
  const grant = await approve()
  for (const changes of [
    { code_verifier: randomBytes(32).toString("base64url") },
    { client_id: "unknown" },
    { resource: config.issuer },
    { redirect_uri: "https://attacker.invalid/callback" },
  ] as Array<Record<string, string>>) {
    assert.equal((await exchange(grant, changes)).status, 400)
  }
  const response = await exchange(grant)
  assert.equal(response.status, 200)
  const tokens = requireOAuthObservationRecord(await response.json())
  assert.equal(
    (
      await requireInitializedIssuer().verifyAccessToken(
        requireOAuthObservationString(tokens.access_token),
      )
    ).grantId,
    grant.grantId,
  )
  const now = Date.now()
  t.mock.method(Date, "now", () => now + 31_000)
  assert.equal((await exchange(grant)).status, 400)
  await assert.rejects(
    requireInitializedIssuer().verifyAccessToken(
      requireOAuthObservationString(tokens.access_token),
    ),
    /SCOPE_REQUIRED/u,
  )
})
test("refresh rotates once, and replay after the retry window durably revokes old and newly issued access", async (t) => {
  const grant = await linked()
  const refresh = {
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: grant.tokens.refresh_token,
    resource: config.resource,
  }
  const response = await request("/oauth/token", "POST", refresh)
  assert.equal(response.status, 200)
  const rotated = requireOAuthObservationRecord(await response.json())

  assert.notEqual(
    requireOAuthObservationString(rotated.refresh_token),
    refresh.refresh_token,
  )
  await requireInitializedIssuer().verifyAccessToken(
    requireOAuthObservationString(rotated.access_token),
  )
  const now = Date.now()
  t.mock.method(Date, "now", () => now + 31_000)
  assert.equal((await request("/oauth/token", "POST", refresh)).status, 400)
  await assert.rejects(
    requireInitializedIssuer().verifyAccessToken(grant.tokens.access_token),
  )
  await assert.rejects(
    requireInitializedIssuer().verifyAccessToken(
      requireOAuthObservationString(rotated.access_token),
    ),
  )
  const reopened = await createFirstPartyOAuth(requireInitializedOptions())
  await assert.rejects(
    reopened.verifyAccessToken(
      requireOAuthObservationString(rotated.access_token),
    ),
  )
})
test("parallel code exchange and refresh retries recover the same response without a second rotation", async (t) => {
  const grant = await approve()
  const exchanges = await Promise.all([exchange(grant), exchange(grant)])
  assert.deepEqual(
    exchanges.map((response) => response.status),
    [200, 200],
  )
  const [first, retried] = await Promise.all(exchanges.map(readTokens))
  assert.equal(retried.access_token, first.access_token)
  assert.equal(retried.refresh_token, first.refresh_token)
  const rotated = await Promise.all([
    rotateCredential(first.refresh_token),
    rotateCredential(first.refresh_token),
    rotateCredential(first.refresh_token),
  ])
  assert.deepEqual(
    rotated.map((response) => response.status),
    [200, 200, 200],
  )
  const [a, b, c] = await Promise.all(rotated.map(readTokens))
  assert.notEqual(a.refresh_token, first.refresh_token)
  assert.equal(b.refresh_token, a.refresh_token)
  assert.equal(c.access_token, a.access_token)
  const now = Date.now()
  t.mock.method(Date, "now", () => now + 15_000)
  const reopened = await createFirstPartyOAuth(requireInitializedOptions())
  const recovered = await rotateCredential(first.refresh_token, {}, reopened)
  assert.equal(recovered.status, 200)
  const recovery = await readTokens(recovered)
  assert.equal(recovery.refresh_token, a.refresh_token)
  assert.equal(recovery.access_token, a.access_token)
  assert.ok(recovery.expires_in <= 285 && recovery.expires_in >= 283)
  await reopened.verifyAccessToken(recovery.access_token)
  const bytes = readFileSync(file(requireInitializedF().sessions[0].owner))
  for (const credential of [
    first.refresh_token,
    a.refresh_token,
    a.access_token,
  ]) {
    assert.equal(bytes.includes(Buffer.from(credential)), false)
  }
})
test("a retry cannot recover a replaced refresh head or cross client/resource bindings", async () => {
  const grant = await linked()
  await Promise.all(
    (
      [{ client_id: "unknown" }, { resource: config.issuer }] as Array<
        Record<string, string>
      >
    ).map(async (changes) => {
      assert.equal(
        (await rotateCredential(grant.tokens.refresh_token, changes)).status,
        400,
      )
    }),
  )
  const first = await rotateCredential(grant.tokens.refresh_token)
  assert.equal(first.status, 200)
  const a = await readTokens(first)
  const second = await rotateCredential(a.refresh_token)
  assert.equal(second.status, 200)
  const b = await readTokens(second)
  assert.equal((await rotateCredential(grant.tokens.refresh_token)).status, 400)
  await assert.rejects(
    requireInitializedIssuer().verifyAccessToken(b.access_token),
  )
})
test("persistent connection refresh survives years and native expiry without extending native or access tokens", async (t) => {
  const session = await freshSession()
  const grant = await linked(session)
  const now = Date.now()
  let current = now + 400 * 24 * 60 * 60 * 1000
  t.mock.method(Date, "now", () => current)
  assert.equal(
    requireInitializedF().accounts.isAccountSessionValid(
      session.owner,
      session.sid,
    ),
    false,
  )
  await assert.rejects(requireInitializedF().tokens.verifyToken(session.token))
  await assert.rejects(
    requireInitializedIssuer().verifyAccessToken(grant.tokens.access_token),
  )
  const { auth } = await import("@razzia/socket/api/routes/auth")
  const nativeRenewal = await auth.request("/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: session.token }),
  })
  assert.equal(nativeRenewal.status, 200)
  const nativeSession = z
    .object({ role: z.string(), clientId: z.string() })
    .parse((await nativeRenewal.json()) as unknown)
  assert.equal(nativeSession.role, "player")
  assert.notEqual(nativeSession.clientId, session.owner)
  assert.ok(
    requireInitializedF()
      .db.prepare("SELECT id FROM sessions WHERE id=? AND user_id=?")
      .get(session.sid, session.owner),
  )
  const reopened = await createFirstPartyOAuth(requireInitializedOptions())
  const response = await rotateCredential(
    grant.tokens.refresh_token,
    {},
    reopened,
  )
  assert.equal(response.status, 200)
  const tokens = await readTokens(response)
  assert.equal(tokens.expires_in, 300)
  const principal = await reopened.verifyAccessToken(tokens.access_token)
  assert.ok(principal.expiresAt <= current + 300_000)
  assert.equal(principal.accountId, session.owner)
  const input = createInput("Persistent connection after native expiry")
  const normalized = normalizeDraft(input.authoredShowJson, policy)
  const draft = await reopened.draftRepository(policy).create(
    principal,
    { ...normalized, locale: input.locale },
    {
      idempotencyKey: input.idempotencyKey,
      correlationId: key(),
      inputDigest: hashJson({
        ...input,
        authoredShowJson: normalized.authoredShowJson,
      }),
    },
  )
  assert.equal(draft.revision, 1)
  current += 8 * 365 * 24 * 60 * 60 * 1000
  const later = await rotateCredential(tokens.refresh_token, {}, reopened)
  assert.equal(later.status, 200)
  const renewed = await readTokens(later)
  await reopened.verifyAccessToken(renewed.access_token)
  requireInitializedF().accounts.revokeAccountSession(session.sid)
  await assert.rejects(reopened.verifyAccessToken(renewed.access_token))
  assert.equal(
    (await rotateCredential(renewed.refresh_token, {}, reopened)).status,
    400,
  )
})
test("many ordinary rotations retain one digest and one encrypted retry entry per connection", async (t) => {
  const grant = await linked()
  const initial = new DatabaseSync(
    file(requireInitializedF().sessions[0].owner),
    {
      readOnly: true,
    },
  )
  let auditCount = 0

  try {
    const count = initial
      .prepare("SELECT count(*) AS n FROM audit WHERE grant_id=?")
      .get(grant.grantId)?.n
    assert.ok(typeof count === "number")
    auditCount = count
  } finally {
    initial.close()
  }

  const beforeBytes = statSync(
    file(requireInitializedF().sessions[0].owner),
  ).size
  const steadyIssuer = await createFirstPartyOAuth(requireInitializedOptions())
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  // Chain real exchanges in order: each needs the previous response's head.
  await Array.from({ length: 120 }).reduce<Promise<string>>(
    async (previous) => {
      const credential = await previous
      now += 300_000
      const response = await rotateCredential(credential, {}, steadyIssuer)
      assert.equal(response.status, 200)
      const tokens = await readTokens(response)

      return tokens.refresh_token
    },
    Promise.resolve(grant.tokens.refresh_token),
  )
  const db = new DatabaseSync(file(requireInitializedF().sessions[0].owner), {
    readOnly: true,
  })

  try {
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM refresh WHERE grant_id=?")
        .get(grant.grantId)?.n,
      1,
    )
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM audit WHERE grant_id=?")
        .get(grant.grantId)?.n,
      auditCount,
    )
    const summary = db
      .prepare(
        "SELECT outcome FROM operations WHERE grant_id=? AND kind='oauth-token-retry'",
      )
      .get(grant.grantId)?.outcome
    assert.ok(typeof summary === "string")
    assert.equal(
      createOAuthProtocol(requireInitializedOptions()).readTokenRetry(summary)
        .refreshCount,
      120,
    )
    assert.ok(
      statSync(file(requireInitializedF().sessions[0].owner)).size <=
        beforeBytes + 16_384,
    )
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM operations WHERE grant_id=? AND kind='oauth-token-retry'",
        )
        .get(grant.grantId)?.n,
      1,
    )
  } finally {
    db.close()
  }
})
test("an expired legacy connection upgrades only with its exact unused refresh credential and retained anchor", async (t) => {
  const session = await freshSession()
  const legacy = await legacyConnection(session)
  const now = Date.now()
  t.mock.method(Date, "now", () => now + 2 * 24 * 60 * 60 * 1000)
  const invalid = `${legacy.credential.slice(0, -3)}aaa`
  assert.equal((await rotateCredential(invalid)).status, 400)
  assert.equal(
    (await rotateCredential(legacy.credential, { client_id: "unknown" }))
      .status,
    400,
  )
  const response = await rotateCredential(legacy.credential)
  assert.equal(response.status, 200)
  const tokens = await readTokens(response)
  const principal = await requireInitializedIssuer().verifyAccessToken(
    tokens.access_token,
  )
  assert.equal(principal.accountId, session.owner)
  assert.equal(principal.grantId, legacy.grantId)
  assert.equal(
    requireInitializedF().accounts.isAccountSessionValid(
      session.owner,
      session.sid,
    ),
    false,
  )
  const db = new DatabaseSync(file(session.owner), { readOnly: true })

  try {
    assert.equal(
      db.prepare("SELECT expires_ms FROM grants WHERE id=?").get(legacy.grantId)
        ?.expires_ms,
      Number.MAX_SAFE_INTEGER,
    )
  } finally {
    db.close()
  }

  const retried = await rotateCredential(legacy.credential)
  assert.equal(retried.status, 200)
  assert.equal((await readTokens(retried)).refresh_token, tokens.refresh_token)
})
test("legacy renewal cannot resurrect explicit grant/session revocation or a disabled account", async (t) => {
  const cases = await Promise.all(
    (["grant", "session", "used", "disabled"] as const).map(async (reason) => {
      const session = await freshSession()
      const grant = await legacyConnection(session)

      if (reason === "grant") {
        assert.equal(
          (
            await request("/oauth/revoke", "POST", {
              client_id: clientId,
              token: grant.credential,
            })
          ).status,
          200,
        )
      } else if (reason === "session") {
        requireInitializedF().accounts.revokeAccountSession(session.sid)
      } else if (reason === "used") {
        const db = new DatabaseSync(file(session.owner))

        try {
          db.prepare("UPDATE refresh SET used=1 WHERE grant_id=?").run(
            grant.grantId,
          )
        } finally {
          db.close()
        }
      }

      return { reason, grant }
    }),
  )
  const now = Date.now()
  t.mock.method(Date, "now", () => now + 2 * 24 * 60 * 60 * 1000)

  try {
    await Promise.all(
      cases
        .filter((item) => item.reason !== "disabled")
        .map(async (item) => {
          assert.equal(
            (await rotateCredential(item.grant.credential)).status,
            400,
          )
        }),
    )
    const disabled = cases.find((item) => item.reason === "disabled")
    assert.ok(disabled)
    requireInitializedF()
      .db.prepare("UPDATE accounts SET disabled=1 WHERE id=?")
      .run(requireInitializedF().sessions[0].owner)
    assert.equal(
      (await rotateCredential(disabled.grant.credential)).status,
      400,
    )
  } finally {
    requireInitializedF()
      .db.prepare("UPDATE accounts SET disabled=0 WHERE id=?")
      .run(requireInitializedF().sessions[0].owner)
  }
})
test("client revocation and actual native-session logout revoke OAuth access", async () => {
  const grant = await linked()
  assert.equal(
    (
      await request("/oauth/revoke", "POST", {
        client_id: clientId,
        token: grant.tokens.refresh_token,
      })
    ).status,
    200,
  )
  await assert.rejects(
    requireInitializedIssuer().verifyAccessToken(grant.tokens.access_token),
  )
  assert.equal((await rotateCredential(grant.tokens.refresh_token)).status, 400)
  assert.equal((await exchange(grant)).status, 400)
  const minted = await requireInitializedF().tokens.mintToken(
    requireInitializedF().sessions[0].owner,
    "manager",
  )
  const claims = await requireInitializedF().tokens.verifyToken(minted.token)
  assert.ok(claims.sid)
  const other = await linked({
    owner: requireInitializedF().sessions[0].owner,
    sid: claims.sid,
    token: minted.token,
  })
  requireInitializedF().accounts.revokeAccountSession(claims.sid)
  await assert.rejects(
    requireInitializedIssuer().verifyAccessToken(other.tokens.access_token),
  )
})
test("explicit logout with an expired signed native token retires only its connection anchor", async (t) => {
  const session = await freshSession()
  const grant = await linked(session)
  const now = Date.now()
  t.mock.method(Date, "now", () => now + 13 * 60 * 60 * 1000)
  const { auth } = await import("@razzia/socket/api/routes/auth")
  const malformed = await auth.request("/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${session.token.slice(0, -3)}aaa` },
  })
  assert.equal(malformed.status, 401)
  assert.ok(
    requireInitializedF()
      .db.prepare("SELECT id FROM sessions WHERE id=? AND user_id=?")
      .get(session.sid, session.owner),
  )
  const response = await auth.request("/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${session.token}` },
  })
  assert.equal(response.status, 200)
  const guest = z
    .object({ role: z.string(), clientId: z.string() })
    .parse((await response.json()) as unknown)
  assert.equal(guest.role, "player")
  assert.notEqual(guest.clientId, session.owner)
  assert.equal(
    requireInitializedF()
      .db.prepare("SELECT id FROM sessions WHERE id=? AND user_id=?")
      .get(session.sid, session.owner),
    undefined,
  )
  assert.ok(
    requireInitializedF()
      .db.prepare("SELECT id FROM sessions WHERE id=? AND user_id=?")
      .get(
        requireInitializedF().sessions[1].sid,
        requireInitializedF().sessions[1].owner,
      ),
  )
  assert.equal((await rotateCredential(grant.tokens.refresh_token)).status, 400)
  await assert.rejects(
    requireInitializedIssuer().verifyAccessToken(grant.tokens.access_token),
  )
})
test("actual password reset deletes persistent connection anchors and invalidates refresh immediately", async () => {
  const address = "persistent-reset-fixture@example.invalid"
  const account = await requireInitializedF().accounts.registerAccount(
    address,
    "Synthetic-original-password-2026",
  )
  const verification = requireInitializedF().accounts.issueCode(
    account.id,
    "verify",
  )
  assert.ok(
    requireInitializedF().accounts.consumeCode(address, "verify", verification),
  )
  const minted = await requireInitializedF().tokens.mintToken(
    account.id,
    "manager",
  )
  const claims = await requireInitializedF().tokens.verifyToken(minted.token)
  assert.ok(claims.sid)
  const grant = await linked({
    owner: account.id,
    sid: claims.sid,
    token: minted.token,
  })
  const reset = requireInitializedF().accounts.issueCode(account.id, "reset")
  assert.equal(
    await requireInitializedF().accounts.resetPassword(
      address,
      reset,
      "Synthetic-updated-password-2026",
    ),
    true,
  )
  await assert.rejects(requireInitializedF().tokens.verifyToken(minted.token))
  await assert.rejects(
    requireInitializedIssuer().verifyAccessToken(grant.tokens.access_token),
  )
  assert.equal((await rotateCredential(grant.tokens.refresh_token)).status, 400)
})
test("real OAuth HTTP tools persist tenant drafts, atomic CAS and durable idempotency without native writes", async () => {
  const a = await linked(requireInitializedF().sessions[0])
  const b = await linked(requireInitializedF().sessions[1])
  const remote = requireInitializedIssuer().remote({
    allowedOrigins: [],
    dependencies: {
      authoring: policy,
      drafts: requireInitializedIssuer().draftRepository(policy),
      rateLimit: () => Promise.resolve(true),
    },
  })
  let id = 0
  const rpc = async (token: string, name: string, args: unknown) => {
    const response = await remote.fetch(
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
          id: (id += 1),
          method: "tools/call",
          params: { name, arguments: args },
        }),
      }),
    )
    assert.equal(response.status, 200, await response.clone().text())
    const body = await response.text()
    const wire = response.headers
      .get("content-type")
      ?.startsWith("text/event-stream")
      ? requireOAuthObservationRecord(
          JSON.parse(
            requireOAuthObservationPresent(
              body
                .split("\n")
                .filter((line) => line.startsWith("data: "))
                .at(-1),
            ).slice(6),
          ),
        )
      : requireOAuthObservationRecord(JSON.parse(body))
    assert.equal(JSON.stringify(wire).includes(token), false)
    assert.equal(
      JSON.stringify(wire).includes(requireInitializedF().syntheticSecret),
      false,
    )

    return requireOAuthObservationRecord(
      requireOAuthObservationRecord(wire.result).structuredContent,
    )
  }
  const input = createInput("Actual synthetic OAuth draft")
  const created = await rpc(a.tokens.access_token, "create_game_draft", input)
  assert.equal(created.ok, true, JSON.stringify(created))
  const draftId = requireOAuthObservationString(
    requireOAuthObservationRecord(created.data).draftId,
  )

  assert.deepEqual(
    (await rpc(a.tokens.access_token, "create_game_draft", input)).data,
    created.data,
  )
  assert.equal(
    requireOAuthObservationRecord(
      (
        await rpc(b.tokens.access_token, "get_game_draft", {
          contractVersion: "0.1.0",
          draftId,
        })
      ).error,
    ).code,
    "NOT_FOUND",
  )
  const update = {
    ...input,
    draftId,
    expectedRevision: 1,
    idempotencyKey: key(),
  }
  delete (update as { locale?: string }).locale
  const results = await Promise.all(
    [update, { ...update, idempotencyKey: key() }].map((body) =>
      rpc(a.tokens.access_token, "update_game_draft", body),
    ),
  )
  assert.equal(results.filter((result) => result.ok).length, 1)
  assert.equal(
    requireOAuthObservationRecord(
      requireOAuthObservationPresent(results.find((result) => !result.ok))
        .error,
    ).code,
    "REVISION_CONFLICT",
  )
  const read = await rpc(a.tokens.access_token, "get_game_draft", {
    contractVersion: "0.1.0",
    draftId,
  })
  assert.equal(requireOAuthObservationRecord(read.data).revision, 2)
  const p = await requireInitializedIssuer().verifyAccessToken(
    a.tokens.access_token,
  )
  await assert.rejects(
    requireInitializedIssuer()
      .draftRepository(policy)
      .get({ ...p }, draftId),
    /SCOPE_REQUIRED/u,
  )
  assert.equal(existsSync(join(requireInitializedF().root, "quizzes")), false)
  assert.equal(
    readFileSync(
      join(requireInitializedF().root, "native-sentinels/quiz.json"),
      "utf8",
    ),
    '{"sentinel":"synthetic-global-do-not-touch"}\n',
  )
})
test("hostile headers, oversized bodies and grant journals are rejected without recovery or disclosure", async () => {
  assert.equal(
    (
      await request("/oauth/token", "POST", {}, undefined, {
        "content-length": "65537",
      })
    ).status,
    413,
  )
  assert.equal(
    (
      await request("/oauth/token", "POST", {}, undefined, {
        "x-forwarded-host": "attacker.invalid",
      })
    ).status,
    400,
  )
  const grant = await linked()
  const path = file(requireInitializedF().sessions[0].owner)
  const priorBytes2 = readFileSync(path)
  writeFileSync(`${path}-journal`, "synthetic-unresolved-journal")

  try {
    await assert.rejects(
      requireInitializedIssuer().verifyAccessToken(grant.tokens.access_token),
    )
    assert.deepEqual(readFileSync(path), priorBytes2)
    assert.equal(
      readFileSync(`${path}-journal`, "utf8"),
      "synthetic-unresolved-journal",
    )
  } finally {
    unlinkSync(`${path}-journal`)
  }
})
