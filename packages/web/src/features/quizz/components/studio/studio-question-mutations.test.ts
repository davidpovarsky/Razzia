import type { Question } from "@razzia/common/types/game"
import { quizzValidator } from "@razzia/common/validators/quizz"
import type { TimelineItem } from "@razzia/extensions/core"
import { describe, expect, it } from "vitest"
import {
  insertQuestionForScene,
  withQuestionPlayMode,
} from "./studio-question-mutations"

const question = (title: string): Question => ({
  type: "single",
  playMode: "quiz",
  question: title,
  answers: ["First", "Second"],
  solutions: [1],
  cooldown: 2,
  time: 20,
})

describe("Studio question mutations", () => {
  it.each([0, 1, 2])(
    "keeps converted scene %i in native question order and preserves existing identities",
    (position) => {
      const originalQuestions = [question("Before"), question("After")]
      const originalIds = ["before", "after"]
      const timeline: TimelineItem[] = originalIds.map((id) => ({
        id: "card-" + id,
        kind: "question",
        questionId: id,
      }))
      timeline.splice(position, 0, {
        id: "convert-me",
        kind: "transition",
        sceneId: "scene",
      })
      const inserted = insertQuestionForScene(
        originalQuestions,
        originalIds,
        timeline,
        position,
        question("Converted"),
        "converted",
      )
      const authoredQuestionIds = timeline.map((item) =>
        item.kind === "question" ? item.questionId : "converted",
      )
      expect(inserted.nextQuestionIds).toEqual(authoredQuestionIds)
      expect(inserted.nextCurrentIndex).toBe(position)
      expect(inserted.nextQuestions[position].question).toBe("Converted")
      expect(
        inserted.nextQuestions.filter((item) => item.question !== "Converted"),
      ).toEqual(originalQuestions)
      expect(originalIds).toEqual(["before", "after"])
      expect(originalQuestions).toHaveLength(2)
    },
  )

  it("converts mixed survey types into valid editable quizzes without changing authored answers", () => {
    const authored = question("Authored correct second answer")
    const survey: Question = {
      ...question("Survey without an answer key"),
      playMode: "survey",
      solutions: [],
    }
    const estimation: Question = {
      ...survey,
      type: "estimation",
      question: "Estimate between ten and twenty",
      answers: [],
      options: { inputMode: "input", min: 10, max: 20, step: 1, margin: 0 },
    }
    const converted = [authored, survey, estimation].map((item) =>
      withQuestionPlayMode(item, "quiz"),
    )
    expect(converted.map((item) => item.solutions)).toEqual([[1], [0], [10]])
    expect(
      quizzValidator.safeParse({
        gameMode: "quiz",
        subject: "Mixed conversion",
        questions: converted,
      }).success,
    ).toBe(true)
    expect(survey.solutions).toEqual([])
    expect(estimation.solutions).toEqual([])
  })

  it("preserves authored solutions through survey and quiz conversion", () => {
    const authored = {
      ...question("Multiple correct answers"),
      type: "multi" as const,
      solutions: [0, 1],
    }
    const survey = withQuestionPlayMode(authored, "survey")
    expect(survey.solutions).toEqual([0, 1])
    expect(withQuestionPlayMode(survey, "quiz").solutions).toEqual([0, 1])
  })
})
