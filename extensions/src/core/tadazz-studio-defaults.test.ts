import { describe, expect, it } from "vitest"
import { studioDefaultsSchema } from "./studio-timeline-schema"

describe("Tadazz show-level settings persistence", () => {
  it("leaves existing Razzia shows unchanged", () => {
    const legacy = studioDefaultsSchema.parse({})
    expect(legacy.tadazzBackground).toBeUndefined()
    expect(legacy.motionKit).toBeUndefined()
    expect(legacy.newQuestionMode).toBe("quiz")
    expect(legacy.leaderboardPolicy).toBe("cardOnly")
  })
  it("survives JSON round-trip and keeps unrelated settings", () => {
    const defaults = studioDefaultsSchema.parse({
      newQuestionMode: "survey",
      motionKit: "goldy-20261105",
      stageAnimations: {
        answerEntrance: {
          preset: "cascade",
          durationMs: 650,
          timing: "sequential",
          staggerMs: 120,
        },
      },
      tadazzBackground: {
        mode: "animated",
        intensity: 1.3,
        paused: false,
        fit: "cover",
      },
    })
    const recovered = studioDefaultsSchema.parse(
      JSON.parse(JSON.stringify(defaults)),
    )
    expect(recovered).toEqual(defaults)
    expect(recovered.tadazzBackground?.mode).toBe("animated")
    expect(recovered.stageAnimations?.answerEntrance?.preset).toBe("cascade")
  })
  it("rejects unsafely supplied animated/static settings", () => {
    expect(
      studioDefaultsSchema.safeParse({
        tadazzBackground: { mode: "animated", intensity: 9 },
      }).success,
    ).toBe(false)
    expect(
      studioDefaultsSchema.safeParse({
        tadazzBackground: {
          mode: "static",
          staticUrl: ["java", "script:alert(1)"].join(""),
        },
      }).success,
    ).toBe(false)
  })
})
