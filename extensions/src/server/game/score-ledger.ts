// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import type { Answer, Player, Question } from "@razzia/common/types/game"

export type LedgerScoredPlayer = Player & {
  lastCorrect: boolean
  lastPoints: number
}

export interface LedgerQuestionEntry {
  questionIndex: number
  question: Question
  answers: Answer[]
  skipped?: boolean
}

/** Reconnect changes the transport ID, never the identity of an earlier vote. */
export function rebindLedgerPlayer(
  ledger: Map<number, LedgerQuestionEntry>,
  oldId: string,
  newId: string,
): void {
  for (const [index, entry] of ledger) {
    if (!entry.answers.some((answer) => answer.playerId === oldId)) {
      continue
    }

    ledger.set(index, {
      ...entry,
      answers: entry.answers.map((answer) =>
        answer.playerId === oldId ? { ...answer, playerId: newId } : answer,
      ),
    })
  }
}

export const recomputeScoresFromLedger = (
  players: Player[],
  ledgerEntries: LedgerQuestionEntry[],
  scoringByType: Record<
    Question["type"],
    (question: Question, answerIds: number[]) => number
  >,
): LedgerScoredPlayer[] => {
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

    const scoring = scoringByType[entry.question.type]

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

  const scored: LedgerScoredPlayer[] = []

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
