import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { createFirstPartyOAuth } from "../../src/mcp-app/first-party/oauth.ts"
import {
  fixture,
  origin,
  key,
} from "../../src/mcp-app/tests/first-party/fixtures.ts"
import { authorizePkceGrant } from "./oauth-flow.ts"
import { createEphemeralOAuthKeys, createPkcePair } from "./harness.ts"

const scopes = [
  "tadazz.catalog.read",
  "tadazz.drafts.read",
  "tadazz.drafts.write",
]
const clients = [
  {
    clientId: "synthetic-chat-client",
    redirectUris: ["https://chat.example.invalid/callback"],
    scopes,
  },
  {
    clientId: "synthetic-other-client",
    redirectUris: ["https://other.example.invalid/callback"],
    scopes,
  },
] as const
const tokenSchema = z.strictObject({
  access_token: z.string().min(40),
  refresh_token: z.string().min(40),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  scope: z.string(),
})
const approvalSchema = z.strictObject({
  redirectUrl: z.url(),
  grantId: z.string(),
})
const proofSchema = z.object({ proof: z.string().regex(/^[a-f0-9]{64}$/u) })

async function setup() {
  const f = await fixture()
  const issuer = await createFirstPartyOAuth({
    configRoot: f.root,
    config: {
      issuer: `${origin}/oauth`,
      resource: `${origin}/mcp`,
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource`,
    },
    consentPageUrl: `${origin}/studio/oauth-consent`,
    ...createEphemeralOAuthKeys(),
    clients,
  })
  const fetchImpl: typeof fetch = (input, init) => {
    const request = new Request(input, init)
    request.headers.set("host", new URL(origin).host)

    return issuer.fetch(request)
  }
  const form = (path: string, fields: Record<string, string>) =>
    fetchImpl(origin + path, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    })
  const consent = (
    path: string,
    body: unknown,
    auth: { token: string; origin?: string } = { token: f.sessions[0].token },
  ) =>
    fetchImpl(origin + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.token}`,
        origin: auth.origin ?? origin,
      },
      body: JSON.stringify(body),
    })

  return { f, issuer, fetchImpl, form, consent }
}
type Environment = Awaited<ReturnType<typeof setup>>
let shared: Environment | undefined = undefined
before(async () => {
  shared = await setup()
})
after(() => shared?.f.close())
function currentEnvironment(): Environment {
  assert(shared)

  return shared
}

async function link(env: Environment, index: 0 | 1) {
  const selected = clients[index]
  const captured: { tokens?: z.infer<typeof tokenSchema> } = {}
  const grant = await authorizePkceGrant({
    origin,
    nativeToken: env.f.sessions[0].token,
    scopes,
    clientId: selected.clientId,
    redirectUri: selected.redirectUris[0],
    verifyConsentHead: false,
    fetchImpl: async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)

      if (url.pathname === "/oauth/token") {
        const original = new URLSearchParams(await request.clone().text())
        const foreign = Object.fromEntries(original)
        foreign.client_id = clients[index === 0 ? 1 : 0].clientId
        const denied = await env.form("/oauth/token", foreign)
        assert.equal(denied.status, 400)
        assert.deepEqual(await denied.json(), { error: "invalid_grant" })
      }

      const response = await env.fetchImpl(request)

      if (url.pathname === "/oauth/approve") {
        const approved = approvalSchema.parse(await response.clone().json())
        const callback = new URL(approved.redirectUrl)
        assert.equal(
          callback.origin + callback.pathname,
          selected.redirectUris[0],
        )
        assert.equal(callback.searchParams.get("iss"), `${origin}/oauth`)
        assert.equal(
          approved.redirectUrl.includes(env.f.sessions[0].token),
          false,
        )
      }

      if (url.pathname === "/oauth/token") {
        captured.tokens = tokenSchema.parse(await response.clone().json())
      }

      return response
    },
  })
  assert(captured.tokens)

  return { ...grant, tokens: captured.tokens }
}

