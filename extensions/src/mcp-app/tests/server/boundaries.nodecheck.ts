import assert from "node:assert/strict"
import test from "node:test"
import { harness, show, newKey, data } from "./fixtures.ts"

test("invalid authored/schema/settings/media rejected without mutation", async () => {
  const h = await harness()

  try {
    for (const raw of [
      "{}",
      '{"format":"tada-show","version":1}',
      JSON.stringify({
        ...show(),
        settings: [{ scope: "show", property: "x", valueJson: {} }],
      }),
      JSON.stringify({
        ...show(),
        cards: [{ ...show().cards[0], answers: [{ text: "A" }] }],
      }),
      JSON.stringify({
        ...show(),
        defaults: { showTheme: { id: "foreign", version: "1.0.0" } },
      }),
      JSON.stringify({
        ...show(),
        cards: [
          {
            ...show().cards[0],
            media: {
              type: "image",
              url: "https://private.example.invalid/a.png",
            },
          },
        ],
      }),
      " ".repeat(32769),
    ]) {
      const result = await h.call("create_game_draft", {
        authoredShowJson: raw,
        idempotencyKey: newKey(),
      })
      assert.equal(result.isError, true)
    }
    assert.equal(h.store.records.size, 0)
  } finally {
    await h.close()
  }
})

test("scoped ordinary export delegates without adding a new consent stage", async () => {
  let exports = 0
  const h = await harness({
    exports: {
      async createAuthorizedDownload(_p, selection, format) {
        exports += 1

        return {
          exportId: newKey(),
          draftId: selection.draftId,
          revision: selection.expectedRevision,
          format,
          downloadUrl: `https://studio.example.invalid/download/${newKey()}`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          sha256: "a".repeat(64),
          bytes: 10,
        }
      },
    },
  })

  try {
    const draft = data(
      await h.call("create_game_draft", {
        authoredShowJson: JSON.stringify(show()),
        idempotencyKey: newKey(),
      }),
    )
    const result = await h.call("export_game", {
      draftId: draft.draftId,
      expectedRevision: 1,
      idempotencyKey: newKey(),
      format: "tada-json",
    })
    assert.notEqual(result.isError, true)
    assert.equal(data(result).format, "tada-json")
    assert.equal(exports, 1)
  } finally {
    await h.close()
  }
})
