import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { Hono } from "hono"
import { readdirSync } from "node:fs"
import type { ApiEnv } from "@razzia/socket/api/factory"
import type { FirstPartySessionPrincipal } from "../../first-party/bindings.ts"
import { loadFirstPartyBindings } from "../../first-party/bindings.ts"
import { FirstPartyDraftStore } from "../../first-party/store.ts"
import { fixture, createInput, key, snapshot } from "./fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
before(async () => {
  f = await fixture()
})
after(() => f?.close())
test("caller-built identity and missing actual ALS owner cannot access the store", async () => {
  const session = f.sessions[0]
  const forged: FirstPartySessionPrincipal = {
    kind: "first-party-session",
    accountId: session.owner,
    subject: session.owner,
    sid: session.sid,
    expiresAt: Date.now() + 60_000,
  }
  const before = snapshot(f.root)
  assert.throws(
    () =>
      new FirstPartyDraftStore(
        { ...f.auth, assertActive() {} },
        { allowedPublicAssetUrls: new Set() },
      ),
    /ACCOUNT_UNAVAILABLE/,
  )
  assert.throws(() => f.store().get(forged, key()), /SCOPE_REQUIRED/)
  await assert.rejects(
    f.scope.withAccount(session.owner, () =>
      f.store().create(forged, createInput()),
    ),
    /SCOPE_REQUIRED/,
  )
  const issued = await f.as(session, (p) => p)
  assert.throws(() => f.store().get(issued, key()), /SCOPE_REQUIRED/)
  await assert.rejects(
    f.scope.withAccount(f.sessions[1].owner, () =>
      f.store().get(issued, key()),
    ),
    /SCOPE_REQUIRED/,
  )
  assert.deepEqual(snapshot(f.root), before)
})
test("accounts-off and persistent key/root drift deny before private store I/O", async () => {
  const before = snapshot(f.root)
  const originalRoot = process.env.CONFIG_PATH
  process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
  await assert.rejects(loadFirstPartyBindings(f.root), /ACCOUNT_UNAVAILABLE/)
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  const secret = process.env.JWT_SECRET
  delete process.env.JWT_SECRET
  await assert.rejects(loadFirstPartyBindings(f.root), /ACCOUNT_UNAVAILABLE/)
  process.env.JWT_SECRET =
    "different-synthetic-persistent-secret-never-a-provider-key"
  await assert.rejects(loadFirstPartyBindings(f.root), /ACCOUNT_UNAVAILABLE/)
  process.env.JWT_SECRET = secret
  process.env.CONFIG_PATH = f.root + "-different"
  await assert.rejects(loadFirstPartyBindings(f.root), /ACCOUNT_UNAVAILABLE/)
  process.env.CONFIG_PATH = originalRoot
  assert.deepEqual(snapshot(f.root), before)
})
test("Context claims cannot substitute for the actual cryptographic verifier", async () => {
  const app = new Hono<ApiEnv>()
  app.get("/", async (c) => {
    c.set("claims", {
      sub: f.sessions[0].owner,
      role: "manager",
      sid: f.sessions[0].sid,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 100,
    })
    await f.scope.withAccount(f.sessions[0].owner, async () => {
      await assert.rejects(f.auth.principal(c), /SCOPE_REQUIRED/)
    })
    return c.body(null, 204)
  })
  assert.equal(
    (await app.request("https://fixture.example.invalid/")).status,
    204,
  )
})
test("actual player, malformed JWT, expired JWT and invalid sid are rejected", async () => {
  const before = snapshot(f.root)
  const player = await f.tokens.mintToken(f.sessions[0].owner, "player")
  for (const token of ["bad.jwt.token", player.token]) {
    const response = await f.request(
      { ...f.sessions[0], token },
      "/drafts/" + key(),
    )
    assert.equal(response.status, 401)
  }
  const { sign } = await import("hono/jwt")
  for (const claims of [
    {
      sub: f.sessions[0].owner,
      role: "manager",
      sid: f.sessions[0].sid,
      exp: Math.floor(Date.now() / 1000) - 1,
    },
    {
      sub: f.sessions[0].owner,
      role: "manager",
      sid: f.sessions[1].sid,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
  ]) {
    const token = await sign(
      { iat: Math.floor(Date.now() / 1000) - 10, ...claims },
      f.syntheticSecret,
      "HS256",
    )
    assert.equal(
      (await f.request({ ...f.sessions[0], token }, "/drafts/" + key())).status,
      401,
    )
  }
  assert.deepEqual(snapshot(f.root), before)
})
test("real session revoke and account disable/unverify deny previously issued capabilities", async () => {
  const session = f.sessions[0]
  const before = snapshot(f.root)
  await f.as(session, (p) => {
    for (const column of ["disabled", "verified_at"] as const) {
      f.db
        .prepare(`UPDATE accounts SET ${column}=? WHERE id=?`)
        .run(column === "disabled" ? 1 : null, session.owner)
      assert.throws(() => f.store().get(p, key()), /SCOPE_REQUIRED/)
      f.db
        .prepare(`UPDATE accounts SET ${column}=? WHERE id=?`)
        .run(column === "disabled" ? 0 : Date.now(), session.owner)
    }
    f.accounts.revokeAccountSession(session.sid)
    assert.throws(() => f.store().create(p, createInput()), /SCOPE_REQUIRED/)
  })
  assert.deepEqual(snapshot(f.root), before)
})
test("closed startup account handle fails GET without reinitializing account sidecars", async () => {
  const database = await import("@razzia/socket/services/account-db")
  database.closeAccountDb()
  const before = readdirSync(f.root).sort()
  const owned = snapshot(f.root)
  assert.equal((await f.request(f.sessions[1], "/drafts/" + key())).status, 503)
  assert.deepEqual(readdirSync(f.root).sort(), before)
  assert.deepEqual(snapshot(f.root), owned)
})
