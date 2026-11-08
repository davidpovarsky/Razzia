import type { Player, QuizzMode } from "@razzia/common/types/game"
import {
  isQuizExtrasV2,
  type RevealDistributionSnapshot,
} from "../../core/index"
import { shouldShowLeaderboard } from "../../gameplay/index"
import type { ExtensionGameSession } from "./session"
import type { StudioShowCoordinator } from "./studio-show-coordinator"
import type { GameRoster } from "./roster/index"

type ScoredPlayer = Player & { lastCorrect: boolean; lastPoints: number }

export interface ShowRoundHooks {
  shouldShowLeaderboard?: (params: {
    currentQuestionIndex: number
    currentCategory?: string
    nextCategory?: string
    totalQuestions: number
  }) => boolean
  hasInterlude?: (questionIndex: number) => boolean
  getInterludeAdvance?: (questionIndex: number) => "auto" | "manual"
  getInterludeDuration?: (questionIndex: number) => number
  onInterlude?: (questionIndex: number) => void
  getQuestionId?: (questionIndex: number) => string | undefined
  onResultsCalculated?: (dist: RevealDistributionSnapshot) => void
  onReplayCheckpoint?: (questionIndex: number) => void
  onPresenceChange?: () => void
  onAnswerSubmitted?: (
    playerId: string,
    answerIds: number[],
    points: number,
  ) => void
  onQuestionScored?: (scoredPlayers: ScoredPlayer[]) => void
  onQuestionCompleted?: (questionIndex: number, proceed: () => void) => void
  /** Skip every authored scene belonging to this question and open the next. */
  onQuestionSkipped?: (questionIndex: number) => void
  onShowStart?: (proceed: () => void) => void
  skipShowStartCountdown?: () => boolean
  canPreviousTimelineStep?: () => {
    can: boolean
    reason?: string
    willReopenQuestion?: boolean
  }
  onPreviousTimelineStep?: () => boolean
  hasAuthoredResultsScene?: (questionIndex: number) => boolean
  /** Picture-led shows open the answers directly, without two preview statuses. */
  skipQuestionPreview?: () => boolean
  /** Automatically hold one normal results reveal before the next scene (seconds). */
  quickResultsHoldSeconds?: () => number | null
  votingEntranceMs?: () => number
}

export interface ShowRoundPolicyContext {
  extensionSession: ExtensionGameSession | null
  showCoordinator: StudioShowCoordinator | null
  isCreatingWorldsShow: boolean
  gameMode: QuizzMode
  round: { readonly currentQuestionIndex: number }
  roster: GameRoster
  setLastDistribution(distribution: RevealDistributionSnapshot | null): void
  syncRosterScoresFromPlayers(): void
  broadcastHostPresence(): void
  broadcastExtensionState(): void
}

