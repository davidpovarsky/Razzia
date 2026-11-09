import { buildFullShowDirectory } from "./public-directory"
// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import type { Player, QuestionResult, Quizz } from "@razzia/common/types/game"
import type { Socket } from "@razzia/common/types/game/socket"
import { type RevealDistributionSnapshot } from "../../core/index"
import { buildAnswerRecap } from "./answer-recap"
import { buildInterimResults } from "./interim-results"
import type { ExtensionGameSession, ExtensionSessionDelegate } from "./session"
import type { PresentationLaunch } from "./presentation-launch"
import type { StudioShowCoordinator } from "./studio-show-coordinator"
import type { GameRoster } from "./roster/index"
import type { LedgerQuestionEntry } from "./score-ledger"

export interface SessionRoundPort extends Required<
  Pick<
    ExtensionSessionDelegate,
    | "nextScreen"
    | "previousScreen"
    | "cancelActiveVote"
    | "reopenQuestion"
    | "skipQuestion"
    | "replayFromCheckpoint"
    | "endOrSkipInterlude"
    | "getHistory"
    | "canPrevious"
    | "pauseGame"
    | "resumeGame"
    | "getPauseSnapshot"
  >
> {
  readonly currentQuestionIndex: number
  readonly currentLeaderboard: readonly Player[]
  readonly isCurrentlyAcceptingAnswers: boolean
  endTimer(): boolean
  getAnswerCount(): number
  hasPlayerAnswered(id: string): boolean
  getRevealDistribution(): RevealDistributionSnapshot | null
  getQuestionLedgerEntry(index: number): LedgerQuestionEntry | undefined
}

export interface SessionBridgeContext {
  extensionSession: ExtensionGameSession
  presentationLaunch: PresentationLaunch | null
  showCoordinator: StudioShowCoordinator | null
  round: SessionRoundPort
  quizz: Quizz
  roster: GameRoster
  started(): boolean
  players(): Player[]
  playerCount(): number
  hostSocket(): Socket | undefined
  start(socket: Socket): Promise<void>
  getVoteCompletionReason(): "elapsed" | "manual" | "allAnswered" | null
  lastCompletedDistribution(): RevealDistributionSnapshot | null
  clearQuestionVerdicts(index?: number): void
  syncRosterScoresFromPlayers(): void
  broadcastHostPresence(): void
  broadcastExtensionState(): void
}

