import { describe, expect, it } from "vitest"
import { compileFullShowPreviewTimeline } from "./full-show-preview-timeline"
import { authoredFixture } from "./preview-fixtures"

describe("authored full-show preview inventory", () => {
  it("keeps mixed order and stable chapter identities across reorder", () => {
    const show = authoredFixture(2, 2)
    const transition = {
      key: "between",
      kind: "transition",
      title: "Break",
      durationMs: 1200,
      advance: "manual",
    }
    const mixed = { ...show, cards: [show.cards[0], transition, show.cards[1]] }
    const chapters = compileFullShowPreviewTimeline(mixed)
    expect(chapters.map((c) => c.phase)).toEqual([
      "question",
      "answerCards",
      "voting",
      "voteLocked",
      "results",
      "transition",
      "question",
      "answerCards",
      "voting",
      "voteLocked",
      "results",
    ])
    expect(chapters[5].duration).toEqual({ kind: "manual" })
    expect(chapters[0].duration).toEqual({ kind: "known", milliseconds: 2000 })
    const reordered = compileFullShowPreviewTimeline({
      ...mixed,
      cards: [...mixed.cards].reverse(),
    })
    expect(reordered.map((c) => c.id).sort()).toEqual(
      chapters.map((c) => c.id).sort(),
    )
    expect(Object.isFrozen(chapters)).toBe(true)
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- Deliberate runtime assertion of the serialized contract.
    expect(chapters.every((c) => c.seek === "unavailable")).toBe(true)
  })

  it.each([2, 3, 5, 15])(
    "uses the fixed system interval while retaining stored cooldown%s",
    (cooldownSeconds) => {
      const show = authoredFixture(2, 2)
      const legacy = { ...show, cards: [{ ...show.cards[0], cooldownSeconds }] }
      const chapters = compileFullShowPreviewTimeline(legacy)
      expect(chapters[0].duration).toEqual({
        kind: "known",
        milliseconds: 2000,
      })
      expect(legacy.cards[0]).toMatchObject({ cooldownSeconds })
      expect(chapters[1].phase).toBe("answerCards")
      expect(chapters[2].phase).toBe("voting")
    },
  )
  it("never invents media duration or finite voting time", () => {
    const show = authoredFixture(2, 2)
    const chapters = compileFullShowPreviewTimeline({
      ...show,
      cards: [
        { ...show.cards[0], timeSeconds: -1 },
        {
          key: "clip",
          kind: "media",
          mediaType: "video",
          mediaUrl: "/media/clip.mp4",
          advance: "onMediaEnd",
        },
      ],
    })
    expect(chapters[2].duration).toEqual({ kind: "infinite" })
    expect(chapters.at(-1)?.duration).toEqual({ kind: "unknown" })
  })
  it("rejects duplicate identities rather than silently merging chapters", () => {
    const show = authoredFixture(2, 2)
    expect(() =>
      compileFullShowPreviewTimeline({
        ...show,
        cards: [show.cards[0], show.cards[0]],
      }),
    ).toThrow()
  })
})
