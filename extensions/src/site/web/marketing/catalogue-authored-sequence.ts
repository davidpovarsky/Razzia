import type { AuthoredCardOutput } from "../../../core/show-authoring-schema"

/** Index authored cards without dropping scenes before/between/after questions. */
export function catalogueAuthoredSequence(
  cards: readonly AuthoredCardOutput[],
) {
  let questionIndex = -1

  return cards.map((card, cardIndex) => {
    if (card.kind === "quiz" || card.kind === "survey") questionIndex += 1
    return { card, cardIndex, questionIndex: Math.max(0, questionIndex) }
  })
}

/** Replay a question with its own observation and round introduction. */
export function catalogueQuestionReplayEntry(
  sequence: ReturnType<typeof catalogueAuthoredSequence>,
  questionIndex: number,
) {
  let entry = sequence.findIndex(
    (step) =>
      (step.card.kind === "quiz" || step.card.kind === "survey") &&
      step.questionIndex === questionIndex,
  )
  if (entry < 0) return 0
  const questionKey = sequence[entry].card.key

  while (entry > 0) {
    const previous = sequence[entry - 1].card
    if (
      (previous.kind === "media" &&
        previous.key === `${questionKey}-observe`) ||
      (previous.kind === "transition" &&
        previous.key.startsWith("family-round-"))
    ) {
      entry -= 1
    } else break
  }

  return entry
}