/** Binds show commands and projections to explicit authoritative engine ports. */
export function createSessionDelegate(
  ctx: SessionBridgeContext,
): ExtensionSessionDelegate {
  const sidecar = ctx.extensionSession.extras

  return {
    getVoteCompletionReason: () => ctx.getVoteCompletionReason(),
    endAnswerTimer: () => ctx.round.endTimer(),
    nextScreen: () => {
      if (!ctx.started() && ctx.presentationLaunch?.advance()) {
        return true
      }

      if (ctx.started()) {
        return ctx.round.nextScreen()
      }

      const hostSocket = ctx.hostSocket()

      if (!hostSocket || ctx.playerCount() === 0) {
        return false
      }

      void ctx.start(hostSocket)

      return ctx.started()
    },
    previousScreen: () => {
      const ok = ctx.round.previousScreen()

      if (ok) {
        ctx.syncRosterScoresFromPlayers()
        ctx.broadcastHostPresence()
        ctx.broadcastExtensionState()
      }

      return ok
    },
    cancelActiveVote: () => {
      const ok = ctx.round.cancelActiveVote()

      if (ok) {
        ctx.broadcastHostPresence()
        ctx.broadcastExtensionState()
      }

      return ok
    },
    reopenQuestion: (qIdx) => {
      ctx.clearQuestionVerdicts(qIdx)
      const ok = ctx.round.reopenQuestion(qIdx)

      if (ok) {
        ctx.syncRosterScoresFromPlayers()
        ctx.broadcastHostPresence()
        ctx.broadcastExtensionState()
      }

      return ok
    },
    getAnswersCount: () => ctx.round.getAnswerCount(),
    getPresentationLaunch: () =>
      ctx.presentationLaunch?.snapshot(ctx.started()) ?? null,
    getParticipation: () => {
      const connected = ctx.players().filter((player) => player.connected)

      return {
        connected: connected.length,
        answered: connected.filter((player) =>
          ctx.round.hasPlayerAnswered(player.id),
        ).length,
      }
    },
    skipQuestion: (reason) => ctx.round.skipQuestion(reason),
    replayFromCheckpoint: (qIdx) => {
      // Restarting the live question keeps participants who joined after its
      // checkpoint. Earlier history replay retains its existing rewind semantics.
      if (qIdx !== ctx.round.currentQuestionIndex) {
        return ctx.round.replayFromCheckpoint(qIdx)
      }

      ctx.clearQuestionVerdicts(qIdx)
      const ok = ctx.round.reopenQuestion(qIdx)

      if (ok) {
        ctx.syncRosterScoresFromPlayers()
        ctx.broadcastHostPresence()
        ctx.broadcastExtensionState()
      }

      return ok
    },
    endOrSkipInterlude: () => ctx.round.endOrSkipInterlude(),
    getHistory: (qIdx) => ctx.round.getHistory(qIdx),
    advanceTimelineScene: (sceneId, epoch, timelineStepIndex) =>
      ctx.showCoordinator?.advanceScene(sceneId, epoch, timelineStepIndex) ??
      false,
    previousTimelineScene: () => {
      const ok = ctx.showCoordinator?.previousScene() ?? false

      if (ok) {
        ctx.syncRosterScoresFromPlayers()
        ctx.broadcastHostPresence()
        ctx.broadcastExtensionState()
      }

      return ok
    },
    skipTimelineScene: (sceneId, epoch, timelineStepIndex) =>
      ctx.showCoordinator?.skipScene(sceneId, epoch, timelineStepIndex) ??
      false,
    canPrevious: () => {
      if (ctx.showCoordinator?.isSceneActive()) {
        return ctx.showCoordinator.canPrevious()
      }

      return ctx.round.canPrevious()
    },
    isAcceptingAnswers: () => ctx.round.isCurrentlyAcceptingAnswers,
    pauseGame: () => {
      const ok = ctx.showCoordinator?.isSceneActive()
        ? ctx.showCoordinator.pauseGame()
        : ctx.round.pauseGame()

      if (ok) {
        ctx.broadcastExtensionState()
      }

      return ok
    },
    resumeGame: () => {
      const ok = ctx.showCoordinator?.isSceneActive()
        ? ctx.showCoordinator.resumeGame()
        : ctx.round.resumeGame()

      if (ok) {
        ctx.broadcastExtensionState()
      }

      return ok
    },
    getPauseSnapshot: () =>
      ctx.showCoordinator?.isSceneActive()
        ? ctx.showCoordinator.getPauseSnapshot()
        : ctx.round.getPauseSnapshot(),
    getLeaderboard: () => {
      const currentLb = ctx.round.currentLeaderboard
      const source = currentLb.length > 0 ? currentLb : ctx.players()

      return source.map((p) => ({
        displayName: p.username,
        points: p.points,
      }))
    },
    getLastCompletedQuestionSummary: () =>
      buildInterimResults(
        ctx.lastCompletedDistribution() ?? ctx.round.getRevealDistribution(),
        ctx.quizz,
        ctx.extensionSession?.extras ?? null,
      ),
    getFullShowData: () =>
      buildFullShowDirectory(sidecar, [...ctx.roster.entries.values()]),
    getAnswerRecapSummary: (scene, timelineStepIndex) =>
      buildAnswerRecap({
        scene,
        timelineStepIndex,
        quizz: ctx.quizz,
        extras: ctx.extensionSession?.extras ?? null,
        history: (ctx.round.getHistory() ?? []) as QuestionResult[],
        getLedger: (index) => ctx.round.getQuestionLedgerEntry(index),
      }),
  }
}
