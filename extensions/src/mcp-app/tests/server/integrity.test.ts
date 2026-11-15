import assert from "node:assert/strict"
import test from "node:test"
import { harness, MemoryDrafts, show, newKey, data, code } from "./fixtures.ts"

for (const boundary of ["read", "create", "replace"] as const) {
  test(
    "inconsistent repository summary fails closed on " + boundary,
    async () => {
      const base = new MemoryDrafts()
      const corrupt = <T extends { summary: { title: string } }>(r: T) => ({
        ...r,
        summary: { ...r.summary, title: "Untrusted corrupt summary" },
      })
      const h = await harness({
        drafts: {
          async create(...args) {
            const r = await base.create(...args)
            return boundary === "create" ? corrupt(r) : r
          },
          async get(...args) {
            const r = await base.get(...args)
            return r && boundary === "read" ? corrupt(r) : r
          },
          async replace(...args) {
            const r = await base.replace(...args)
            return boundary === "replace" ? corrupt(r) : r
          },
        },
      })
      try {
        let result = await h.call("create_game_draft", {
          authoredShowJson: JSON.stringify(show()),
          idempotencyKey: newKey(),
        })
        if (boundary !== "create") {
          const created = data(result)
          result =
            boundary === "read"
              ? await h.call("get_game_draft", { draftId: created.draftId })
              : await h.call("update_game_draft", {
                  draftId: created.draftId,
                  expectedRevision: 1,
                  authoredShowJson: JSON.stringify(show()),
                  idempotencyKey: newKey(),
                })
        }
        assert.equal(code(result), "INTERNAL")
        assert.equal(
          JSON.stringify(result).includes("Untrusted corrupt summary"),
          false,
        )
      } finally {
        await h.close()
      }
    },
  )
}
