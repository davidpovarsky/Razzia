import { describe, expect, it } from "vitest"
import {
  TADAZZ_V4_SCENES,
  TADAZZ_V4_LABELS,
  continuesQuestionStage,
  normalizeData,
  percentagesFor,
  topIndicesFor,
} from "./types"

describe("TADAZZ v4 extracted presentation kit", () => {
  it("exposes core and second-library full-show motion vocabulary", () => {
    expect(TADAZZ_V4_SCENES).toHaveLength(25)
    expect(new Set(TADAZZ_V4_SCENES).size).toBe(25)
  })
  it("does not invent winner when zero votes are received", () => {
    expect(topIndicesFor({ counts: [0, 0, 0, 0, 0] }, 5)).toEqual([])
  })
  it("preserves ties in neutral survey scene", () => {
    expect(topIndicesFor({ counts: [9, 4, 9, 0, 1] }, 5)).toEqual([0, 2])
  })
  it("uses supplied server percentages over local estimates", () => {
    expect(
      percentagesFor({ counts: [5, 3], percentages: [50, 30] }, 2),
    ).toEqual([50, 30])
  })
  it("never introduces demo/placeholder answers or teams", () => {
    expect(
      normalizeData({ answers: [], teams: [], winners: [] }),
    ).toMatchObject({ answers: [], teams: [], winners: [] })
  })
  it("preserves source-derived copy and the source scene ordering", () => {
    expect(TADAZZ_V4_SCENES.slice(0, 5)).toEqual([
      "question",
      "picture-answers",
      "voting-open",
      "countdown",
      "vote-locked",
    ])
    expect(TADAZZ_V4_LABELS.storyBegin).toBe("LET THE STORY BEGIN…")
    expect(TADAZZ_V4_LABELS.leaderboard).toBe("LEADERBOARD")
    expect(TADAZZ_V4_LABELS.teamLeaderboard).toBe("TEAM LEADERBOARD")
  })
  it("resolves winners based on solutions when mode is quiz", () => {
    expect(topIndicesFor({ mode: "quiz", solutions: [1] }, 4)).toEqual([1])
    expect(topIndicesFor({ mode: "quiz", solutions: [0, 3] }, 4)).toEqual([
      0, 3,
    ])
  })
  it("preserves full array of answers and teams without truncation", () => {
    const eightAnswers = Array.from({ length: 8 }, (_, i) => ({
      title: `A${i}`,
    }))
    const tenTeams = Array.from({ length: 10 }, (_, i) => ({
      name: `Team ${i}`,
      score: i * 10,
    }))
    const normalized = normalizeData({ answers: eightAnswers, teams: tenTeams })
    expect(normalized.answers).toHaveLength(8)
    expect(normalized.teams).toHaveLength(10)
  })
})

describe("question stage continuity", () => {
  const question = { scene: "question" as const, data: { questionKey: "q1" } }

  it("retains the question when new answers enter and cards when results reveal", () => {
    expect(
      continuesQuestionStage(question, {
        scene: "picture-answers",
        data: { questionKey: "q1", questionAlreadyOnStage: true },
      }),
    ).toBe(true)
    expect(
      continuesQuestionStage(
        { ...question, data: { questionKey: "q1", photoLayout: true } },
        {
          scene: "question-image",
          data: { questionKey: "q1", photoLayout: true, questionAlreadyOnStage: true },
        },
      ),
    ).toBe(true)
    expect(
      continuesQuestionStage(
        { ...question, scene: "countdown" },
        {
          scene: "survey-results",
          data: { questionKey: "q1", cardsAlreadyOnStage: true },
        },
      ),
    ).toBe(true)
  })

  it("requires an explicit continuation; replay and cold snapshots start fresh", () => {
    for (const data of [
      { questionKey: "q1" },
      {
        questionKey: "q1",
        questionAlreadyOnStage: false,
        cardsAlreadyOnStage: false,
      },
      { questionKey: "q2", cardsAlreadyOnStage: true },
      { questionKey: "", cardsAlreadyOnStage: true },
      { cardsAlreadyOnStage: true },
    ]) {
      expect(
        continuesQuestionStage(question, { scene: "picture-answers", data }),
      ).toBe(false)
    }
    expect(
      continuesQuestionStage(null, {
        scene: "picture-answers",
        data: { questionKey: "q1", cardsAlreadyOnStage: true },
      }),
    ).toBe(false)
  })

  it("does not reuse a different composition as a question stage", () => {
    for (const scene of [
      "company-opening",
      "top-pick",
      "round-recap",
    ] as const) {
      expect(
        continuesQuestionStage(question, {
          scene,
          data: { questionKey: "q1", cardsAlreadyOnStage: true },
        }),
      ).toBe(false)
      expect(
        continuesQuestionStage(
          { ...question, scene },
          {
            scene: "picture-answers",
            data: { questionKey: "q1", cardsAlreadyOnStage: true },
          },
        ),
      ).toBe(false)
    }
  })
})
