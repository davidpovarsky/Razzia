import assert from "node:assert/strict"
import test from "node:test"
import {
  harness,
  principal,
  MemoryDrafts,
  show,
  newKey,
  data,
  code,
  requireObservedValue,
} from "./fixtures.ts"
import { MemoryDeliveries } from "./delivery-fixture.ts"
import { synchronousPromise } from "../../../core/synchronous-promise.ts"

for (const tool of ["save_game", "export_game"] as const) {
  test(`${
    tool
  } replays authorized success after edit/deletion; new stale mutation and bad replays denied`, async () => {
    const drafts = new MemoryDrafts()
    const delivery = new MemoryDeliveries(drafts)
    const p = principal()
    let revoked = false
    const adapters = { drafts, storage: delivery, exports: delivery }
    const h = await harness(
      {
        ...adapters,
        authorize: () =>
          synchronousPromise(() => (revoked ? { ...p, active: false } : p)),
      },
      p,
    )
    const foreign = await harness(adapters)

    try {
      const created = data(
        await h.call("create_game_draft", {
          authoredShowJson: JSON.stringify(show()),
          idempotencyKey: newKey(),
        }),
      )
      const args = {
        draftId: created.draftId,
        expectedRevision: 1,
        idempotencyKey: newKey(),
        ...(tool === "save_game"
          ? { intent: "createNew" }
          : { format: "tada-json" }),
      }
      const first = data(await h.call(tool, args))
      const edited = show()
      requireObservedValue(edited.cards.at(2)).question = "Q3 changed"
      assert.equal(
        data(
          await h.call("update_game_draft", {
            draftId: created.draftId,
            expectedRevision: 1,
            authoredShowJson: JSON.stringify(edited),
            idempotencyKey: newKey(),
          }),
        ).revision,
        2,
      )
      assert.deepEqual(data(await h.call(tool, args)), first)
      assert.equal(
        code(await h.call(tool, { ...args, expectedRevision: 2 })),
        "REQUEST_KEY_REUSED",
      )
      assert.equal(
        code(await h.call(tool, { ...args, idempotencyKey: newKey() })),
        "REVISION_CONFLICT",
      )
      assert.equal(code(await foreign.call(tool, args)), "NOT_FOUND")
      const grant = p.grantId
      p.grantId = newKey()
      assert.equal(code(await h.call(tool, args)), "REVISION_CONFLICT")
      p.grantId = grant
      revoked = true
      assert.equal(code(await h.call(tool, args)), "SCOPE_REQUIRED")
      revoked = false
      drafts.records.clear()
      assert.deepEqual(data(await h.call(tool, args)), first)
      assert.equal(delivery.saves + delivery.exports, 1)
    } finally {
      await Promise.all([h.close(), foreign.close()])
    }
  })
}

test("new save still requires exact-revision consent; ordinary export does not", async () => {
  const drafts = new MemoryDrafts()
  const delivery = new MemoryDeliveries(drafts)
  delivery.consent = false
  const h = await harness({ drafts, storage: delivery, exports: delivery })

  try {
    const created = data(
      await h.call("create_game_draft", {
        authoredShowJson: JSON.stringify(show()),
        idempotencyKey: newKey(),
      }),
    )
    const selection = {
      draftId: created.draftId,
      expectedRevision: 1,
      idempotencyKey: newKey(),
    }
    assert.equal(
      code(await h.call("save_game", { ...selection, intent: "createNew" })),
      "CONSENT_REQUIRED",
    )
    assert.equal(delivery.saves, 0)
    assert.equal(
      data(await h.call("export_game", { ...selection, format: "tada-json" }))
        .format,
      "tada-json",
    )
  } finally {
    await h.close()
  }
})
