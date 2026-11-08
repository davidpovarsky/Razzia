import type { Quizz } from "@razzia/common/types/game"
import type {
  AnyQuizExtras,
  PublicInterimResults,
  RevealDistributionSnapshot,
} from "../../core/index"

/** Read-only projection. No votes, scores, clock or session state are changed. */
export function buildInterimResults(
  dist: RevealDistributionSnapshot | null,
  quizz: Quizz,
  extras: AnyQuizExtras | null,
): PublicInterimResults | null {
  if (
    !dist ||
    dist.questionIndex < 0 ||
    dist.questionIndex >= quizz.questions.length
  ) {
    return null
  }

  const q = quizz.questions[dist.questionIndex]
  const qId = extras?.questionIds[dist.questionIndex]
  const qExtras = qId ? extras.perQuestion[qId] : undefined
  const answerVisuals = qExtras?.answerVisuals ?? []

  let maxCount = 0
  for (let i = 0; i < q.answers.length; i += 1) {
    const count = dist.options?.[i]?.count ?? 0

    if (count > maxCount) {
      maxCount = count
    }
  }

  const winners: number[] = []

  if (maxCount > 0) {
    for (let i = 0; i < q.answers.length; i += 1) {
      const count = dist.options?.[i]?.count ?? 0

      if (count === maxCount) {
        winners.push(i)
      }
    }
  }

  const isTie = winners.length > 1

  const options = q.answers.map((label: string, idx: number) => {
    const visual = answerVisuals.find((v) => v.answerIndex === idx)

    return {
      answerIndex: idx,
      label,
      count: dist.options?.[idx]?.count ?? 0,
      percentage: dist.options?.[idx]?.percentage ?? 0,
      imageUrl: visual?.url,
      alt: visual?.alt,
    }
  })

  return {
    sourceQuestionId: dist.questionId ?? qId ?? null,
    questionText: q.question,
    totalResponders: dist.totalResponders,
    options,
    winners,
    isTie,
  }
}
