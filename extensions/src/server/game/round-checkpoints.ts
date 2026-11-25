import type { Player, QuestionResult } from "@razzia/common/types/game"
import { rebindLedgerPlayer, type LedgerQuestionEntry } from "./score-ledger"

export interface QuestionCheckpoint {
  questionIndex: number
  players: Player[]
  leaderboard: Player[]
  tempOldLeaderboard: Player[] | null
  questionsHistory: QuestionResult[]
  questionLedger?: Map<number, LedgerQuestionEntry>
}

type CaptureState = Omit<QuestionCheckpoint, "questionIndex">

/** Owns downstream rewind checkpoints; never accepts or scores live votes. */
export class RoundCheckpointStore {
  private readonly records = new Map<number, QuestionCheckpoint>()
  updateSocketId(oldId: string, newId: string): void {
    const rebind = (players: Player[]) =>
      players.map((player) =>
        player.id === oldId ? { ...player, id: newId } : player,
      )
    for (const checkpoint of this.records.values()) {
      checkpoint.players = rebind(checkpoint.players)
      checkpoint.leaderboard = rebind(checkpoint.leaderboard)

      if (checkpoint.tempOldLeaderboard) {
        checkpoint.tempOldLeaderboard = rebind(checkpoint.tempOldLeaderboard)
      }

      if (checkpoint.questionLedger) {
        rebindLedgerPlayer(checkpoint.questionLedger, oldId, newId)
      }
    }
  }
  get(index: number) {
    return this.records.get(index)
  }
  list(): number[] {
    return Array.from(this.records.keys()).sort((a, b) => a - b)
  }
  capture(index: number, state: CaptureState): void {
    this.records.set(index, {
      questionIndex: index,
      players: state.players.map((p) => ({ ...p })),
      leaderboard: state.leaderboard.map((p) => ({ ...p })),
      tempOldLeaderboard: state.tempOldLeaderboard
        ? state.tempOldLeaderboard.map((p) => ({ ...p }))
        : null,
      questionsHistory: structuredClone(state.questionsHistory),
      questionLedger: state.questionLedger
        ? new Map(state.questionLedger)
        : undefined,
    })
  }
  pruneAfter(index: number): void {
    for (const key of this.records.keys()) {
      if (key > index) {
        this.records.delete(key)
      }
    }
  }
  updateClientId(oldClientId: string, newClientId: string): void {
    for (const cp of this.records.values()) {
      cp.players = cp.players.map((p) =>
        p.clientId === oldClientId ? { ...p, clientId: newClientId } : p,
      )
      cp.leaderboard = cp.leaderboard.map((p) =>
        p.clientId === oldClientId ? { ...p, clientId: newClientId } : p,
      )

      if (cp.tempOldLeaderboard) {
        cp.tempOldLeaderboard = cp.tempOldLeaderboard.map((p) =>
          p.clientId === oldClientId ? { ...p, clientId: newClientId } : p,
        )
      }
    }
  }
}

export function restoreCheckpointData(
  cp: QuestionCheckpoint,
  currentPlayers: Player[],
): QuestionCheckpoint {
  return {
    ...cp,
    players: cp.players.map((saved) => {
      const live = currentPlayers.find((p) => p.clientId === saved.clientId)

      return {
        ...saved,
        id: live ? live.id : saved.id,
        connected: live ? live.connected : saved.connected,
      }
    }),
    leaderboard: cp.leaderboard.map((p) => ({ ...p })),
    tempOldLeaderboard: cp.tempOldLeaderboard
      ? cp.tempOldLeaderboard.map((p) => ({ ...p }))
      : null,
    questionsHistory: structuredClone(cp.questionsHistory),
    questionLedger: cp.questionLedger
      ? new Map(
          Array.from(cp.questionLedger, ([key, value]) => [
            key,
            { ...value, answers: [...value.answers] },
          ]),
        )
      : undefined,
  }
}
