import type { Answer, Player, Question } from "@razzia/common/types/game"
import { QUESTION_SCORING } from "@razzia/socket/services/scoring"

export type ScoredPlayer = Player & {
  lastCorrect: boolean
  lastPoints: number
}

export const countAnswers = (answers: Answer[]): Record<number, number> => {
  const answerIds = answers.flatMap((answer) => answer.answerIds)

  return answerIds.reduce<Record<number, number>>((acc, id) => {
    acc[id] = (acc[id] ?? 0) + 1

    return acc
  }, {})
}

export const scoreQuestion = (
  question: Question,
  players: Player[],
  answers: Answer[],
): ScoredPlayer[] => {
  const scored = players.map((player) => {
    const playerAnswer = answers.find((a) => a.playerId === player.id)

    const scoreMultiplier = (() => {
      if (!playerAnswer) {
        return 0
      }

      const scoring = QUESTION_SCORING[question.type]

      return scoring(question, playerAnswer.answerIds)
    })()

    const points = Math.round((playerAnswer?.points ?? 0) * scoreMultiplier)
    const isCorrect = scoreMultiplier > 0
    const penalty = !isCorrect && playerAnswer ? (question.penalty ?? 0) : 0

    player.points = Math.max(0, player.points + points - penalty)
    player.streak = isCorrect ? player.streak + 1 : 0

    return {
      ...player,
      lastCorrect: isCorrect,
      lastPoints: isCorrect ? points : -penalty,
    }
  })

  return scored.sort((a, b) => b.points - a.points)
}

export interface LedgerQuestionEntry {
  questionIndex: number
  question: Question
  answers: Answer[]
  skipped?: boolean
}

export const recomputeScoresFromLedger = (
  players: Player[],
  ledgerEntries: LedgerQuestionEntry[],
): ScoredPlayer[] => {
  const sortedEntries = [...ledgerEntries].sort(
    (a, b) => a.questionIndex - b.questionIndex,
  )

  const playerStates = new Map<
    string,
    {
      player: Player
      points: number
      streak: number
      lastCorrect: boolean
      lastPoints: number
    }
  >()

  for (const player of players) {
    playerStates.set(player.id, {
      player: { ...player },
      points: 0,
      streak: 0,
      lastCorrect: false,
      lastPoints: 0,
    })
  }

  for (const entry of sortedEntries) {
    if (entry.skipped) {
      continue
    }

    const scoring = QUESTION_SCORING[entry.question.type]

    for (const [, state] of playerStates) {
      const playerAnswer = entry.answers.find(
        (a) => a.playerId === state.player.id,
      )

      const scoreMultiplier = (() => {
        if (!playerAnswer) {
          return 0
        }

        return scoring ? scoring(entry.question, playerAnswer.answerIds) : 0
      })()

      const points = Math.round((playerAnswer?.points ?? 0) * scoreMultiplier)
      const isCorrect = scoreMultiplier > 0
      const penalty =
        !isCorrect && playerAnswer ? (entry.question.penalty ?? 0) : 0

      state.points = Math.max(0, state.points + points - penalty)
      state.streak = isCorrect ? state.streak + 1 : 0
      state.lastCorrect = isCorrect
      state.lastPoints = isCorrect ? points : -penalty
    }
  }

  const scored: ScoredPlayer[] = []

  for (const [, state] of playerStates) {
    state.player.points = state.points
    state.player.streak = state.streak
    scored.push({
      ...state.player,
      lastCorrect: state.lastCorrect,
      lastPoints: state.lastPoints,
    })
  }

  return scored.sort((a, b) => b.points - a.points)
}
