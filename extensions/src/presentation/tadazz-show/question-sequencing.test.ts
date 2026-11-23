import { describe, expect, it, vi } from "vitest"
import { planTransition, runSteps } from "./show-director"
import type { StageQuestion, TadazzStageHandle } from "./TadazzStage"
import type { ShowScene } from "./presentation-scene"
import { createPreviewTransitionOwner } from "../show-library-preview/preview-transition-owner"
import { continuesQuestionStage } from "../tadazz-v4/types"

const question: StageQuestion = {
  key: "Q1",
  question: "A stable question?",
  number: 1,
  totalQuestions: 1,
  options: [{ label: "A" }, { label: "B" }],
  answerCount: 2,
}
const voting: ShowScene = {
  kind: "voting",
  key: "voting:Q1",
  question,
  questionType: "single",
  seconds: 20,
  remainingSeconds: 20,
  votingStartsAt: 3000,
  votingEndsAt: 23000,
  totalPlayers: 1,
  answers: ["A", "B"],
}

describe("atomic answer and timer transition", () => {
  it.each(["question", "idle"] as const)(
    "renders answers and timer together from%s",
    async (mode) => {
      const steps = planTransition(
        null,
        voting,
        { mode, questionKey: mode === "question" ? "Q1" : null },
        3000,
      )
      expect(steps).toEqual([
        { op: "openVoting", question, seconds: 20, deadlineMs: 23000 },
      ])
      const openVoting = vi.fn().mockResolvedValue(undefined)
      const handle = { openVoting } as unknown as TadazzStageHandle
      await runSteps(handle, steps, () => true)
      expect(openVoting).toHaveBeenCalledExactlyOnceWith(20, 23000, question)
    },
  )

  it("passes the complete question through the guarded preview owner using the latest clock", async () => {
    const openVoting = vi.fn().mockResolvedValue(undefined)
    const handle = {
      questionKey: null,
      openVoting,
    } as unknown as TadazzStageHandle
    const latest = vi.fn((key: string | null) =>
      key === "Q1" ? { seconds: 20, deadlineMs: 24000 } : null,
    )
    const owner = createPreviewTransitionOwner(handle, latest)
    expect(
      await owner.run([
        { op: "openVoting", question, seconds: 20, deadlineMs: 23000 },
      ]),
    ).toBe(true)
    expect(latest).toHaveBeenCalledWith("Q1")
    expect(openVoting).toHaveBeenCalledExactlyOnceWith(20, 24000, question)
    owner.dispose()
  })

  it("retains text and photo question trees while allowing explicit replay to reset", () => {
    for (const scene of ["question", "question-image"] as const) {
      const previous = { scene, data: { questionKey: "Q1" } }
      expect(
        continuesQuestionStage(previous, {
          scene: "countdown",
          data: { questionKey: "Q1", questionAlreadyOnStage: true },
        }),
      ).toBe(true)
      expect(
        continuesQuestionStage(previous, {
          scene: "question",
          data: { questionKey: "Q1" },
        }),
      ).toBe(false)
    }
  })
})
