import { describe, expect, it } from "vitest"
import { createDefaultShowTheme } from "../../core/show-themes/selection"
import { resolveShowTheme } from "../../core/show-themes/resolve"
import {
  reconcileThemeScene,
  resolveThemeAnimationPreset,
  themeSlotForScene,
  themeSlotForSceneKind,
} from "./scene"
import type { ShowScene } from "../tadazz-show/presentation-scene"

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

describe.each(["tadazz-classic", "razzia-original"])(
  "%s animation compatibility",
  (themeId) => {
    const theme = resolveShowTheme({
      role: "manager",
      selection: { ...createDefaultShowTheme(), id: themeId },
    })

    it.each(["spotlight", "saved-unknown-preset", undefined])(
      "resolves %s consistently without rewriting saved metadata",
      (preset) => {
        const scene: ShowScene = {
          kind: "scene",
          key: "legacy-animation",
          scene: Object.freeze({ kind: "animation", preset }),
        }
        const effectivePreset = resolveThemeAnimationPreset(preset, theme)
        const reconciled = reconcileThemeScene(scene, theme)

        expect(effectivePreset).toBe("interlude")
        expect(reconciled).toMatchObject({
          scene: { preset: effectivePreset },
        })
        expect(scene.scene.preset).toBe(preset)
      },
    )

    it("keeps every supported effect selected and unchanged on the stage", () => {
      for (const preset of theme.definition.capabilities.animationPresets) {
        const scene: ShowScene = {
          kind: "scene",
          key: "current-animation",
          scene: { kind: "animation", preset },
        }

        expect(resolveThemeAnimationPreset(preset, theme)).toBe(preset)
        expect(reconcileThemeScene(scene, theme)).toBe(scene)
      }
    })

    it("preserves an admitted theme-specific preset", () => {
      const customTheme = {
        ...theme,
        definition: {
          ...theme.definition,
          capabilities: {
            ...theme.definition.capabilities,
            animationPresets: ["partner-animation", "interlude"],
          },
        },
      }
      const scene: ShowScene = {
        kind: "scene",
        key: "custom-animation",
        scene: { kind: "animation", preset: "partner-animation" },
      }

      expect(
        resolveThemeAnimationPreset("partner-animation", customTheme),
      ).toBe("partner-animation")
      expect(reconcileThemeScene(scene, customTheme)).toBe(scene)
    })
  },
)
