import { isEstimationOptions } from "@razzia/common/questions/options"
import type { Question } from "@razzia/common/types/game"
import type { TimelineItem } from "@razzia/extensions/core"

/** Match the editor's initial selected answer without replacing an authored one. */
export const withQuestionPlayMode = (
  question: Question,
  mode: "quiz" | "survey",
): Question => ({
  ...question,
  playMode: mode,
  ...(mode === "quiz" && !question.solutions?.length
    ? {
        solutions: [
          question.type === "estimation" &&
          isEstimationOptions(question.options)
            ? question.options.min
            : 0,
        ],
      }
    : {}),
})

/** Native round numbers and persisted question arrays follow the authored timeline. */
export const insertQuestionForScene = (
  questions: Question[],
  questionIds: string[],
  timeline: TimelineItem[],
  sceneIndex: number,
  question: Question,
  questionId: string,
) => {
  const questionIndex = timeline
    .slice(0, sceneIndex)
    .filter((item) => item.kind === "question").length

  return {
    nextQuestions: [
      ...questions.slice(0, questionIndex),
      question,
      ...questions.slice(questionIndex),
    ],
    nextQuestionIds: [
      ...questionIds.slice(0, questionIndex),
      questionId,
      ...questionIds.slice(questionIndex),
    ],
    nextCurrentIndex: questionIndex,
  }
}
