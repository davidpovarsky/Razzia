import { describe, expect, it } from "vitest"
import { hasAuthoredCinematicContent, planTransition } from "./show-director"

describe("editor title controls follow the live native scene plan", () => {
  it.each(["opening", "closing"] as const)(
    "recognizes %s theme presets without authored media",
    (kind) => {
      const scene = {
        kind,
        mediaUrl: "",
        title: "Timeline card name",
        subtitle: "Unused preset subtitle",
      }
      expect(hasAuthoredCinematicContent(scene)).toBe(false)
      expect(
        planTransition(
          null,
          { kind: "scene", key: kind, scene },
          { mode: "idle", questionKey: null },
        ).map((step) => step.op),
      ).toEqual([kind === "opening" ? "showIntro" : "showFinale"])
    },
  )

  it.each([
    { mediaUrl: "/media/intro.mp4" },
    { lottieUrl: "/media/intro.json" },
    { overlayAnimations: [{ id: "logo" }] },
  ])(
    "keeps authored content on the native custom scene path: %j",
    (content) => {
      const scene = { kind: "opening", title: "Stage title", ...content }
      expect(hasAuthoredCinematicContent(scene)).toBe(true)
      expect(
        planTransition(
          null,
          { kind: "scene", key: "opening", scene },
          { mode: "idle", questionKey: null },
        ).map((step) => step.op),
      ).toEqual(["custom"])
    },
  )
})