/** Authored show policy plugs into the original round state machine. */
export function createShowRoundHooks(
  ctx: ShowRoundPolicyContext,
): ShowRoundHooks {
  return {
    shouldShowLeaderboard: ctx.extensionSession
      ? (params) => {
          const extras = ctx.extensionSession?.extras

          if (!extras) {
            return false
          }

          if (isQuizExtrasV2(extras)) {
            if (
              extras.defaults.leaderboardPolicy === "cardOnly" ||
              extras.defaults.leaderboardPolicy === "disabled"
            ) {
              return false
            }

            if (extras.leaderboard) {
              const currentQId = extras.questionIds[params.currentQuestionIndex]
              const nextQId =
                extras.questionIds[params.currentQuestionIndex + 1]

              return shouldShowLeaderboard({
                policy: extras.leaderboard,
                gameMode: ctx.gameMode,
                currentQuestionIndex: params.currentQuestionIndex,
                totalQuestions: params.totalQuestions,
                currentQuestionId: currentQId,
                nextQuestionId: nextQId,
                currentCategory: params.currentCategory,
                nextCategory: params.nextCategory,
                isManualRequested:
                  ctx.extensionSession?.consumeManualLeaderboardRequest() ??
                  false,
              })
            }

            return false
          }

          const currentQId = extras.questionIds[params.currentQuestionIndex]
          const nextQId = extras.questionIds[params.currentQuestionIndex + 1]

          return shouldShowLeaderboard({
            policy: extras.leaderboard,
            gameMode: ctx.gameMode,
            currentQuestionIndex: params.currentQuestionIndex,
            totalQuestions: params.totalQuestions,
            currentQuestionId: currentQId,
            nextQuestionId: nextQId,
            currentCategory: params.currentCategory,
            nextCategory: params.nextCategory,
            isManualRequested:
              ctx.extensionSession?.consumeManualLeaderboardRequest() ?? false,
          })
        }
      : undefined,
    hasInterlude: (qIdx) => {
      if (
        ctx.extensionSession?.extras &&
        isQuizExtrasV2(ctx.extensionSession.extras)
      ) {
        return false
      }

      return ctx.extensionSession?.hasInterlude(qIdx) ?? false
    },
    getInterludeAdvance: (qIdx) =>
      ctx.extensionSession?.getInterludeAdvance(qIdx) ?? "manual",
    getInterludeDuration: (qIdx) =>
      ctx.extensionSession?.getInterludeDuration(qIdx) ?? 5000,
    onInterlude: (qIdx) => {
      if (ctx.extensionSession) {
        ctx.extensionSession.onInterludeStart(qIdx)
        ctx.broadcastExtensionState()
      }
    },
    getQuestionId: (qIdx) => ctx.extensionSession?.getQuestionId(qIdx),
    onResultsCalculated: (dist) => {
      ctx.setLastDistribution(dist)

      if (ctx.extensionSession) {
        ctx.extensionSession.setRevealDistribution(dist)
        ctx.broadcastExtensionState()
      }
    },
    onPresenceChange: () => {
      ctx.broadcastHostPresence()
    },
    onQuestionScored: (scoredPlayers) => {
      const epoch =
        ctx.extensionSession?.currentEpoch ?? ctx.round.currentQuestionIndex + 1
      ctx.roster.recordScores(scoredPlayers, epoch)
    },
    onReplayCheckpoint: (qIdx) => {
      ctx.setLastDistribution(null)
      ctx.showCoordinator?.restoreQuestionPosition(qIdx)

      if (ctx.extensionSession) {
        ctx.extensionSession.onReplayCheckpoint(qIdx)
        ctx.broadcastExtensionState()
      }

      ctx.syncRosterScoresFromPlayers()
      ctx.broadcastHostPresence()
    },
    onShowStart: ctx.showCoordinator
      ? () => {
          ctx.showCoordinator?.start()
        }
      : undefined,
    skipShowStartCountdown: ctx.showCoordinator
      ? () =>
          ctx.isCreatingWorldsShow ||
          (ctx.showCoordinator?.hasAuthoredOpeningAtStart() ?? false)
      : undefined,
    onQuestionCompleted: ctx.showCoordinator
      ? (qIdx) => {
          ctx.showCoordinator?.onQuestionCompleted(qIdx)
        }
      : undefined,
    onQuestionSkipped: ctx.showCoordinator
      ? () => {
          ctx.showCoordinator?.skipQuestionSequence()
        }
      : undefined,
    canPreviousTimelineStep: ctx.showCoordinator
      ? () => ctx.showCoordinator?.canPrevious() ?? { can: false }
      : undefined,
    onPreviousTimelineStep: ctx.showCoordinator
      ? () => {
          const ok = ctx.showCoordinator?.previousScene() ?? false

          if (ok) {
            ctx.broadcastExtensionState()
          }

          return ok
        }
      : undefined,
    hasAuthoredResultsScene: ctx.showCoordinator
      ? (qIdx) =>
          ctx.showCoordinator?.hasNextSceneResultsForQuestion(qIdx) ?? false
      : undefined,
    skipQuestionPreview: () => ctx.isCreatingWorldsShow,
    // Five answer cards (~2s), then the existing 1.12s clock entrance.
    votingEntranceMs: () => (ctx.isCreatingWorldsShow ? 4000 : 0),
    // The server hold includes up to ~2 seconds of queued card/result
    // choreography, leaving the completed percentages readable for ~5 seconds.
    quickResultsHoldSeconds: () => (ctx.isCreatingWorldsShow ? 7 : null),
  }
}
