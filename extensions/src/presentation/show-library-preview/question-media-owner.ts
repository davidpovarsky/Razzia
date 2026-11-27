import type {
  AuthoredQuizCard,
  AuthoredSurveyCard,
} from "../../core/show-authoring-schema"
import type { PreviewPhase } from "../../core/show-library/primitives"

type QuestionMediaCard = Pick<
  AuthoredQuizCard | AuthoredSurveyCard,
  "media" | "reveal" | "answers"
>

/** The original-family panel renders static question art itself, even beside image answers. */
export function stageOwnsQuestionImage({
  card,
  phase,
  originalFamily,
}: {
  card: QuestionMediaCard | undefined
  phase: PreviewPhase
  originalFamily: boolean
}): boolean {
  if (
    card?.media?.type !== "image" ||
    (card.reveal && card.reveal.effect !== "none")
  ) {
    return false
  }

  return (
    originalFamily ||
    (phase !== "question" &&
      card.answers.length === 4 &&
      card.answers.every((answer) => !answer.imageUrl))
  )
}
