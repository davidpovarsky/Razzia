import { describe, expect, it } from "vitest"
import {
  createDefaultQuizExtrasV2,
  createDefaultShowTheme,
  quizExtrasV2Schema,
  type QuizExtrasV2,
} from "@razzia/extensions/core"
import { withLeaderboardPolicy } from "./studio-leaderboard-settings"

const QUIZ_ID = "d4ee9d59-a911-45b6-a1f8-f91f66ab5243"
const QUESTION_ID = "c4c9e65c-edec-4d76-92cf-0efa99881245"
const SCENE_ID = "793146e8-53a8-42de-88b7-589cf478b610"

function authoredFixture(): QuizExtrasV2 {
  const extras = createDefaultQuizExtrasV2(
    QUIZ_ID,
    [QUESTION_ID],
    "a".repeat(64),
  )

  return quizExtrasV2Schema.parse({
    ...extras,
    revision: 7,
    defaults: {
      ...extras.defaults,
      showTheme: {
        ...createDefaultShowTheme(),
        id: "saved-installed-theme",
        legacyPolicy: "preserve-saved",
      },
    },
    timeline: [
      ...extras.timeline,
      {
        id: "d2852569-2097-421e-bc12-fd4fc9410736",
        kind: "transition",
        sceneId: SCENE_ID,
      },
    ],
    scenes: {
      [SCENE_ID]: {
        id: SCENE_ID,
        kind: "transition",
        title: "Authored transition",
        durationMs: 5000,
        advance: "manual",
      },
    },
  })
}

describe("native Studio leaderboard settings", () => {
  it("sets the existing engine policy and interval atomically without changing authored content", () => {
    const original = authoredFixture()
    const snapshot = structuredClone(original)
    const updated = withLeaderboardPolicy(original, "everyN", 2)

    expect(quizExtrasV2Schema.safeParse(updated).success).toBe(true)
    expect(updated.defaults.leaderboardPolicy).toBe("everyN")
    expect(updated.defaults).toEqual({
      ...original.defaults,
      leaderboardPolicy: "everyN",
    })
    expect(updated.leaderboard).toEqual({ mode: "everyN", everyN: 2 })
    expect({
      ...updated,
      defaults: original.defaults,
      leaderboard: original.leaderboard,
    }).toEqual(original)
    expect(updated.defaults.showTheme).toBe(original.defaults.showTheme)
    expect(updated.timeline).toBe(original.timeline)
    expect(updated.scenes).toBe(original.scenes)
    expect(original).toEqual(snapshot)
  })

  it("changes automatic policy without losing the saved interval or authored-card settings", () => {
    const everyTwo = withLeaderboardPolicy(authoredFixture(), "everyN", 2)
    const upstream = withLeaderboardPolicy(everyTwo, "upstream")

    expect(upstream.defaults.leaderboardPolicy).toBe("upstream")
    expect(upstream.defaults).toEqual({
      ...everyTwo.defaults,
      leaderboardPolicy: "upstream",
    })
    expect(upstream.leaderboard).toEqual({ mode: "upstream", everyN: 2 })
    expect({
      ...upstream,
      defaults: everyTwo.defaults,
      leaderboard: everyTwo.leaderboard,
    }).toEqual(everyTwo)

    for (const policy of ["cardOnly", "disabled"] as const) {
      const updated = withLeaderboardPolicy(everyTwo, policy)

      expect(updated.defaults.leaderboardPolicy).toBe(policy)
      expect(updated.defaults).toEqual({
        ...everyTwo.defaults,
        leaderboardPolicy: policy,
      })
      expect(updated.leaderboard).toBe(everyTwo.leaderboard)
      expect(updated.timeline).toBe(everyTwo.timeline)
      expect({ ...updated, defaults: everyTwo.defaults }).toEqual(everyTwo)
      expect(withLeaderboardPolicy(updated, "everyN").leaderboard?.everyN).toBe(
        2,
      )
    }
  })

  it("always stores an interval admitted by the existing strict sidecar schema", () => {
    for (const [value, expected] of [
      [0, 1],
      [2.9, 2],
      [101, 100],
      [Number.NaN, 1],
    ]) {
      const updated = withLeaderboardPolicy(authoredFixture(), "everyN", value)

      expect(updated.leaderboard?.everyN).toBe(expected)
      expect(quizExtrasV2Schema.safeParse(updated).success).toBe(true)
    }
  })
})
