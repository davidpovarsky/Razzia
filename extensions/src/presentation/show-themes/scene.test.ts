import { describe, expect, it } from "vitest"
import { createDefaultShowTheme } from "../../core/show-themes/selection"
import { resolveShowTheme } from "../../core/show-themes/resolve"
import { themeSlotForScene, themeSlotForSceneKind } from "./scene"

describe("authored scene theme overrides", () => {
  const theme = resolveShowTheme({
    role: "manager",
    selection: {
      ...createDefaultShowTheme(),
      overrides: {
        slots: {
          opening: { mediaUrl: "/media/opening.png" },
          closing: { mediaUrl: "/media/closing.png" },
          leaderboard: { mediaUrl: "/media/leaderboard.png" },
          resultsReveal: { mediaUrl: "/media/results.png" },
          interlude: { mediaUrl: "/media/interlude.png" },
        },
      },
    },
  })

  it.each([
    ["opening", "opening", undefined],
    ["closing", "closing", undefined],
    ["leaderboard", "leaderboard", undefined],
    ["interimResults", "resultsReveal", "/media/results.png"],
    ["answerRecap", "resultsReveal", "/media/results.png"],
    ["transition", "interlude", "/media/interlude.png"],
    ["animation", "interlude", "/media/interlude.png"],
    ["media", "interlude", "/media/interlude.png"],
    ["countdown", "interlude", "/media/interlude.png"],
  ])(
    "uses the configured %s variant and admitted media during an authored scene",
    (kind, expectedSlot, mediaUrl) => {
      const slot = themeSlotForScene({
        kind: "scene",
        key: "authored-card",
        scene: { kind },
      })

      expect(theme.slots[slot].id).toBe(
        `tadazz-classic.${expectedSlot}.default`,
      )
      expect(theme.slots[slot].mediaUrl).toBe(mediaUrl)
      expect(themeSlotForSceneKind(kind)).toBe(slot)
    },
  )

  it("keeps unknown legacy scene kinds on the generic interlude slot", () => {
    expect(
      themeSlotForScene({
        kind: "scene",
        key: "legacy-card",
        scene: { kind: "saved-legacy-scene" },
      }),
    ).toBe("interlude")
  })

  it("preserves the standard startup screens", () => {
    expect(themeSlotForScene({ kind: "lobby", key: "lobby" })).toBe("lobby")
    expect(themeSlotForScene({ kind: "connecting", key: "loading" })).toBe(
      "firstPaint",
    )
  })
})
