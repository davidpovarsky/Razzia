import assert from "node:assert/strict"
import { test } from "node:test"
import { createFirstPartyOAuth } from "../../src/mcp-app/first-party/oauth.ts"
import {
  fixture,
  origin,
  policy,
  show,
  key,
} from "../../src/mcp-app/tests/first-party/fixtures.ts"
import { normalizeDraft } from "../../src/mcp-app/server/authoring.ts"
import { hashJson } from "../../src/mcp-app/contracts/canonical.ts"
import { authorizePkceGrant } from "./oauth-flow.ts"
import { createRefreshingPkceSession } from "./oauth-refresh-session.ts"
import { buildMcpOptions, createEphemeralOAuthKeys } from "./harness.ts"

test("QA OAuth proactive refresh single-flights actual rotation and preserves grant, draft, revision and idempotent replay", async () => {
  const f = await fixture()

  try {
    const issuer = await createFirstPartyOAuth({
      ...buildMcpOptions({ origin, keys: createEphemeralOAuthKeys() }),
      nativeSave: undefined,
      configRoot: f.root,
    })
    let rotations = 0
    let authorizations = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      request.headers.set("host", new URL(origin).host)
      const url = new URL(request.url)

      if (url.pathname === "/oauth/authorize") {
        authorizations += 1
      }

      if (url.pathname === "/oauth/token") {
        const fields = new URLSearchParams(await request.clone().text())

        if (fields.get("grant_type") === "refresh_token") {
          rotations += 1
        }
      }

      return issuer.fetch(request)
    }
    const grant = await authorizePkceGrant({
      origin,
      fetchImpl,
      nativeToken: f.sessions[0].token,
      scopes: ["tadazz.drafts.read", "tadazz.drafts.write"],
      verifyConsentHead: false,
    })
    assert.equal(grant.expiresIn, 300)
    let schedulingTime: number | undefined = undefined
    const session = await createRefreshingPkceSession({
      schedulingClock: () => schedulingTime ?? Date.now(),
      origin,
      clientId: "tadazz-chatgpt-client",
      grant,
      fetchImpl,
      verifyAccessToken: issuer.verifyAccessToken,
    })
    const previous = await session.principal()
    const repository = issuer.draftRepository(policy)
    const normalized = normalizeDraft(
      JSON.stringify(show("OAuth refresh preserves this QA draft")),
      policy,
    )
    const idempotencyKey = key()
    const mutation = {
      idempotencyKey,
      correlationId: key(),
      inputDigest: hashJson({
        contractVersion: "0.1.0",
        authoredShowJson: normalized.authoredShowJson,
        idempotencyKey,
      }),
    }
    const record = await repository.create(previous, normalized, mutation)
    assert.equal(rotations, 0)
    schedulingTime = previous.expiresAt - 29_000
    const [first, second, direct, token] = await Promise.all([
      session.principal(),
      session.principal(),
      session.principal(),
      session.token(),
    ])
    schedulingTime = undefined
    assert.equal(rotations, 1)
    assert.equal(authorizations, 1)
    assert.equal(first, second)
    assert.equal(first, direct)
    assert.notEqual(first, previous)
    assert.equal(first.grantId, previous.grantId)
    assert.equal(first.accountId, previous.accountId)
    assert.deepEqual(first.scopes, previous.scopes)
    assert(token !== grant.accessToken, "Access token must rotate")
    assert.equal((await issuer.verifyAccessToken(token)).grantId, grant.grantId)
    assert.deepEqual(await repository.get(direct, record.draftId), record)
    assert.deepEqual(
      await repository.create(direct, normalized, mutation),
      record,
    )
    const proof = session.evidence()
    assert.equal(proof.refreshCount, 1)
    assert.equal(proof.scheduler, "controlled-client-scheduler")
    assert.equal(proof.refreshes[0]?.reason, "expiry-margin")
    assert.equal(proof.refreshes[0]?.remainingSeconds, 29)
    assert.equal(proof.rejected, false)
    assert.equal(proof.automaticReauthorization, false)
    assert.equal(proof.refreshes[0]?.sameAuthority, true)
    const serialized = JSON.stringify(proof)

    for (const secret of [
      grant.accessToken,
      grant.refreshToken,
      grant.ticket,
      token,
    ]) {
      assert(!serialized.includes(secret), "Evidence must not contain tokens")
    }

    // Revoking even an already-rotated refresh token revokes its original grant.
    const revoked = await fetchImpl(`${origin}/oauth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "tadazz-chatgpt-client",
        token: grant.refreshToken,
      }),
    })
    assert.equal(revoked.status, 200)
    await assert.rejects(issuer.verifyAccessToken(token), /SCOPE_REQUIRED/u)
    await assert.rejects(session.refresh(), /QA_OAUTH_REFRESH_REJECTED/u)
    assert.equal(rotations, 2)
    await assert.rejects(session.token(), /QA_OAUTH_REFRESH_REJECTED/u)
    await assert.rejects(session.principal(), /QA_OAUTH_REFRESH_REJECTED/u)
    await assert.rejects(session.refresh(), /QA_OAUTH_REFRESH_REJECTED/u)
    assert.equal(rotations, 2)
    assert.equal(authorizations, 1)
    assert.equal(session.evidence().rejected, true)
  } finally {
    f.close()
  }
})
