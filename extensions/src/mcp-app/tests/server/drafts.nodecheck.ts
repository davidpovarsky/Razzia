import assert from "node:assert/strict"
import test from "node:test"
import {
  harness,
  show,
  newKey,
  data,
  code,
  requireObservedShow,
} from "./fixtures.ts"

test("validated same-draft content edit, CAS conflict, key replay and no read writes", async () => {
  const h = await harness()

  try {
    const authored = show()
    const key = newKey()
    const created = data(
      await h.call("create_game_draft", {
        authoredShowJson: JSON.stringify(authored),
        idempotencyKey: key,
      }),
    )
    const replay = data(
      await h.call("create_game_draft", {
        authoredShowJson: JSON.stringify(authored),
        idempotencyKey: key,
      }),
    )
    assert.equal(created.draftId, replay.draftId)
    assert.equal(h.store.records.size, 1)
    authored.cards[2]!.question = "Edited Q3"
    const result = await h.call("update_game_draft", {
      draftId: created.draftId,
      expectedRevision: 1,
      idempotencyKey: newKey(),
      authoredShowJson: JSON.stringify(authored),
    })
    assert.equal(data(result).revision, 2)
    const beforeReads = structuredClone(h.store.audit)
    const read = data(
      await h.call("get_game_draft", { draftId: created.draftId }),
    )
    const normalized = requireObservedShow(
      JSON.parse(String(read.authoredShowJson)),
    )
    assert.equal(normalized.cards[2].question, "Edited Q3")
    assert.equal(normalized.cards[0].key, "q1")
    assert.equal(normalized.cards[0].question, "Question 1")
    assert.deepEqual(h.store.audit, beforeReads)
    assert.equal(
      code(
        await h.call("update_game_draft", {
          draftId: created.draftId,
          expectedRevision: 1,
          idempotencyKey: newKey(),
          authoredShowJson: JSON.stringify(authored),
        }),
      ),
      "REVISION_CONFLICT",
    )
    assert.equal(
      code(
        await h.call("create_game_draft", {
          authoredShowJson: JSON.stringify(authored),
          idempotencyKey: key,
        }),
      ),
      "REQUEST_KEY_REUSED",
    )
  } finally {
    await h.close()
  }
})

test("concurrent CAS produces one winner without silently replacing another revision", async () => {
  const h = await harness()

  try {
    const first = data(
      await h.call("create_game_draft", {
        authoredShowJson: JSON.stringify(show()),
        idempotencyKey: newKey(),
      }),
    )
    const args = {
      draftId: first.draftId,
      expectedRevision: 1,
      authoredShowJson: JSON.stringify(show()),
    }
    const results = await Promise.all([
      h.call("update_game_draft", { ...args, idempotencyKey: newKey() }),
      h.call("update_game_draft", { ...args, idempotencyKey: newKey() }),
    ])
    assert.equal(results.filter((r) => !r.isError).length, 1)
    assert.equal(code(results.find((r) => r.isError)!), "REVISION_CONFLICT")
  } finally {
    await h.close()
  }
})

test("actual authoring answer bounds are preserved without a renderer-support claim", async () => {
  const h = await harness()

  try {
    for (const count of [0, 1, 2, 5, 6, 64]) {
      const authored = show()
      authored.cards[0]!.answers = Array.from({ length: count }, (_, i) => ({
        text: `Option ${i}`,
      }))
      const result = await h.call("create_game_draft", {
        authoredShowJson: JSON.stringify(authored),
        idempotencyKey: newKey(),
      })
      assert.equal(
        result.isError === true,
        count < 2 || count > 5,

        `answer count ${count}`,
      )
    }
  } finally {
    await h.close()
  }
})
