import assert from "node:assert/strict"
import { after, before, test } from "node:test"
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
import { createFirstPartyOAuth } from "../../first-party/oauth.ts"
import type { FirstPartyOAuthOptions } from "../../first-party/oauth.ts"
import { fixture, createInput, key, origin, policy } from "./fixtures.ts"
import type { Session } from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
let issuer: Awaited<ReturnType<typeof createFirstPartyOAuth>>
let options: FirstPartyOAuthOptions
const clientId = "private-synthetic-chat-client"
const redirectUri = "https://host.example.invalid/oauth/callback"
const config = {
  issuer: origin + "/oauth",
  resource: origin + "/mcp",
  resourceMetadataUrl: origin + "/.well-known/oauth-protected-resource/mcp",
}
const scope = "tadazz.catalog.read tadazz.drafts.read tadazz.drafts.write"
before(async () => {
  f = await fixture()
  const pair = generateKeyPairSync("ed25519")
  options = {
    config,
    configRoot: f.root,
    consentPageUrl: origin + "/studio/oauth-consent",
    keyId: "synthetic-oauth-issuer",
    signingPrivateKeyPem: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    ticketEncryptionKey: randomBytes(32),
    clients: [
      { clientId, redirectUris: [redirectUri], scopes: scope.split(" ") },
    ],
  }
  issuer = await createFirstPartyOAuth(options)
})
after(() => f?.close())
const file = (owner: string) =>
  join(f.root, "tenants", owner, "extensions/mcp-oauth/grants.sqlite")
