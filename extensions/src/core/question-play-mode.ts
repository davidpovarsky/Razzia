import type { QuestionPlayMode, QuizzMode } from "@razzia/common/types/game"

/** Per-card mode overrides the legacy whole-quiz mode. */
export function resolveQuestionPlayMode(
  question: { playMode?: QuestionPlayMode } | null | undefined,
  fallbackQuizzMode?: QuizzMode,
): QuestionPlayMode {
  if (question?.playMode === "quiz" || question?.playMode === "survey") {
    return question.playMode
  }

  return fallbackQuizzMode === "survey" ? "survey" : "quiz"
}