test("two registered public clients cannot consume, rotate or revoke each other's grant", async () => {
  const env = currentEnvironment()
  const first = await link(env, 0)
  const second = await link(env, 1)
  assert.notEqual(first.grantId, second.grantId)
  assert.equal(
    (await env.issuer.verifyAccessToken(first.accessToken)).clientId,
    clients[0].clientId,
  )
  assert.equal(
    (await env.issuer.verifyAccessToken(second.accessToken)).clientId,
    clients[1].clientId,
  )
  const refresh = {
    grant_type: "refresh_token",
    client_id: clients[0].clientId,
    refresh_token: first.tokens.refresh_token,
    resource: `${origin}/mcp`,
  }
  for (const changes of [
    { client_id: clients[1].clientId },
    { resource: `${origin}/other-resource` },
  ]) {
    const denied = await env.form("/oauth/token", { ...refresh, ...changes })
    assert.equal(denied.status, 400)
    assert.deepEqual(await denied.json(), { error: "invalid_grant" })
    await env.issuer.verifyAccessToken(first.accessToken)
  }
  const wrongRevoke = await env.form("/oauth/revoke", {
    client_id: clients[1].clientId,
    token: first.tokens.refresh_token,
  })
  assert.equal(wrongRevoke.status, 200)
  await env.issuer.verifyAccessToken(first.accessToken)
  const rotatedResponse = await env.form("/oauth/token", refresh)
  assert.equal(rotatedResponse.status, 200)
  const rotated = tokenSchema.parse(await rotatedResponse.json())
  assert.notEqual(rotated.refresh_token, first.tokens.refresh_token)
  assert.equal(
    (await env.issuer.verifyAccessToken(rotated.access_token)).grantId,
    first.grantId,
  )
  const revoked = await env.form("/oauth/revoke", {
    client_id: clients[0].clientId,
    token: rotated.refresh_token,
  })
  assert.equal(revoked.status, 200)
  await assert.rejects(
    env.issuer.verifyAccessToken(first.accessToken),
    /SCOPE_REQUIRED/u,
  )
  await assert.rejects(
    env.issuer.verifyAccessToken(rotated.access_token),
    /SCOPE_REQUIRED/u,
  )
  assert.equal(
    (await env.issuer.verifyAccessToken(second.accessToken)).grantId,
    second.grantId,
  )
  const bytes = readFileSync(
    join(
      env.f.root,
      "tenants",
      env.f.sessions[0].owner,
      "extensions/mcp-oauth/grants.sqlite",
    ),
  )
  for (const secret of [
    first.accessToken,
    first.tokens.refresh_token,
    first.ticket,
    second.accessToken,
    second.tokens.refresh_token,
    second.ticket,
    rotated.access_token,
    rotated.refresh_token,
    env.f.sessions[0].token,
  ]) {
    assert.equal(bytes.includes(Buffer.from(secret)), false)
  }
})

async function begin(env: Environment) {
  const { verifier, challenge } = createPkcePair()
  const state = key()
  const response = await env.fetchImpl(
    `${origin}/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clients[0].clientId,
      redirect_uri: clients[0].redirectUris[0],
      resource: `${origin}/mcp`,
      scope: scopes.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })}`,
  )
  assert.equal(response.status, 302)
  const ticket = new URL(
    response.headers.get("location") ?? "",
  ).searchParams.get("oauth_request")
  assert(ticket)

  return { ticket, state, verifier }
}

test("consent proofs bind same-account session and ticket nonce, and approval replay is rejected", async () => {
  const env = currentEnvironment()
  const first = await begin(env)
  const other = await begin(env)
  const inspection = await env.consent("/oauth/inspect", {
    ticket: first.ticket,
  })
  assert.equal(inspection.status, 200)
  const { proof } = proofSchema.parse(await inspection.json())
  const approval = { ticket: first.ticket, proof, decision: "allow" }
  const otherSession = await env.f.tokens.mintToken(
    env.f.sessions[0].owner,
    "manager",
  )
  for (const attempt of [
    { body: approval, auth: { token: otherSession.token } },
    {
      body: { ...approval, ticket: other.ticket },
      auth: { token: env.f.sessions[0].token },
    },
    {
      body: approval,
      auth: {
        token: env.f.sessions[0].token,
        origin: "https://attacker.invalid",
      },
    },
  ]) {
    const rejected = await env.consent(
      "/oauth/approve",
      attempt.body,
      attempt.auth,
    )
    assert.equal(rejected.status, 403)
    assert.deepEqual(await rejected.json(), { error: "access_denied" })
  }
  const approvedResponse = await env.consent("/oauth/approve", approval)
  assert.equal(approvedResponse.status, 200)
  assert.equal(approvedResponse.headers.get("cache-control"), "no-store")
  assert.equal(approvedResponse.headers.get("referrer-policy"), "no-referrer")
  const approved = approvalSchema.parse(await approvedResponse.json())
  const callback = new URL(approved.redirectUrl)
  assert.equal(callback.searchParams.get("state"), first.state)
  assert.equal(callback.searchParams.get("iss"), `${origin}/oauth`)
  assert.equal(approved.redirectUrl.includes(env.f.sessions[0].token), false)
  const replay = await env.consent("/oauth/approve", approval)
  assert.equal(replay.status, 400)
  assert.deepEqual(await replay.json(), { error: "invalid_grant" })
  const code = callback.searchParams.get("code")
  assert(code)
  const exchanged = await env.form("/oauth/token", {
    grant_type: "authorization_code",
    client_id: clients[0].clientId,
    redirect_uri: clients[0].redirectUris[0],
    resource: `${origin}/mcp`,
    code,
    code_verifier: first.verifier,
  })
  assert.equal(exchanged.status, 200)
  const tokens = tokenSchema.parse(await exchanged.json())
  assert.equal(
    (await env.issuer.verifyAccessToken(tokens.access_token)).grantId,
    approved.grantId,
  )
})
