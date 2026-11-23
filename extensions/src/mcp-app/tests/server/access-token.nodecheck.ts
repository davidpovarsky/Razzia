import { promiseFrom } from "../../shared/promise-operation.ts"
import assert from "node:assert/strict"
import { test } from "node:test"
import { generateKeyPairSync, randomUUID, sign } from "node:crypto"
import {
  createAccessTokenVerifier,
  type ActiveOAuthGrant,
} from "../../server/access-token.ts"
import { config } from "./fixtures.ts"

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const now = Math.floor(Date.now() / 1000)
  const grant: ActiveOAuthGrant = {
    grantId: randomUUID(),
    subject: randomUUID(),
    clientId: "private-synthetic-client",
    accountId: randomUUID(),
    scopes: ["tadazz.drafts.read"],
    expiresAt: Date.now() + 600_000,
    active: true,
  }
  let active: ActiveOAuthGrant | undefined = grant
  let accountEnabled = true
  let grantFailure = false
  let revokeDuringAccountCheck = false
  let grantReads = 0
  let accountReads = 0
  const verify = createAccessTokenVerifier({
    config,
    keys: [
      {
        kid: "synthetic-test-key",
        algorithm: "EdDSA",
        pem: publicKey.export({ type: "spki", format: "pem" }),
      },
    ],
    activeGrant: (id) =>
      promiseFrom(() => {
        grantReads += 1

        if (grantFailure) {
          throw new Error("private-sql-path-secret")
        }

        return id === grant.grantId ? active : undefined
      }),
    activeAccount: (id) =>
      promiseFrom(() => {
        accountReads += 1

        if (revokeDuringAccountCheck) {
          active = undefined
        }

        return id === grant.accountId && accountEnabled
      }),
  })
  const claims = {
    iss: config.issuer,
    aud: config.resource,
    sub: grant.subject,
    client_id: grant.clientId,
    grant_id: grant.grantId,
    account_id: grant.accountId,
    scope: "tadazz.drafts.read",
    iat: now,
    exp: now + 300,
    jti: randomUUID(),
  }
  const token = (
    changed: Record<string, unknown> = {},
    header: Record<string, unknown> = {},
  ) => {
    const encoded = [
      { alg: "EdDSA", kid: "synthetic-test-key", typ: "at+jwt", ...header },
      { ...claims, ...changed },
    ]
      .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
      .join(".")

    return `${encoded}.${sign(null, Buffer.from(encoded), privateKey).toString("base64url")}`
  }

  return {
    grant,
    verify,
    token,
    claims,
    revoke: () => {
      active = undefined
    },
    disable: () => {
      accountEnabled = false
    },
    replaceGrant: (value: ActiveOAuthGrant) => {
      active = value
    },
    failGrant: () => {
      grantFailure = true
    },
    revokeAcrossAccountAwait: () => {
      revokeDuringAccountCheck = true
    },
    counts: () => ({ grantReads, accountReads }),
  }
}
test("real signature and exact resource-bound grant produce an immutable principal", async () => {
  const f = fixture()
  const p = await f.verify(f.token())
  assert.equal(p.accountId, f.grant.accountId)
  assert.equal(p.audience, config.resource)
  assert.equal(Object.isFrozen(p), true)
  assert.equal(Object.isFrozen(p.scopes), true)
  assert.equal(f.counts().accountReads, 1)
})
test("signed wrong issuer/audience, expiry, lifetime, nbf and scope are rejected", async () => {
  for (const change of [
    { iss: "https://wrong.invalid" },
    { aud: config.issuer },
    { exp: Math.floor(Date.now() / 1000) - 1 },
    { iat: Math.floor(Date.now() / 1000) + 20 },
    { nbf: Math.floor(Date.now() / 1000) + 20 },
    { exp: Math.floor(Date.now() / 1000) + 3601 },
    { scope: "tadazz.library.write" },
    { scope: "tadazz.drafts.read tadazz.drafts.read" },
    { scope: "unknown.scope" },
    { aud: [config.resource] },
  ]) {
    const f = fixture()
    await assert.rejects(f.verify(f.token(change)), {
      message: "SCOPE_REQUIRED",
    })
  }
})
test("algorithm, kid, token key references and forged signature never reach grant storage", async () => {
  const f = fixture()
  for (const header of [
    { alg: "none" },
    { alg: "RS256" },
    { kid: "unknown" },
    { typ: "JWT" },
    { jku: "https://attacker.invalid/jwks" },
    { jwk: {} },
    { crit: ["unexpected"] },
  ]) {
    await assert.rejects(f.verify(f.token({}, header)))
  }
  const parts = f.token().split(".")
  parts[2] = Buffer.alloc(64).toString("base64url")
  await assert.rejects(f.verify(parts.join(".")))
  await assert.rejects(f.verify(`${f.token()}=`))
  assert.equal(f.counts().grantReads, 0)
  const g = fixture()
  g.failGrant()
  await assert.rejects(g.verify(g.token()), { message: "SCOPE_REQUIRED" })
  const h = fixture()
  h.revokeAcrossAccountAwait()
  await assert.rejects(h.verify(h.token()), { message: "SCOPE_REQUIRED" })
})
test("revocation and account disable are rechecked for every access, with no token cache", async () => {
  const f = fixture()
  const token = f.token()
  await f.verify(token)
  f.revoke()
  await assert.rejects(f.verify(token))
  const g = fixture()
  await g.verify(g.token())
  g.disable()
  await assert.rejects(g.verify(g.token()))
})
test("signed account/client/subject substitution and changed stored grant are denied", async () => {
  for (const changed of [
    { account_id: randomUUID() },
    { sub: randomUUID() },
    { client_id: "another-client" },
    { grant_id: randomUUID() },
  ]) {
    const f = fixture()
    await assert.rejects(f.verify(f.token(changed)))
  }
  const f = fixture()
  f.replaceGrant({ ...f.grant, expiresAt: Date.now() - 1 })
  await assert.rejects(f.verify(f.token()))
})
test("truthy non-boolean grant activity is rejected before account authorization", async () => {
  for (const malformed of [1, "true", {}, []]) {
    const f = fixture()
    f.replaceGrant({
      ...f.grant,
      // Deliberately inject an invalid adapter result despite the literal-true type.
      active: malformed as unknown as true,
    })
    await assert.rejects(f.verify(f.token()), { message: "SCOPE_REQUIRED" })
    assert.equal(f.counts().accountReads, 0)
  }
})

test("cancellation and private storage errors yield a fixed safe error", async () => {
  const f = fixture()
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(f.verify(f.token(), controller.signal), {
    message: "SCOPE_REQUIRED",
  })
  await assert.rejects(f.verify("private-token".repeat(1000)), {
    message: "SCOPE_REQUIRED",
  })
  assert.equal(f.counts().grantReads, 0)
})
