import { describe, expect, it } from "vitest"
import { resolveCardStageAnimations } from "../card-appearance"
import {
  getNativeMotionLibrary,
  parseNativeMotionSetting,
} from "./native-motion-library"

describe("native motion configuration with unchanged runtime ownership", () => {
  it("retains12stage presets/4slots and6decorations with native defaults", () => {
    const library = getNativeMotionLibrary()
    expect(library.stageEntrances).toHaveLength(12)
    expect(library.questionDecorations).toHaveLength(6)
    for (const entry of library.stageEntrances) {
      expect(entry.defaults).toEqual({
        preset: entry.preset,
        durationMs: 800,
        timing: "simultaneous",
        staggerMs: 90,
      })
      expect(entry.configurationSlots).toEqual([
        "questionEntrance",
        "answerEntrance",
        "answerBadgeEntrance",
        "resultsRevealEntrance",
      ])
    }
    expect(library.seek).toBe("unavailable")
    expect(library.lifecycleAcceptance).toBe("not-evaluated")
    expect(Object.isFrozen(library.nativeChoreography[0].presets)).toBe(true)
  })
  it("validates actual250..2500 duration/0..300stagger and rejects arbitrary code/style", () => {
    for (const durationMs of [250, 2500])
      for (const staggerMs of [0, 300])
        expect(
          parseNativeMotionSetting({
            schemaVersion: 1,
            kind: "stage-entrance",
            settings: {
              preset: "cascade",
              durationMs,
              staggerMs,
              timing: "sequential",
            },
          }).settings,
        ).toMatchObject({ durationMs, staggerMs })
    for (const settings of [
      { durationMs: 249 },
      { durationMs: 2501 },
      { staggerMs: 301 },
      { preset: "customer-js" },
      { style: "position:fixed" },
      { source: "alert(1)" },
    ])
      expect(() =>
        parseNativeMotionSetting({
          schemaVersion: 1,
          kind: "stage-entrance",
          settings,
        }),
      ).toThrow()
  })
  it("preserves explicit none override instead of reviving global entrance", () => {
    const parsed = parseNativeMotionSetting({
      schemaVersion: 1,
      kind: "stage-entrance",
      settings: { preset: "none" },
    })
    if (parsed.kind !== "stage-entrance") throw new Error("fixture")
    const global = {
      preset: "cascade" as const,
      durationMs: 900,
      timing: "sequential" as const,
      staggerMs: 100,
    }
    expect(
      resolveCardStageAnimations({
        stageAnimations: { questionEntrance: parsed.settings },
        globalStageAnimations: { questionEntrance: global },
      }).questionEntrance.preset,
    ).toBe("none")
    expect(
      resolveCardStageAnimations({
        globalStageAnimations: { questionEntrance: global },
      }).questionEntrance.preset,
    ).toBe("cascade")
  })
  it("validates decoration and existing cinematic timing/fade rules without authorizing media", () => {
    expect(
      parseNativeMotionSetting({
        schemaVersion: 1,
        kind: "question-decoration",
        settings: { preset: "pulse-bar", enabled: true },
      }).settings,
    ).toMatchObject({ preset: "pulse-bar", enabled: true })
    expect(() =>
      parseNativeMotionSetting({
        schemaVersion: 1,
        kind: "question-decoration",
        settings: { preset: "lottie", lottieUrl: "javascript:alert(1)" },
      }),
    ).toThrow()
    const overlay = {
      id: "overlay-a",
      assetUrl: "/media/test.lottie",
      durationMs: 1000,
      fadeInMs: 600,
      fadeOutMs: 500,
    }
    expect(() =>
      parseNativeMotionSetting({
        schemaVersion: 1,
        kind: "cinematic-overlay",
        settings: overlay,
      }),
    ).toThrow("overlayFadeExceedsDuration")
    const parsed = parseNativeMotionSetting({
      schemaVersion: 1,
      kind: "cinematic-overlay",
      settings: {
        ...overlay,
        fadeOutMs: 400,
        timeBase: "scene",
        finish: "holdLastFrame",
      },
    })
    expect(parsed.settings).toMatchObject({
      timeBase: "scene",
      finish: "holdLastFrame",
    })
    expect(Object.isFrozen(parsed.settings)).toBe(true)
  })
  it("retains scene/video time bases and rejects unknown major versions and host callbacks", () => {
    const library = getNativeMotionLibrary()
    expect(library.cinematicOverlay.maxPerScene).toBe(8)
    expect(library.cinematicOverlay.timeBases).toEqual(["video", "scene"])
    expect(() =>
      parseNativeMotionSetting({
        schemaVersion: 2,
        kind: "stage-entrance",
        settings: {},
      }),
    ).toThrow()
    expect(() =>
      parseNativeMotionSetting({
        schemaVersion: 1,
        kind: "stage-entrance",
        settings: { onEnd() {} },
      }),
    ).toThrow("non-json-value")
  })
})
