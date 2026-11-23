import assert from "node:assert/strict"
import test from "node:test"
import {
  harness,
  show,
  newKey,
  data,
  code,
  principal,
  MemoryDrafts,
} from "./fixtures.ts"
import { synchronousPromise } from "../../../core/synchronous-promise.ts"

test("two real SDK sessions retain account isolation and revoked replay is denied", async () => {
  const shared = new MemoryDrafts()
  const a = await harness({ drafts: shared })
  const b = await harness({ drafts: shared })

  try {
    const key = newKey()
    const created = data(
      await a.call("create_game_draft", {
        authoredShowJson: JSON.stringify(show()),
        idempotencyKey: key,
      }),
    )
    assert.equal(
      code(await b.call("get_game_draft", { draftId: created.draftId })),
      "NOT_FOUND",
    )
    a.account.expiresAt = 0
    assert.equal(
      code(
        await a.call("create_game_draft", {
          authoredShowJson: JSON.stringify(show()),
          idempotencyKey: key,
        }),
      ),
      "SCOPE_REQUIRED",
    )
    assert.equal(shared.records.size, 1)
  } finally {
    await Promise.all([a.close(), b.close()])
  }
})

for (const invalid of [
  { issuer: "https://attacker.example.invalid" },
  { audience: "https://other.example.invalid" },
  { accountId: "" },
  { active: false },
  { accountsEnabled: false },
  { expiresAt: 0 },
  { scopes: [] },
]) {
  test(`invalid principal fails before account store: ${Object.keys(invalid).join()}`, async () => {
    const h = await harness({
      authorize: () =>
        synchronousPromise(() => ({ ...principal(), ...invalid })),
    })

    try {
      assert.equal(
        code(
          await h.call("create_game_draft", {
            authoredShowJson: JSON.stringify(show()),
            idempotencyKey: newKey(),
          }),
        ),
        "SCOPE_REQUIRED",
      )
      assert.equal(h.store.records.size, 0)
    } finally {
      await h.close()
    }
  })
}

test("missing real authorizer/rate limiter/repository and preview/save/download fail closed", async () => {
  const h = await harness()
  const unauthed = await harness({ authorize: undefined })
  const noRate = await harness({ rateLimit: undefined })
  const noStore = await harness({ drafts: undefined })

  try {
    assert.equal(
      code(await unauthed.call("get_game_draft", { draftId: newKey() })),
      "ACCOUNT_UNAVAILABLE",
    )
    assert.equal(
      code(await noRate.call("get_game_draft", { draftId: newKey() })),
      "DEPENDENCY_UNAVAILABLE",
    )
    assert.equal(
      code(await noStore.call("get_game_draft", { draftId: newKey() })),
      "DEPENDENCY_UNAVAILABLE",
    )
    const draft = data(
      await h.call("create_game_draft", {
        authoredShowJson: JSON.stringify(show()),
        idempotencyKey: newKey(),
      }),
    )
    const args = {
      draftId: draft.draftId,
      expectedRevision: 1,
      idempotencyKey: newKey(),
    }
    assert.equal(
      code(
        await h.call("preview_game", {
          draftId: draft.draftId,
          expectedRevision: 1,
        }),
      ),
      "PREVIEW_UNAVAILABLE",
    )
    assert.equal(
      code(await h.call("save_game", { ...args, intent: "createNew" })),
      "DEPENDENCY_UNAVAILABLE",
    )
    assert.equal(
      code(await h.call("export_game", { ...args, format: "tada-json" })),
      "EXPORT_UNAVAILABLE",
    )
    assert.equal(h.store.records.size, 1)
  } finally {
    await Promise.all([
      h.close(),
      unauthed.close(),
      noRate.close(),
      noStore.close(),
    ])
  }
})

test("rate denials and unexpected dependency failures expose no raw secret or mutation", async () => {
  const denied = await harness({ rateLimit: () => Promise.resolve(false) })
  const secret = "synthetic-secret-never-echo"
  const broken = await harness({
    catalog: {
      listTemplates() {
        return Promise.reject(new Error(secret))
      },
      listThemes() {
        return Promise.resolve({ items: [] })
      },
    },
  })

  try {
    assert.equal(
      code(
        await denied.call("create_game_draft", {
          authoredShowJson: JSON.stringify(show()),
          idempotencyKey: newKey(),
        }),
      ),
      "RATE_LIMITED",
    )
    assert.equal(denied.store.records.size, 0)
    const result = await broken.call("list_game_templates", {})
    assert.equal(code(result), "INTERNAL")
    assert.equal(JSON.stringify(result).includes(secret), false)
    assert.equal(
      JSON.stringify(result).includes(broken.account.accountId),
      false,
    )
    const forged = await broken.call("get_game_draft", {
      draftId: newKey(),
      tenantId: broken.account.accountId,
    })
    assert.equal(forged.isError, true)
  } finally {
    await Promise.all([denied.close(), broken.close()])
  }
})
