import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { CONSENT_SECURITY_HEADERS } from "../../src/mcp-app/native-host/index.ts"
import { createPkcePair } from "./harness.ts"

export interface NativeAccountSession {
  readonly accountId: string
  readonly email: string
  readonly token: string
  readonly cookieHeader: string
}

export interface PkceGrantSession {
  readonly accessToken: string
  readonly grantId: string
  readonly ticket: string
}

export async function registerAndLoginAccount(options: {
  readonly origin: string
  readonly fetchImpl: typeof globalThis.fetch
  readonly email: string
  readonly password: string
  readonly codes: ReadonlyMap<string, string>
}): Promise<NativeAccountSession> {
  const { origin, fetchImpl, email, password, codes } = options
  const regRes = await fetchImpl(`${origin}/api/accounts/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  assert.equal(regRes.status, 202, `Register failed for ${email}`)

  const code = codes.get(email.toLowerCase())

  assert.match(code ?? "", /^\d{6}$/u, `Expected 6-digit code for ${email}`)

  const verifyRes = await fetchImpl(`${origin}/api/accounts/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, code }),
  })

  assert.equal(verifyRes.status, 200, `Verify failed for ${email}`)

  const loginRes = await fetchImpl(`${origin}/api/accounts/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  assert.equal(loginRes.status, 200, `Login failed for ${email}`)

  const loginJson = (await loginRes.json()) as { readonly token: string }
  const rawSetCookies = loginRes.headers.getSetCookie()
  const cookieHeader = rawSetCookies
    .map((entry) => entry.split(";", 1)[0] ?? "")
    .filter((pair) => pair.length > 0)
    .join("; ")

  const meRes = await fetchImpl(`${origin}/api/accounts/me`, {
    headers: { Authorization: `Bearer ${loginJson.token}` },
  })

  assert.equal(meRes.status, 200)

  const meJson = (await meRes.json()) as {
    readonly id: string
    readonly email: string
  }

  return {
    accountId: meJson.id,
    email: meJson.email,
    token: loginJson.token,
    cookieHeader,
  }
}

export async function authorizePkceGrant(options: {
  readonly origin: string
  readonly fetchImpl: typeof globalThis.fetch
  readonly nativeToken: string
  readonly scopes: readonly string[]
  readonly clientId?: string
  readonly redirectUri?: string
  readonly verifyConsentHead?: boolean
}): Promise<PkceGrantSession> {
  const { origin, fetchImpl, nativeToken, scopes } = options
  const clientId = options.clientId ?? "tadazz-chatgpt-client"
  const redirectUri = options.redirectUri ?? `${origin}/oauth/callback`
  const { verifier, challenge } = createPkcePair()
  const state = randomBytes(16).toString("base64url")
  const authorizeUrl = new URL(`${origin}/oauth/authorize`)

  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("client_id", clientId)
  authorizeUrl.searchParams.set("redirect_uri", redirectUri)
  authorizeUrl.searchParams.set("scope", scopes.join(" "))
  authorizeUrl.searchParams.set("state", state)
  authorizeUrl.searchParams.set("code_challenge", challenge)
  authorizeUrl.searchParams.set("code_challenge_method", "S256")
  authorizeUrl.searchParams.set("resource", `${origin}/mcp`)

  const authRes = await fetchImpl(authorizeUrl.toString())

  assert.equal(authRes.status, 302)

  const location = authRes.headers.get("location") ?? ""
  const consentUrl = new URL(location)

  assert.equal(consentUrl.origin, origin)
  assert.equal(consentUrl.pathname, "/studio/oauth-consent")

  const ticket = consentUrl.searchParams.get("oauth_request") ?? ""

  assert.ok(ticket.length >= 40)

  if (options.verifyConsentHead !== false) {
    const headRes = await fetchImpl(consentUrl.toString(), { method: "HEAD" })

    assert.equal(headRes.status, 200)
    assert.equal(await headRes.text(), "")
    assert.match(
      headRes.headers.get("content-security-policy") ?? "",
      /frame-ancestors\s+'none'/u,
    )
    assert.equal(
      headRes.headers.get("x-frame-options"),
      CONSENT_SECURITY_HEADERS["X-Frame-Options"],
    )
    assert.equal(
      headRes.headers.get("referrer-policy"),
      CONSENT_SECURITY_HEADERS["Referrer-Policy"],
    )
    assert.equal(
      headRes.headers.get("cache-control"),
      CONSENT_SECURITY_HEADERS["Cache-Control"],
    )
  }

  const inspectRes = await fetchImpl(`${origin}/oauth/inspect`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${nativeToken}`,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ticket }),
  })

  assert.equal(inspectRes.status, 200)

  const inspectJson = (await inspectRes.json()) as { readonly proof: string }
  const approveRes = await fetchImpl(`${origin}/oauth/approve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${nativeToken}`,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ticket,
      decision: "allow",
      proof: inspectJson.proof,
    }),
  })

  assert.equal(approveRes.status, 200)

  const approveJson = (await approveRes.json()) as {
    readonly redirectUrl: string
    readonly grantId: string
  }
  const callback = new URL(approveJson.redirectUrl)

  assert.equal(callback.searchParams.get("state"), state)

  const code = callback.searchParams.get("code") ?? ""

  assert.ok(code.length > 0)

  const tokenForm = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
    resource: `${origin}/mcp`,
  })
  const tokenRes = await fetchImpl(`${origin}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenForm.toString(),
  })

  assert.equal(tokenRes.status, 200)

  const tokenJson = (await tokenRes.json()) as { readonly access_token: string }

  return {
    accessToken: tokenJson.access_token,
    grantId: approveJson.grantId,
    ticket,
  }
}
