import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { Hono } from "hono"
import { readdirSync } from "node:fs"
import type { ApiEnv } from "@razzia/socket/api/factory"
import {
  type FirstPartySessionPrincipal,
  loadFirstPartyBindings,
} from "../../first-party/bindings.ts"
import { FirstPartyDraftStore } from "../../first-party/store.ts"
import { fixture, createInput, key, snapshot } from "./fixtures.ts"

type InitializedFValue = Awaited<ReturnType<typeof fixture>>
let f: InitializedFValue | undefined = undefined
function requireInitializedF(): InitializedFValue {
  if (f === undefined) {
    throw new Error("Fixture state f was read before initialization")
  }

  return f
}
before(async () => {
  f = await fixture()
})
after(() => f?.close())
test("caller-built identity and missing actual ALS owner cannot access the store", async () => {
  const [session] = requireInitializedF().sessions
  const forged: FirstPartySessionPrincipal = {
    kind: "first-party-session",
    accountId: session.owner,
    subject: session.owner,
    sid: session.sid,
    expiresAt: Date.now() + 60_000,
  }
  const priorSnapshot = snapshot(requireInitializedF().root)
  assert.throws(
    () =>
      new FirstPartyDraftStore(
        {
          ...requireInitializedF().auth,
          assertActive() {
            /* The forged fixture intentionally omits active-account enforcement to test rejection. */
          },
        },
        { allowedPublicAssetUrls: new Set() },
      ),
    /ACCOUNT_UNAVAILABLE/,
  )
  assert.throws(
    () => requireInitializedF().store().get(forged, key()),
    /SCOPE_REQUIRED/,
  )
  await assert.rejects(
    requireInitializedF().scope.withAccount(session.owner, () =>
      requireInitializedF().store().create(forged, createInput()),
    ),
    /SCOPE_REQUIRED/,
  )
  const issued = await requireInitializedF().as(session, (p) => p)
  assert.throws(
    () => requireInitializedF().store().get(issued, key()),
    /SCOPE_REQUIRED/,
  )
  await assert.rejects(
    requireInitializedF().scope.withAccount(
      requireInitializedF().sessions[1].owner,
      () => requireInitializedF().store().get(issued, key()),
    ),
    /SCOPE_REQUIRED/,
  )
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot)
})
test("accounts-off and persistent key/root drift deny before private store I/O", async () => {
  const priorSnapshot2 = snapshot(requireInitializedF().root)
  const originalRoot = process.env.CONFIG_PATH
  process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
  await assert.rejects(
    loadFirstPartyBindings(requireInitializedF().root),
    /ACCOUNT_UNAVAILABLE/,
  )
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  const secret = process.env.JWT_SECRET
  delete process.env.JWT_SECRET
  await assert.rejects(
    loadFirstPartyBindings(requireInitializedF().root),
    /ACCOUNT_UNAVAILABLE/,
  )
  process.env.JWT_SECRET =
    "different-synthetic-persistent-secret-never-a-provider-key"
  await assert.rejects(
    loadFirstPartyBindings(requireInitializedF().root),
    /ACCOUNT_UNAVAILABLE/,
  )
  process.env.JWT_SECRET = secret
  process.env.CONFIG_PATH = `${requireInitializedF().root}-different`
  await assert.rejects(
    loadFirstPartyBindings(requireInitializedF().root),
    /ACCOUNT_UNAVAILABLE/,
  )
  process.env.CONFIG_PATH = originalRoot
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot2)
})
test("Context claims cannot substitute for the actual cryptographic verifier", async () => {
  const app = new Hono<ApiEnv>()
  app.get("/", async (c) => {
    c.set("claims", {
      sub: requireInitializedF().sessions[0].owner,
      role: "manager",
      sid: requireInitializedF().sessions[0].sid,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 100,
    })
    await requireInitializedF().scope.withAccount(
      requireInitializedF().sessions[0].owner,
      async () => {
        await assert.rejects(
          requireInitializedF().auth.principal(c),
          /SCOPE_REQUIRED/,
        )
      },
    )

    return c.body(null, 204)
  })
  assert.equal(
    (await app.request("https://fixture.example.invalid/")).status,
    204,
  )
})
test("actual player, malformed JWT, expired JWT and invalid sid are rejected", async () => {
  const priorSnapshot3 = snapshot(requireInitializedF().root)
  const player = await requireInitializedF().tokens.mintToken(
    requireInitializedF().sessions[0].owner,
    "player",
  )
  for (const token of ["bad.jwt.token", player.token]) {
    const response = await requireInitializedF().request({
      session: { ...requireInitializedF().sessions[0], token },
      path: `/drafts/${key()}`,
    })
    assert.equal(response.status, 401)
  }
  const { sign } = await import("hono/jwt")
  for (const claims of [
    {
      sub: requireInitializedF().sessions[0].owner,
      role: "manager",
      sid: requireInitializedF().sessions[0].sid,
      exp: Math.floor(Date.now() / 1000) - 1,
    },
    {
      sub: requireInitializedF().sessions[0].owner,
      role: "manager",
      sid: requireInitializedF().sessions[1].sid,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
  ]) {
    const token = await sign(
      { iat: Math.floor(Date.now() / 1000) - 10, ...claims },
      requireInitializedF().syntheticSecret,
      "HS256",
    )
    assert.equal(
      (
        await requireInitializedF().request({
          session: { ...requireInitializedF().sessions[0], token },
          path: `/drafts/${key()}`,
        })
      ).status,
      401,
    )
  }
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot3)
})
test("real session revoke and account disable/unverify deny previously issued capabilities", async () => {
  const [session] = requireInitializedF().sessions
  const priorSnapshot4 = snapshot(requireInitializedF().root)
  await requireInitializedF().as(session, (p) => {
    for (const column of ["disabled", "verified_at"] as const) {
      requireInitializedF()
        .db.prepare(`UPDATE accounts SET ${column}=? WHERE id=?`)
        .run(column === "disabled" ? 1 : null, session.owner)
      assert.throws(
        () => requireInitializedF().store().get(p, key()),
        /SCOPE_REQUIRED/,
      )
      requireInitializedF()
        .db.prepare(`UPDATE accounts SET ${column}=? WHERE id=?`)
        .run(column === "disabled" ? 0 : Date.now(), session.owner)
    }
    requireInitializedF().accounts.revokeAccountSession(session.sid)
    assert.throws(
      () => requireInitializedF().store().create(p, createInput()),
      /SCOPE_REQUIRED/,
    )
  })
  assert.deepEqual(snapshot(requireInitializedF().root), priorSnapshot4)
})
test("closed startup account handle fails GET without reinitializing account sidecars", async () => {
  const database = await import("@razzia/socket/services/account-db")
  database.closeAccountDb()
  const priorEntries = readdirSync(requireInitializedF().root).sort()
  const owned = snapshot(requireInitializedF().root)
  assert.equal(
    (
      await requireInitializedF().request({
        session: requireInitializedF().sessions[1],
        path: `/drafts/${key()}`,
      })
    ).status,
    503,
  )
  assert.deepEqual(readdirSync(requireInitializedF().root).sort(), priorEntries)
  assert.deepEqual(snapshot(requireInitializedF().root), owned)
})
