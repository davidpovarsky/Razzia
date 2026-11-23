import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createOAuthConsentClient } from "../../../components/oauth-consent/client"
import { createFirstPartyOAuth } from "../../first-party/oauth.ts"
import {
  fixture,
  origin,
  requireObservedRecord,
  requireObservedString,
} from "./fixtures.ts"

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
const clientId = "synthetic-real-consent-client"
const redirectUri = "https://host.example.invalid/consent/callback"
const resource = `${origin}/mcp`

const scopes = ["tadazz.catalog.read", "tadazz.drafts.read"]
before(async () => {
  f = await fixture()
  const pair = generateKeyPairSync("ed25519")
  issuer = await createFirstPartyOAuth({
    configRoot: requireInitializedF().root,
    config: {
      issuer: `${origin}/oauth`,
      resource,
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
    },
    keyId: "synthetic-consent-boundary",
    signingPrivateKeyPem: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    ticketEncryptionKey: randomBytes(32),
    consentPageUrl: `${origin}/studio/oauth-consent`,
    clients: [{ clientId, redirectUris: [redirectUri], scopes }],
  })
})
after(() => f?.close())

const grantFile = (owner: string) =>
  join(
    requireInitializedF().root,
    "tenants",
    owner,
    "extensions/mcp-oauth/grants.sqlite",
  )
async function begin() {
  const verifier = randomBytes(32).toString("base64url")
  const state = randomBytes(24).toString("base64url")
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    resource,
    scope: scopes.join(" "),
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  })
  const response = await requireInitializedIssuer().fetch(
    new Request(origin + "/oauth/authorize?" + query, {
      headers: { host: new URL(origin).host },
    }),
  )
  assert.equal(response.status, 302)
  const target = new URL(response.headers.get("location")!)
  assert.equal(
    target.origin + target.pathname,
    `${origin}/studio/oauth-consent`,
  )
  const ticket = target.searchParams.get("oauth_request")
  assert.ok(ticket)

  return { ticket, state, verifier }
}

/**
 * No issuer/auth/store stub: only browser-added Host/Origin are supplied here.
 * This fetch bridge is not a browser click, deployed page, TLS or host install.
 */

function bridge(
  getToken: () => string | null,
  receive?: (response: Response) => Promise<Response>,
) {
  const calls: string[] = []
  const request: typeof fetch = async (input, init) => {
    assert.equal(typeof input, "string")
    assert.ok(input === "/oauth/inspect" || input === "/oauth/approve")
    assert.equal(init?.credentials, "same-origin")
    assert.equal(init?.redirect, "error")
    assert.equal(init?.referrerPolicy, "no-referrer")
    const headers = new Headers(init?.headers)
    headers.set("host", new URL(origin).host)
    headers.set("origin", origin)
    calls.push(String(input))
    const response = await requireInitializedIssuer().fetch(
      new Request(origin + input, { ...init, headers }),
    )
    assert.equal(response.headers.get("cache-control"), "no-store")

    return receive ? receive(response) : response
  }

  return {
    calls,
    client: createOAuthConsentClient({
      issuerBasePath: "/oauth",
      getNativeToken: getToken,
      request,
    }),
  }
}

test("real consent client inspects without a grant, then explicitly approves the native-session-bound request", async () => {
  const begun = await begin()
  const [{ owner }] = requireInitializedF().sessions
  const sentinel = join(
    requireInitializedF().root,
    "tenants",
    owner,
    "native-sentinels/quiz.json",
  )
  const priorBytes = readFileSync(sentinel)
  const { client, calls } = bridge(
    () => requireInitializedF().sessions[0].token,
  )
  assert.equal(existsSync(grantFile(owner)), false)
  const inspected = await client.inspect(begun.ticket)
  assert.equal(inspected.clientId, clientId)
  assert.deepEqual(inspected.scopes, scopes)
  assert.deepEqual(calls, ["/oauth/inspect"])
  assert.equal(existsSync(grantFile(owner)), false)
  const callback = new URL(await client.approve(begun.ticket, inspected))
  assert.equal(callback.origin + callback.pathname, redirectUri)
  assert.equal(callback.searchParams.get("state"), begun.state)
  assert.equal(callback.searchParams.get("iss"), `${origin}/oauth`)
  const code = callback.searchParams.get("code")
  assert.ok(code)
  assert.deepEqual(calls, ["/oauth/inspect", "/oauth/approve"])
  assert.equal(existsSync(grantFile(owner)), true)
  const response = await requireInitializedIssuer().fetch(
    new Request(`${origin}/oauth/token`, {
      method: "POST",
      headers: {
        host: new URL(origin).host,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: begun.verifier,
        redirect_uri: redirectUri,
        resource,
      }),
    }),
  )
  assert.equal(response.status, 200)
  const tokens = requireObservedRecord(await response.json())
  const principal = await requireInitializedIssuer().verifyAccessToken(
    requireObservedString(tokens.access_token),
  )
  assert.equal(principal.accountId, owner)
  assert.deepEqual(principal.scopes, scopes)
  assert.deepEqual(readFileSync(sentinel), priorBytes)
  await assert.rejects(client.approve(begun.ticket, inspected), /expired/)
  assert.equal(calls.length, 2)
})

test("real native inspect response is discarded when the browser's native session changes in flight", async () => {
  const begun = await begin()
  let [{ token }] = requireInitializedF().sessions
  let release: (response: Response) => void = () => {
    throw new Error(
      "Promise resolver release was used before executor initialization",
    )
  }

  let received: () => void = () => {
    throw new Error(
      "Promise resolver received was used before executor initialization",
    )
  }

  const ready = new Promise<void>((resolve) => {
    received = resolve
  })
  const delayed = new Promise<Response>((resolve) => {
    release = resolve
  })
  let inspectedResponse: Response | undefined = undefined

  function requireInspectedResponse(): Response {
    if (inspectedResponse === undefined) {
      throw new Error(
        "Local state inspectedResponse was read before initialization",
      )
    }

    return inspectedResponse
  }

  const { client, calls } = bridge(
    () => token,
    async (response) => {
      inspectedResponse = response
      received()

      return delayed
    },
  )
  const pending = client.inspect(begun.ticket)
  await ready
  assert.equal(requireInspectedResponse().status, 200)
  ;({ token } = requireInitializedF().sessions[1])

  release(requireInspectedResponse())
  await assert.rejects(pending, /session-changed/)
  assert.deepEqual(calls, ["/oauth/inspect"])
  assert.equal(
    existsSync(grantFile(requireInitializedF().sessions[1].owner)),
    false,
  )
})

test("actual native logout between inspect and explicit approval prevents grant allocation", async () => {
  const begun = await begin()
  const [, session] = requireInitializedF().sessions
  const { client, calls } = bridge(() => session.token)
  const inspected = await client.inspect(begun.ticket)
  requireInitializedF().accounts.revokeAccountSession(session.sid)
  await assert.rejects(
    client.approve(begun.ticket, inspected),
    /request-failed/,
  )
  assert.deepEqual(calls, ["/oauth/inspect", "/oauth/approve"])
  assert.equal(existsSync(grantFile(session.owner)), false)
})
