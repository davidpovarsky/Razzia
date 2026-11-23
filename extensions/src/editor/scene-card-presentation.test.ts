import { describe, expect, it } from "vitest"
import { CREATING_WORLDS_PRESETS } from "../core/creating-worlds-show"
import { getSceneCardPresentation } from "./scene-card-presentation"

describe("semantic timeline card presentation", () => {
  it.each(CREATING_WORLDS_PRESETS)(
    "identifies the authored %s scene instead of calling it animation",
    (preset) => {
      const presentation = getSceneCardPresentation("animation", { preset })
      expect(presentation.semanticKind).toBe(preset)
      expect(presentation.labelKey).toBe(`extensions:themes.presets.${preset}`)
      expect(presentation.icon).not.toBe("animation")
      expect(presentation.descriptionKey).toBeTruthy()
    },
  )

  it("distinguishes a tied vote from its answer reveal and round recap", () => {
    expect(
      getSceneCardPresentation("animation", { preset: "tie-break" }).icon,
    ).toBe("tie")
    expect(
      getSceneCardPresentation("animation", { preset: "top-pick" }).icon,
    ).toBe("winner")
    expect(
      getSceneCardPresentation("animation", { preset: "round-recap" }).icon,
    ).toBe("recap")
  })

  it.each([
    "spotlight",
    "confetti",
    "bounce",
    "pulse",
    "custom-animation",
    "constructor",
  ])("retains the generic animation presentation for %s", (preset) => {
    expect(getSceneCardPresentation("animation", { preset })).toMatchObject({
      semanticKind: "animation",
      icon: "animation",
      labelKey: "extensions:timeline.animation",
    })
  })

  it("keeps authored names and descriptions while retaining semantic identity", () => {
    const scene = Object.freeze({
      preset: "tie-break",
      title: "  Our final tie  ",
      subtitle: "  Two answers remain  ",
      advance: "manual" as const,
    })
    expect(getSceneCardPresentation("animation", scene)).toMatchObject({
      semanticKind: "tie-break",
      authoredTitle: "Our final tie",
      authoredDescription: "Two answers remain",
      advanceLabelKey: "extensions:timeline.waitForHost",
    })
    expect(scene.title).toBe("  Our final tie  ")
  })

  it("uses the actual media type and the saved advance rule", () => {
    expect(
      getSceneCardPresentation("media", {
        mediaType: "video",
        advance: "onMediaEnd",
      }),
    ).toMatchObject({
      icon: "video",
      advanceLabelKey: "extensions:timeline.afterMedia",
    })
    expect(
      getSceneCardPresentation("countdown", { advance: "auto" })
        .advanceLabelKey,
    ).toBeUndefined()
  })
})