function request(
  path: string,
  method = "GET",
  body?: Record<string, string>,
  session?: Session,
  extra: Record<string, string> = {},
  instance = issuer,
) {
  const firstParty = path === "/oauth/inspect" || path === "/oauth/approve"
  return instance.fetch(
    new Request(origin + path, {
      method,
      headers: {
        host: new URL(origin).host,
        ...(session ? { authorization: "Bearer " + session.token } : {}),
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
    "/oauth/authorize?" + new URLSearchParams(params),
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
async function approve(session = f.sessions[0], instance = issuer) {
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
  const review = await inspected.json()
  assert.deepEqual(review.scopes, scope.split(" "))
  const allowed = await request(
    "/oauth/approve",
    "POST",
    { ticket: begun.ticket, proof: review.proof, decision: "allow" },
    session,
    {},
    instance,
  )
  assert.equal(allowed.status, 200, await allowed.clone().text())
  const result = await allowed.json()
  const redirect = new URL(result.redirectUrl)
  assert.equal(redirect.origin + redirect.pathname, redirectUri)
  assert.equal(redirect.searchParams.get("state"), begun.state)
  assert.equal(redirect.searchParams.get("iss"), config.issuer)
  return {
    ...begun,
    grantId: result.grantId as string,
    code: redirect.searchParams.get("code")!,
  }
}
async function exchange(
  grant: Awaited<ReturnType<typeof approve>>,
  changes: Record<string, string> = {},
  instance = issuer,
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
async function linked(session = f.sessions[0]) {
  const grant = await approve(session)
  const response = await exchange(grant)
  assert.equal(response.status, 200, await response.clone().text())
  return { ...grant, tokens: await response.json() }
}
test("discovery and JWKS expose public configuration without creating a tenant grant store", async () => {
  const response = await request(
    "/.well-known/oauth-authorization-server/oauth",
  )
  assert.equal(response.status, 200)
  const metadata = await response.json()
  assert.equal(metadata.issuer, config.issuer)
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"])
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ["none"])
  const jwks = await (await request("/oauth/jwks.json")).json()
  assert.equal(jwks.keys[0].kty, "OKP")
  assert.equal(jwks.keys[0].d, undefined)
  assert.equal(existsSync(file(f.sessions[0].owner)), false)
  assert.equal(existsSync(join(f.root, "grants.sqlite")), false)
})
test("exact client/redirect/resource/PKCE/scope admission rejects unsafe authorization requests", async () => {
  for (const changes of [
    { client_id: "unknown" },
    { redirect_uri: "https://attacker.invalid/callback" },
    { redirect_uri: redirectUri + "/" },
    { resource: config.issuer },
    { code_challenge_method: "plain" },
    { scope: "tadazz.library.write" },
    { scope: scope + " tadazz.drafts.read" },
    { state: "short" },
  ] as Array<Record<string, string>>)
    assert.equal((await begin(changes)).response.status, 400)
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
    f.sessions[0],
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
    f.sessions[0],
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
  const principal = await issuer.verifyAccessToken(tokens.access_token)
  assert.equal(principal.clientId, clientId)
  assert.equal(principal.accountId, f.sessions[0].owner)
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
        f.sessions[0],
        { origin: "https://attacker.invalid" },
      )
    ).status,
    403,
  )
  const review = await (
    await request(
      "/oauth/inspect",
      "POST",
      { ticket: begun.ticket },
      f.sessions[0],
    )
  ).json()
  assert.equal(
    (
      await request(
        "/oauth/approve",
        "POST",
        { ticket: begun.ticket, proof: review.proof, decision: "allow" },
        f.sessions[1],
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
        f.sessions[0],
      )
    ).status,
    403,
  )
  assert.equal(existsSync(file(f.sessions[1].owner)), false)
})
test("real account PKCE flow stores only token digests and survives a fresh issuer instance", async () => {
  const grant = await linked()
  const p = await issuer.verifyAccessToken(grant.tokens.access_token)
  assert.equal(p.accountId, f.sessions[0].owner)
  assert.equal(p.grantId, grant.grantId)
  assert.equal(p.clientId, clientId)
  const bytes = readFileSync(file(p.accountId))
  for (const secret of [
    grant.tokens.access_token,
    grant.tokens.refresh_token,
    grant.code,
    grant.ticket,
    f.sessions[0].token,
  ])
    assert.equal(bytes.includes(Buffer.from(secret)), false)
  assert.equal(statSync(file(p.accountId)).mode & 0o777, 0o600)
  const reopened = await createFirstPartyOAuth(options)
  assert.equal(
    (await reopened.verifyAccessToken(grant.tokens.access_token)).grantId,
    grant.grantId,
  )
  const before = readFileSync(file(p.accountId))
  const mtime = statSync(file(p.accountId)).mtimeMs
  await reopened.verifyAccessToken(grant.tokens.access_token)
  assert.deepEqual(readFileSync(file(p.accountId)), before)
  assert.equal(statSync(file(p.accountId)).mtimeMs, mtime)
})
test("wrong PKCE/client/resource/redirect cannot consume a valid code; correct code replay revokes its grant", async () => {
  const grant = await approve()
  for (const changes of [
    { code_verifier: randomBytes(32).toString("base64url") },
    { client_id: "unknown" },
    { resource: config.issuer },
    { redirect_uri: "https://attacker.invalid/callback" },
  ] as Array<Record<string, string>>)
    assert.equal((await exchange(grant, changes)).status, 400)
  const response = await exchange(grant)
  assert.equal(response.status, 200)
  const tokens = await response.json()
  assert.equal(
    (await issuer.verifyAccessToken(tokens.access_token)).grantId,
    grant.grantId,
  )
  assert.equal((await exchange(grant)).status, 400)
  await assert.rejects(
    issuer.verifyAccessToken(tokens.access_token),
    /SCOPE_REQUIRED/u,
  )
})
test("refresh rotates once, and replay durably revokes both old and newly issued access", async () => {
  const grant = await linked()
  const refresh = {
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: grant.tokens.refresh_token,
    resource: config.resource,
  }
  const response = await request("/oauth/token", "POST", refresh)
  assert.equal(response.status, 200)
  const rotated = await response.json()
  assert.notEqual(rotated.refresh_token, refresh.refresh_token)
  await issuer.verifyAccessToken(rotated.access_token)
  assert.equal((await request("/oauth/token", "POST", refresh)).status, 400)
  await assert.rejects(issuer.verifyAccessToken(grant.tokens.access_token))
  await assert.rejects(issuer.verifyAccessToken(rotated.access_token))
  const reopened = await createFirstPartyOAuth(options)
  await assert.rejects(reopened.verifyAccessToken(rotated.access_token))
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
  await assert.rejects(issuer.verifyAccessToken(grant.tokens.access_token))
  const minted = await f.tokens.mintToken(f.sessions[0].owner, "manager")
  const claims = await f.tokens.verifyToken(minted.token)
  assert.ok(claims.sid)
  const other = await linked({
    owner: f.sessions[0].owner,
    sid: claims.sid,
    token: minted.token,
  })
  f.accounts.revokeAccountSession(claims.sid)
  await assert.rejects(issuer.verifyAccessToken(other.tokens.access_token))
})
test("real OAuth HTTP tools persist tenant drafts, atomic CAS and durable idempotency without native writes", async () => {
  const a = await linked(f.sessions[0])
  const b = await linked(f.sessions[1])
  const remote = issuer.remote({
    allowedOrigins: [],
    dependencies: {
      authoring: policy,
      drafts: issuer.draftRepository(policy),
      rateLimit: async () => true,
    },
  })
  let id = 0
  const rpc = async (token: string, name: string, args: unknown) => {
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
          id: ++id,
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
      ? JSON.parse(
          body
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .at(-1)!
            .slice(6),
        )
      : JSON.parse(body)
    assert.equal(JSON.stringify(wire).includes(token), false)
    assert.equal(JSON.stringify(wire).includes(f.syntheticSecret), false)
    return wire.result.structuredContent
  }
  const input = createInput("Actual synthetic OAuth draft")
  const created = await rpc(a.tokens.access_token, "create_game_draft", input)
  assert.equal(created.ok, true, JSON.stringify(created))
  const draftId = created.data.draftId
  assert.deepEqual(
    (await rpc(a.tokens.access_token, "create_game_draft", input)).data,
    created.data,
  )
  assert.equal(
    (
      await rpc(b.tokens.access_token, "get_game_draft", {
        contractVersion: "0.1.0",
        draftId,
      })
    ).error.code,
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
    results.find((result) => !result.ok).error.code,
    "REVISION_CONFLICT",
  )
  const read = await rpc(a.tokens.access_token, "get_game_draft", {
    contractVersion: "0.1.0",
    draftId,
  })
  assert.equal(read.data.revision, 2)
  const p = await issuer.verifyAccessToken(a.tokens.access_token)
  await assert.rejects(
    issuer.draftRepository(policy).get({ ...p }, draftId),
    /SCOPE_REQUIRED/u,
  )
  assert.equal(existsSync(join(f.root, "quizzes")), false)
  assert.equal(
    readFileSync(join(f.root, "native-sentinels/quiz.json"), "utf8"),
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
  const path = file(f.sessions[0].owner)
  const before = readFileSync(path)
  writeFileSync(path + "-journal", "synthetic-unresolved-journal")
  try {
    await assert.rejects(issuer.verifyAccessToken(grant.tokens.access_token))
    assert.deepEqual(readFileSync(path), before)
    assert.equal(
      readFileSync(path + "-journal", "utf8"),
      "synthetic-unresolved-journal",
    )
  } finally {
    unlinkSync(path + "-journal")
  }
})
