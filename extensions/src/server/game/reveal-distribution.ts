// oxlint-disable typescript/no-unnecessary-condition -- Preserve guards around historical answer payloads.
import { isEstimationOptions } from "@razzia/common/questions/options"
import type { Answer, Player, Question } from "@razzia/common/types/game"
import type {
  EstimationDistribution,
  RevealDistributionSnapshot,
  RevealOptionDistribution,
} from "../../core/index"

export function createRevealDistribution(input: {
  question: Question
  answers: readonly Answer[]
  players: readonly Player[]
  survey: boolean
  questionIndex: number
  questionId?: string
  startedAt: number
}): RevealDistributionSnapshot {
  const connectedPlayers = input.players.filter((p) => p.connected)
  const eligibleCount = connectedPlayers.length
  const uniqueResponders = new Set(input.answers.map((a) => a.playerId)).size

  // Calculate reveal distribution data for cinematic reveal without withholding player results
  let optionsDist: Record<number, RevealOptionDistribution> | undefined =
    undefined
  let estimationDist: EstimationDistribution | undefined = undefined

  if (isEstimationOptions(input.question.options)) {
    const guesses: number[] = []

    for (const ans of input.answers) {
      const val = ans.answerIds?.[0]

      if (typeof val === "number" && Number.isFinite(val)) {
        guesses.push(val)
      }
    }

    guesses.sort((a, b) => a - b)
    const target = input.question.solutions?.[0] ?? 0
    let closestGuess: number | undefined = undefined

    if (guesses.length > 0) {
      closestGuess = guesses.reduce((prev, curr) =>
        Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev,
      )
    }

    const median =
      guesses.length > 0 ? guesses[Math.floor(guesses.length / 2)] : undefined

    estimationDist = {
      min: input.question.options.min,
      max: input.question.options.max,
      target,
      guessesCount: guesses.length,
      closestGuess,
      median,
      guesses,
    }
  } else {
    optionsDist = {}
    const counts: Record<number, number> = {}

    for (let i = 0; i < input.question.answers.length; i += 1) {
      counts[i] = 0
    }

    for (const ans of input.answers) {
      if (Array.isArray(ans.answerIds)) {
        for (const id of ans.answerIds) {
          if (typeof id === "number" && id in counts) {
            counts[id] += 1
          }
        }
      }
    }

    for (let i = 0; i < input.question.answers.length; i += 1) {
      const count = counts[i]
      const percentage =
        uniqueResponders > 0 ? Math.round((count / uniqueResponders) * 100) : 0
      const isSolution = input.survey
        ? undefined
        : (input.question.solutions?.includes(i) ?? false)

      optionsDist[i] = {
        index: i,
        count,
        percentage,
        isSolution,
      }
    }
  }

  return {
    questionId: input.questionId,
    questionIndex: input.questionIndex,
    questionType: input.question.type,
    totalResponders: uniqueResponders,
    eligiblePlayers: eligibleCount,
    revealStartedAt: input.startedAt,
    options: optionsDist,
    estimation: estimationDist,
    solutions: input.survey ? undefined : input.question.solutions,
  }
}
