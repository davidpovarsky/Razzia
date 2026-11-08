import {
  createDefaultGameSettings,
  EVENTS,
  SESSION_ROLES,
} from "@razzia/common/constants"
import {
  resolveQuestionPlayMode,
  type GameSettings,
  type Player,
  type QuestionResult,
  type Quizz,
  type QuizzMode,
} from "@razzia/common/types/game"
import type { Server, Socket } from "@razzia/common/types/game/socket"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import {
  generateRosterPlayerId,
  isQuizExtrasV2,
  normalizePhoneE164,
  type HostPresenceSnapshot,
  type RevealDistributionSnapshot,
  type RosterParticipant,
} from "@razzia/extensions/core"
import { shouldShowLeaderboard } from "@razzia/extensions/gameplay"
import {
  buildInterimResults,
  buildAnswerRecap,
  ExtensionGameSession,
  GameRoster,
  readSidecar,
  StudioShowCoordinator,
  type PlayerScoreInfo,
} from "@razzia/extensions/server"
import { isQuestionSupportedOnPstn } from "@razzia/extensions/telephony"
import {
  accountsEnabled,
  withAccount,
} from "@razzia/socket/services/account-scope"
import { getPath, saveResult } from "@razzia/socket/services/config"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { RoundManager } from "@razzia/socket/services/game/round-manager"
import Registry from "@razzia/socket/services/registry"
import { createInviteCode } from "@razzia/socket/utils/game"
import { createNickname } from "@razzia/socket/utils/nickname"
import { SECOND_MS } from "@razzia/socket/utils/sleep"
import { getClientId } from "@razzia/socket/utils/socket"
import { v7 as uuid } from "uuid"

const registry = Registry.getInstance()

const MANAGER_GRACE_SECONDS = 30

class Game {
  readonly gameId: string
  readonly inviteCode: string
  readonly gameMode: QuizzMode

  private _settings: GameSettings = createDefaultGameSettings()
  private _locked = false

  private readonly io: Server
  private readonly _manager: {
    id: string
    clientId: string
    connected: boolean
  }
  private readonly playerManager: PlayerManager
  private readonly round: RoundManager
  private readonly quizz: Quizz
  private readonly cooldown: CooldownTimer
  private readonly extensionSession: ExtensionGameSession | null
  private readonly showCoordinator: StudioShowCoordinator | null = null
  private readonly isCreatingWorldsShow: boolean
  private readonly temporaryGuestsAllowed: boolean
  private lastCompletedDistribution: RevealDistributionSnapshot | null = null
  private managerGraceTimer: NodeJS.Timeout | null = null

  private lastBroadcastStatus: {
    name: Status
    data: StatusDataMap[Status]
  } | null = null
  private managerStatus: {
    name: Status
    data: StatusDataMap[Status]
  } | null = null
  private playerStatus = new Map<
    string,
    { name: Status; data: StatusDataMap[Status] }
  >()
  private readonly spectatorSocketIds = new Set<string>()

  private readonly roster: GameRoster

  constructor(io: Server, managerClientId: string, quizz: Quizz) {
    this.io = io
    this.quizz = quizz
    this.gameId = uuid()
    this.inviteCode = createInviteCode()
    this.gameMode = quizz.gameMode
    this._manager = {
      id: "",
      clientId: managerClientId,
      connected: false,
    }

    this.roster = new GameRoster({
      players: {
        getAll: () => this.playerManager.getAll(),
        findByClientId: (id) => this.playerManager.findByClientId(id),
      },
      onPlayerRenamed: (player) =>
        this.notifyPlayerUpdated(player.id, player, false),
      kickPlayer: (id) => this.kickPlayer(id),
      onChange: () => this.broadcastHostPresence(),
      setPhoneInviteOnly: (phoneInviteOnly) => {
        this._settings = { ...this._settings, phoneInviteOnly }
      },
    })

    const quizzId = (quizz as { id?: string }).id
    const sidecar = quizzId ? readSidecar(getPath, quizzId) : null
    // Scope fast picture voting strictly to the authored Creating Worlds show.
    const isCreatingWorlds = Boolean(
      sidecar &&
      isQuizExtrasV2(sidecar) &&
      sidecar.questionIds.length === 10 &&
      ["round-one", "top-pick", "round-recap", "grand-finale"].every((preset) =>
        Object.values(sidecar.scenes).some(
          (scene) => scene.kind === "animation" && scene.preset === preset,
        ),
      ),
    )

    this.isCreatingWorldsShow = isCreatingWorlds
    this.temporaryGuestsAllowed = Boolean(
      quizzId &&
      (process.env.TADA_TEMP_GUEST_QUIZ_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .includes(quizzId) &&
      (!(
        process.env.TADA_TEMP_GUEST_OWNER_IDS ?? process.env.TADA_PILOT_OWNER_ID
      ) ||
        (
          process.env.TADA_TEMP_GUEST_OWNER_IDS ??
          process.env.TADA_PILOT_OWNER_ID ??
          ""
        )
          .split(",")
          .map((id) => id.trim())
          .includes(managerClientId)),
    )
    this.extensionSession = sidecar
      ? new ExtensionGameSession(this.gameId, sidecar)
      : null

    if (sidecar && isQuizExtrasV2(sidecar)) {
      this.showCoordinator = new StudioShowCoordinator({
        timeline: sidecar.timeline,
        scenes: sidecar.scenes,
        questionIds: sidecar.questionIds,
        defaults: sidecar.defaults,
        callbacks: {
          onStartQuestion: (qIdx) => {
            this.round.startQuestionAtIndex(qIdx)
          },
          onReopenQuestion: (qIdx) => {
            this.clearQuestionVerdicts(qIdx)
            this.round.reopenQuestion(qIdx)
            this.syncRosterScoresFromPlayers()
            this.broadcastHostPresence()
            this.broadcastExtensionState()
          },
          onShowCompletedQuestionResults: (qIdx) => {
            this.round.showCompletedQuestionResults(qIdx)
            this.syncExtensionStatus(STATUS.SHOW_RESPONSES)
          },
          onFinish: () => {
            this.round.finish()
          },
          onBroadcastState: () => {
            const scene = this.showCoordinator?.currentScene

            if (
              scene?.kind === "animation" &&
              scene.preset === "tie-break" &&
              !this.extensionSession?.hasUnresolvedStoryTie()
            ) {
              this.showCoordinator?.advanceScene()

              return
            }

            this.broadcastExtensionState()
          },
        },
      })
      this.extensionSession?.setShowCoordinator(this.showCoordinator)
    }

    if (sidecar?.roster) {
      this._settings = {
        ...this._settings,
        phoneInviteOnly:
          sidecar.roster.phoneInviteOnly && !this.temporaryGuestsAllowed,
      }
      this.roster.seed(sidecar.roster.participants)
    }

    this.cooldown = new CooldownTimer(io, this.gameId)

    this.playerManager = new PlayerManager({
      io,
      gameId: this.gameId,
      gameMode: quizz.gameMode,
      getManagerId: () => this._manager.id,
      isStarted: () => this.started,
    })

    this.round = new RoundManager({
      quizz,
      players: this.playerManager,
      cooldown: this.cooldown,
      io,
      gameId: this.gameId,
      getManagerId: () => this._manager.id,
      broadcast: this.broadcastStatus.bind(this),
      send: this.sendStatus.bind(this),
      onNewQuestion: () => {
        this.playerStatus.clear()
        this.managerStatus = null
        this.broadcastHostPresence()
      },
      onGameFinished: (result) => {
        if (accountsEnabled()) {
          void withAccount(managerClientId, () => saveResult(result))
        } else {
          saveResult(result)
        }
      },
      getSettings: () => this._settings,
      shouldShowLeaderboard: this.extensionSession
        ? (params) => {
            const extras = this.extensionSession?.extras

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
                const currentQId =
                  extras.questionIds[params.currentQuestionIndex]
                const nextQId =
                  extras.questionIds[params.currentQuestionIndex + 1]

                return shouldShowLeaderboard({
                  policy: extras.leaderboard,
                  gameMode: this.gameMode,
                  currentQuestionIndex: params.currentQuestionIndex,
                  totalQuestions: params.totalQuestions,
                  currentQuestionId: currentQId,
                  nextQuestionId: nextQId,
                  currentCategory: params.currentCategory,
                  nextCategory: params.nextCategory,
                  isManualRequested:
                    this.extensionSession.consumeManualLeaderboardRequest(),
                })
              }

              return false
            }

            const currentQId = extras.questionIds[params.currentQuestionIndex]
            const nextQId = extras.questionIds[params.currentQuestionIndex + 1]

            return shouldShowLeaderboard({
              policy: extras.leaderboard,
              gameMode: this.gameMode,
              currentQuestionIndex: params.currentQuestionIndex,
              totalQuestions: params.totalQuestions,
              currentQuestionId: currentQId,
              nextQuestionId: nextQId,
              currentCategory: params.currentCategory,
              nextCategory: params.nextCategory,
              isManualRequested:
                this.extensionSession.consumeManualLeaderboardRequest(),
            })
          }
        : undefined,
      hasInterlude: (qIdx) => {
        if (
          this.extensionSession?.extras &&
          isQuizExtrasV2(this.extensionSession.extras)
        ) {
          return false
        }

        return this.extensionSession?.hasInterlude(qIdx) ?? false
      },
      getInterludeAdvance: (qIdx) =>
        this.extensionSession?.getInterludeAdvance(qIdx) ?? "manual",
      getInterludeDuration: (qIdx) =>
        this.extensionSession?.getInterludeDuration(qIdx) ?? 5000,
      onInterlude: (qIdx) => {
        if (this.extensionSession) {
          this.extensionSession.onInterludeStart(qIdx)
          this.broadcastExtensionState()
        }
      },
      getQuestionId: (qIdx) => this.extensionSession?.getQuestionId(qIdx),
      onResultsCalculated: (dist) => {
        this.lastCompletedDistribution = dist

        if (this.extensionSession) {
          this.extensionSession.setRevealDistribution(dist)
          this.broadcastExtensionState()
        }
      },
      onPresenceChange: () => {
        this.broadcastHostPresence()
      },
      onQuestionScored: (scoredPlayers) => {
        const epoch =
          this.extensionSession?.currentEpoch ??
          this.round.currentQuestionIndex + 1
        this.roster.recordScores(scoredPlayers, epoch)
      },
      onReplayCheckpoint: (qIdx) => {
        this.lastCompletedDistribution = null
        this.showCoordinator?.restoreQuestionPosition(qIdx)

        if (this.extensionSession) {
          this.extensionSession.onReplayCheckpoint(qIdx)
          this.broadcastExtensionState()
        }

        this.syncRosterScoresFromPlayers()
        this.broadcastHostPresence()
      },
      onShowStart: this.showCoordinator
        ? () => {
            this.showCoordinator?.start()
          }
        : undefined,
      skipShowStartCountdown: this.showCoordinator
        ? () =>
            this.isCreatingWorldsShow ||
            (this.showCoordinator?.hasAuthoredOpeningAtStart() ?? false)
        : undefined,
      onQuestionCompleted: this.showCoordinator
        ? (qIdx) => {
            this.showCoordinator?.onQuestionCompleted(qIdx)
          }
        : undefined,
      onQuestionSkipped: this.showCoordinator
        ? () => {
            this.showCoordinator?.skipQuestionSequence()
          }
        : undefined,
      canPreviousTimelineStep: this.showCoordinator
        ? () => this.showCoordinator?.canPrevious() ?? { can: false }
        : undefined,
      onPreviousTimelineStep: this.showCoordinator
        ? () => {
            const ok = this.showCoordinator?.previousScene() ?? false

            if (ok) {
              this.broadcastExtensionState()
            }

            return ok
          }
        : undefined,
      hasAuthoredResultsScene: this.showCoordinator
        ? (qIdx) =>
            this.showCoordinator?.hasNextSceneResultsForQuestion(qIdx) ?? false
        : undefined,
      skipQuestionPreview: () => isCreatingWorlds,
      // Five answer cards (~2s), then the existing 1.12s clock entrance.
      votingEntranceMs: () => (isCreatingWorlds ? 4000 : 0),
      // The server hold includes up to ~2 seconds of queued card/result
      // choreography, leaving the completed percentages readable for ~5 seconds.
      quickResultsHoldSeconds: () => (isCreatingWorlds ? 7 : null),
    })

    if (this.extensionSession) {
      this.extensionSession.setDelegate({
        getVoteCompletionReason: () => this.getVoteCompletionReason(),
        endAnswerTimer: () => this.round.endTimer(),
        nextScreen: () => {
          if (this.started) return this.round.nextScreen()
          const hostSocket = this.io.sockets.sockets.get(this.manager.id)
          if (!hostSocket || this.playerManager.count() === 0) return false
          void this.start(hostSocket)
          return this.started
        },
        previousScreen: () => {
          const ok = this.round.previousScreen()

          if (ok) {
            this.syncRosterScoresFromPlayers()
            this.broadcastHostPresence()
            this.broadcastExtensionState()
          }

          return ok
        },
        cancelActiveVote: () => {
          const ok = this.round.cancelActiveVote()

          if (ok) {
            this.broadcastHostPresence()
            this.broadcastExtensionState()
          }

          return ok
        },
        reopenQuestion: (qIdx) => {
          this.clearQuestionVerdicts(qIdx)
          const ok = this.round.reopenQuestion(qIdx)

          if (ok) {
            this.syncRosterScoresFromPlayers()
            this.broadcastHostPresence()
            this.broadcastExtensionState()
          }

          return ok
        },
        getAnswersCount: () => this.round.getAnswerCount(),
        skipQuestion: (reason) => this.round.skipQuestion(reason),
        replayFromCheckpoint: (qIdx) => {
          // Restarting the live question keeps participants who joined after its
          // checkpoint. Earlier history replay retains its existing rewind semantics.
          if (qIdx !== this.round.currentQuestionIndex)
            return this.round.replayFromCheckpoint(qIdx)
          this.clearQuestionVerdicts(qIdx)
          const ok = this.round.reopenQuestion(qIdx)
          if (ok) {
            this.syncRosterScoresFromPlayers()
            this.broadcastHostPresence()
            this.broadcastExtensionState()
          }
          return ok
        },
        endOrSkipInterlude: () => this.round.endOrSkipInterlude(),
        getHistory: (qIdx) => this.round.getHistory(qIdx),
        advanceTimelineScene: (sceneId, epoch, timelineStepIndex) =>
          this.showCoordinator?.advanceScene(
            sceneId,
            epoch,
            timelineStepIndex,
          ) ?? false,
        previousTimelineScene: () => {
          const ok = this.showCoordinator?.previousScene() ?? false

          if (ok) {
            this.syncRosterScoresFromPlayers()
            this.broadcastHostPresence()
            this.broadcastExtensionState()
          }

          return ok
        },
        skipTimelineScene: (sceneId, epoch, timelineStepIndex) =>
          this.showCoordinator?.skipScene(sceneId, epoch, timelineStepIndex) ??
          false,
        canPrevious: () => {
          if (this.showCoordinator?.isSceneActive()) {
            return this.showCoordinator.canPrevious()
          }

          return this.round.canPrevious()
        },
        isAcceptingAnswers: () => this.round.isCurrentlyAcceptingAnswers,
        pauseGame: () => {
          const ok = this.showCoordinator?.isSceneActive()
            ? this.showCoordinator.pauseGame()
            : this.round.pauseGame()

          if (ok) {
            this.broadcastExtensionState()
          }
          return ok
        },
        resumeGame: () => {
          const ok = this.showCoordinator?.isSceneActive()
            ? this.showCoordinator.resumeGame()
            : this.round.resumeGame()

          if (ok) {
            this.broadcastExtensionState()
          }
          return ok
        },
        getPauseSnapshot: () =>
          this.showCoordinator?.isSceneActive()
            ? this.showCoordinator.getPauseSnapshot()
            : this.round.getPauseSnapshot(),
        getLeaderboard: () => {
          const currentLb = this.round.currentLeaderboard
          const source = currentLb.length > 0 ? currentLb : this.players

          return source.map((p) => ({
            displayName: p.username,
            points: p.points,
          }))
        },
        getLastCompletedQuestionSummary: () =>
          buildInterimResults(
            this.lastCompletedDistribution ??
              this.round.getRevealDistribution(),
            this.quizz,
            this.extensionSession?.extras ?? null,
          ),
        getFullShowData: () => ({
          isLive: true,
          dialNumber:
            sidecar && isQuizExtrasV2(sidecar)
              ? (
                  Object.values(sidecar.scenes).find(
                    (scene) =>
                      scene.kind === "animation" &&
                      scene.preset === "representative-directory",
                  ) as { dialNumber?: string } | undefined
                )?.dialNumber
              : undefined,
          connectedTables: [
            ...new Set(
              [...this.roster.entries.values()].flatMap((entry, index) =>
                entry.status === "connected"
                  ? [entry.tableNumber ?? index + 1]
                  : [],
              ),
            ),
          ],
          representatives: [...this.roster.entries.values()].map(
            (entry, index) => ({
              table: entry.tableNumber ?? index + 1,
              name: entry.displayName,
            }),
          ),
        }),
        getAnswerRecapSummary: (scene, timelineStepIndex) =>
          buildAnswerRecap({
            scene,
            timelineStepIndex,
            quizz: this.quizz,
            extras: this.extensionSession?.extras ?? null,
            history: (this.round.getHistory() ?? []) as QuestionResult[],
            getLedger: (index) => this.round.getQuestionLedgerEntry(index),
          }),
      })
    }

    console.log(
      `New game created: ${this.inviteCode} subject: ${quizz.subject}`,
    )
  }

  get manager() {
    return this._manager
  }

  /** Public-room images only; never reveal media belonging to a different account. */
  canViewMedia(name: string): boolean {
    const content = JSON.stringify([
      this.quizz,
      this.extensionSession?.extras ?? {},
    ])
    const referenced = new Set(
      Array.from(
        content.matchAll(new RegExp("/media/([A-Za-z0-9_.-]+)", "g")),
        (match) => match[1],
      ),
    )

    return referenced.has(name)
  }

  get roundManager(): RoundManager {
    return this.round
  }

  get players(): Player[] {
    return this.playerManager.getAll()
  }

  get started(): boolean {
    return this.round.isStarted()
  }

  get settings(): GameSettings {
    return this._settings
  }

  get quizId(): string | undefined {
    return (this.quizz as { id?: string }).id
  }

  updateSettings(settings: Partial<GameSettings>): boolean {
    if (
      this.started &&
      Object.keys(settings).some((key) => key !== "endOnAllAnswered")
    ) {
      return false
    }

    this._settings = { ...this._settings, ...settings }
    if (settings.endOnAllAnswered) {
      this.round.endIfEveryoneAnswered()
    }
    this.broadcastHostPresence()

    return true
  }

  get phoneInviteOnly(): boolean {
    return Boolean(this._settings.phoneInviteOnly)
  }

  setPhoneInviteOnly(enabled: boolean): void {
    this._settings = { ...this._settings, phoneInviteOnly: enabled }
    this.broadcastHostPresence()
  }

  findRosterByPhone(rawOrE164: string) {
    return this.roster.findByPhone(rawOrE164)
  }

  getRosterEntry(rosterPlayerId: string) {
    return this.roster.get(rosterPlayerId)
  }

  getCurrentQuestionPstnSupport(): {
    supported: boolean
    reason?: string
    answersCount: number
    maxAnswerIndex: number
    isSurvey: boolean
    epoch: number
  } {
    const epoch =
      this.extensionSession?.currentEpoch ??
      (this.started ? this.round.currentEpoch : 0)

    if (!this.started || this.showCoordinator?.isSceneActive()) {
      return {
        supported: false,
        reason: "no_active_question",
        answersCount: 0,
        maxAnswerIndex: -1,
        isSurvey: false,
        epoch,
      }
    }

    const currentQ = this.quizz.questions[this.round.currentQuestionIndex]

    if (!currentQ) {
      return {
        supported: false,
        reason: "no_active_question",
        answersCount: 0,
        maxAnswerIndex: -1,
        isSurvey: false,
        epoch,
      }
    }

    const answersCount = currentQ.answers?.length ?? 0
    const playMode = resolveQuestionPlayMode(currentQ, this.gameMode)
    const check = isQuestionSupportedOnPstn(
      this.gameMode,
      currentQ.type,
      answersCount,
      playMode,
    )

    return {
      supported: check.supported,
      reason: check.reason,
      answersCount,
      maxAnswerIndex: answersCount - 1,
      isSurvey: this.round.isSurvey(),
      epoch,
    }
  }

  getQuestionStateForGateway(rosterPlayerId?: string) {
    const pstn = this.getCurrentQuestionPstnSupport()

    if (this.showCoordinator?.isSceneActive()) {
      const entry = rosterPlayerId
        ? this.roster.entries.get(rosterPlayerId)
        : null
      const player = entry?.clientId
        ? this.playerManager.findByClientId(entry.clientId)
        : undefined
      const verdict = rosterPlayerId
        ? (this.roster.verdicts.get(rosterPlayerId) ?? null)
        : null

      return {
        gameId: this.gameId,
        inviteCode: this.inviteCode,
        started: this.started,
        gameMode: this.gameMode,
        epoch: this.showCoordinator.currentEpoch,
        questionIndex: this.round.currentQuestionIndex,
        acceptingAnswers: false,
        answeredCurrentQuestion: true,
        points: player?.points ?? entry?.points ?? 0,
        lastVerdict: verdict,
        answersCount: pstn.answersCount,
        maxAnswerIndex: pstn.maxAnswerIndex,
        isSurvey: pstn.isSurvey,
        isSupportedOnPstn: pstn.supported,
      }
    }

    const epoch =
      this.extensionSession?.currentEpoch ??
      (this.started ? this.round.currentEpoch : 0)
    const entry = rosterPlayerId
      ? this.roster.entries.get(rosterPlayerId)
      : null
    const player = entry?.clientId
      ? this.playerManager.findByClientId(entry.clientId)
      : undefined
    const answered = player ? this.round.hasPlayerAnswered(player.id) : false
    const verdict = rosterPlayerId
      ? (this.roster.verdicts.get(rosterPlayerId) ?? null)
      : null

    return {
      gameId: this.gameId,
      inviteCode: this.inviteCode,
      started: this.started,
      gameMode: this.gameMode,
      epoch,
      questionIndex: this.round.currentQuestionIndex,
      acceptingAnswers: this.round.isCurrentlyAcceptingAnswers,
      answeredCurrentQuestion: answered,
      points: player?.points ?? entry?.points ?? 0,
      lastVerdict: verdict,
      answersCount: pstn.answersCount,
      maxAnswerIndex: pstn.maxAnswerIndex,
      isSurvey: pstn.isSurvey,
      isSupportedOnPstn: pstn.supported,
    }
  }

  /**
   * Direct server-side answer evaluation for authenticated gateway/telephony session.
   * Returns immediate acceptance status and whether verdict is known now or delayed until reveal.
   */
  submitPhoneAnswerByRosterId(
    rosterPlayerId: string,
    zeroBasedAnswerIndex: number,
    callId?: string,
  ): {
    accepted: boolean
    epoch: number
    correct?: boolean
    verdictPending?: boolean
    isSurvey?: boolean
    reason?: string
  } {
    const pstn = this.getCurrentQuestionPstnSupport()
    const { epoch } = pstn

    if (this.showCoordinator?.isSceneActive()) {
      return {
        accepted: false,
        epoch,
        reason: "scene_active",
      }
    }

    if (this.round.isPaused) {
      return {
        accepted: false,
        epoch,
        reason: "game_paused",
      }
    }

    if (!pstn.supported) {
      return {
        accepted: false,
        epoch,
        reason: pstn.reason ?? "unsupported_question_type",
      }
    }

    if (
      typeof zeroBasedAnswerIndex !== "number" ||
      !Number.isInteger(zeroBasedAnswerIndex) ||
      zeroBasedAnswerIndex < 0 ||
      zeroBasedAnswerIndex > pstn.maxAnswerIndex
    ) {
      return {
        accepted: false,
        epoch,
        reason: "invalid_answer_index",
      }
    }

    if (!this.started || !this.round.isCurrentlyAcceptingAnswers) {
      return {
        accepted: false,
        epoch,
        reason: "not_accepting_answers",
      }
    }

    const entry = this.roster.entries.get(rosterPlayerId)

    if (!entry?.clientId) {
      return {
        accepted: false,
        epoch,
        reason: "player_not_joined",
      }
    }

    if (callId && entry.activeCallId && entry.activeCallId !== callId) {
      return {
        accepted: false,
        epoch,
        reason: "stale_call",
      }
    }

    const player = this.playerManager.findByClientId(entry.clientId)

    if (!player) {
      return {
        accepted: false,
        epoch,
        reason: "player_not_found",
      }
    }

    if (this.round.hasPlayerAnswered(player.id)) {
      return {
        accepted: false,
        epoch,
        reason: "duplicate_answer",
      }
    }

    entry.lastSeenAt = Date.now()
    // Construct a minimal Socket-compatible shim for RoundManager.selectAnswer
    const fakeSocket = {
      id: player.id,
      data: { clientId: player.clientId, role: "player" },
      to: (room: string) => this.io.to(room),
      emit: (ev: string, payload: unknown) => {
        ;(
          this.io.to(player.id) as unknown as {
            emit: (_e: string, _p: unknown) => void
          }
        ).emit(ev, payload)
      },
    } as unknown as Socket

    this.round.selectAnswer(fakeSocket, [zeroBasedAnswerIndex])

    const nowAnswered = this.round.hasPlayerAnswered(player.id)

    if (!nowAnswered) {
      return {
        accepted: false,
        epoch,
        reason: "rejected_by_engine",
      }
    }

    if (this.round.isSurvey()) {
      return {
        accepted: true,
        epoch,
        isSurvey: true,
        verdictPending: false,
      }
    }

    // Note: if this was the last connected player to answer, RoundManager immediately
    // aborts cooldown and runs showResults() synchronously or right after!
    const verdict = this.roster.verdicts.get(rosterPlayerId)

    if (verdict?.epoch === epoch) {
      return {
        accepted: true,
        epoch,
        correct: verdict.correct,
        verdictPending: false,
      }
    }

    return {
      accepted: true,
      epoch,
      verdictPending: true,
    }
  }

  /**
   * CRUD operations on game roster for the host.
   */
  upsertRosterParticipant(
    input: Parameters<GameRoster["upsert"]>[0],
  ): RosterParticipant {
    return this.roster.upsert(input)
  }

  removeRosterParticipant(rosterPlayerId: string): boolean {
    return this.roster.remove(rosterPlayerId)
  }

  replaceRosterParticipants(
    participants: RosterParticipant[],
    phoneInviteOnly?: boolean,
  ): void {
    this.roster.replace(participants, phoneInviteOnly)
  }

  private clearQuestionVerdicts(_qIdx?: number): void {
    this.roster.verdicts.clear()
  }

  private syncRosterScoresFromPlayers(): void {
    this.roster.syncScores()
  }

  getHostPresenceSnapshot(): HostPresenceSnapshot {
    return this.roster.snapshot(
      this.gameId,
      this.phoneInviteOnly,
      this.round.getAnsweredPlayerIds(),
    )
  }

  broadcastHostPresence(): void {
    this.roster.sequence += 1
    // Displays receive the live roster through the extension envelope as well.
    // Give presence changes a new sequence so clients accept the update.
    this.extensionSession?.onPresenceChanged()
    this.broadcastExtensionState()

    if (!this._manager.id) {
      return
    }

    const snapshot = this.getHostPresenceSnapshot()
    this.io.to(this._manager.id).emit(EVENTS.MANAGER.HOST_PRESENCE, snapshot)
  }

  get locked(): boolean {
    return this._locked
  }

  setLocked(locked: boolean) {
    this._locked = locked
    this.io.to(this._manager.id).emit(EVENTS.MANAGER.LOCK_UPDATED, locked)
  }

  // ── Spectator / Audience Projector ──────────────────────────────────────────

  hasSpectatorSocket(socketId: string): boolean {
    return this.spectatorSocketIds.has(socketId)
  }

  getSpectatorCount(): number {
    return this.spectatorSocketIds.size
  }

  joinSpectator(socket: Socket) {
    socket.join(this.gameId)
    this.spectatorSocketIds.add(socket.id)
    socket.data = {
      clientId: getClientId(socket),
      role: SESSION_ROLES.SPECTATOR,
      gameId: this.gameId,
    }

    socket.emit(EVENTS.SPECTATOR.SUCCESS_JOIN, {
      gameId: this.gameId,
      inviteCode: this.inviteCode,
      gameMode: this.gameMode,
    })

    const currentStatus =
      this.managerStatus ??
      this.lastBroadcastStatus ??
      (!this.started
        ? {
            name: STATUS.SHOW_ROOM,
            data: {
              text: "game:waitingForPlayers",
              inviteCode: this.inviteCode,
            },
          }
        : null)

    if (currentStatus) {
      const sanitized = this.sanitizeStatusForAudience(currentStatus)

      if (
        sanitized.name === STATUS.SELECT_ANSWER &&
        this.round.isCurrentlyAcceptingAnswers
      ) {
        const remaining = this.round.getRemainingSeconds()

        if (remaining !== null && remaining !== undefined) {
          ;(sanitized.data as Record<string, unknown>).remainingTime = remaining
        }
      }

      socket.emit(EVENTS.GAME.STATUS, sanitized)
    }

    const reconnectInfo = this.round.getReconnectInfo()

    if (reconnectInfo) {
      socket.emit(EVENTS.GAME.UPDATE_QUESTION, reconnectInfo)
    }

    if (this.round.isCurrentlyAcceptingAnswers) {
      socket.emit(EVENTS.GAME.COOLDOWN, this.round.getRemainingSeconds())
    }

    if (this.extensionSession) {
      const playerScores: PlayerScoreInfo[] = this.players.map((p) => ({
        clientId: p.clientId,
        score: p.points,
        isConnected: p.connected,
      }))
      const specSnapshot = this.extensionSession.getStateSnapshot(
        "player",
        playerScores,
      )
      socket.emit(EVENTS.EXTENSIONS.STATE, specSnapshot)
    }
  }

  leaveSpectator(socket: Socket) {
    socket.leave(this.gameId)
    this.spectatorSocketIds.delete(socket.id)
  }

  public sanitizeStatusForAudience<T extends Status>(statusData: {
    name: T
    data: StatusDataMap[T]
  }): { name: T; data: StatusDataMap[T] } {
    if (!statusData || typeof statusData !== "object" || !statusData.data) {
      return statusData
    }

    const cleanData = { ...statusData.data } as Record<string, unknown>

    // Policy: Never expose editorial/backstage note to audience or players
    if ("note" in cleanData) {
      delete cleanData.note
    }

    // In SELECT_ANSWER: never leak solutions
    if (
      statusData.name === STATUS.SELECT_ANSWER ||
      statusData.name === STATUS.SHOW_QUESTION
    ) {
      if ("solutions" in cleanData) {
        delete cleanData.solutions
      }
    }

    // For survey questions: solutions must be undefined
    if (this.round.isSurvey() && "solutions" in cleanData) {
      delete cleanData.solutions
    }

    return {
      name: statusData.name,
      data: cleanData as StatusDataMap[T],
    }
  }

  // ── Status broadcasting ──────────────────────────────────────────────────

  private broadcastStatus<T extends Status>(status: T, data: StatusDataMap[T]) {
    const statusData = { name: status, data }
    this.lastBroadcastStatus = statusData
    const publicStatus = this.sanitizeStatusForAudience(statusData)

    // For Creating Worlds, the per-question image/answer metadata MUST arrive
    // before the five-card voting status. Otherwise the browser briefly pairs
    // the next question text with the previous question pictures.
    if (this.isCreatingWorldsShow && this.extensionSession) {
      this.syncExtensionStatus(status)
    }
    this.io.to(this.gameId).emit(EVENTS.GAME.STATUS, publicStatus)

    if (!this.isCreatingWorldsShow && this.extensionSession) {
      this.syncExtensionStatus(status)
    }
  }

  private syncExtensionStatus(status: Status) {
    if (!this.extensionSession) {
      return
    }

    if (
      status === STATUS.SHOW_QUESTION ||
      (status === STATUS.SELECT_ANSWER &&
        this.showCoordinator?.currentPhase === "question" &&
        (this.extensionSession.currentPhase !== "question" ||
          this.extensionSession.getCurrentQuestionId() !==
            this.extensionSession.getQuestionId(
              this.round.currentQuestionIndex,
            )))
    ) {
      // The picture-led show skips SHOW_QUESTION: initialize its authoritative
      // per-question visuals when the five-card voting screen first opens.
      this.extensionSession.onQuestionStart(this.round.currentQuestionIndex)
    } else {
      const phaseMap: Partial<
        Record<
          Status,
          | "lobby"
          | "prepared"
          | "question"
          | "responses"
          | "leaderboard"
          | "finished"
        >
      > = {
        [STATUS.SHOW_ROOM]: "lobby",
        [STATUS.SHOW_START]: "prepared",
        [STATUS.SHOW_PREPARED]: "prepared",
        [STATUS.SELECT_ANSWER]: "question",
        [STATUS.SHOW_RESULT]: "responses",
        [STATUS.SHOW_RESPONSES]: "responses",
        [STATUS.SHOW_LEADERBOARD]: "leaderboard",
        [STATUS.FINISHED]: "finished",
        [STATUS.SUMMARY]: "finished",
      }

      const phase = phaseMap[status]

      if (phase) {
        this.extensionSession.setPhase(phase)
      }
    }

    this.broadcastExtensionState()
  }

  private broadcastExtensionState() {
    if (!this.extensionSession) {
      return
    }

    const playerScores: PlayerScoreInfo[] = this.players.map((p) => ({
      clientId: p.clientId,
      score: p.points,
      isConnected: p.connected,
    }))

    if (this._manager.id) {
      this.io
        .to(this._manager.id)
        .emit(
          EVENTS.EXTENSIONS.STATE,
          this.extensionSession.getStateSnapshot("manager", playerScores),
        )
    }

    const playerSnapshot = this.extensionSession.getStateSnapshot(
      "player",
      playerScores,
    )

    for (const player of this.players) {
      this.io.to(player.id).emit(EVENTS.EXTENSIONS.STATE, playerSnapshot)
    }

    for (const specId of this.spectatorSocketIds) {
      this.io.to(specId).emit(EVENTS.EXTENSIONS.STATE, playerSnapshot)
    }
  }

  handleExtensionCommand(command: unknown) {
    if (!this.extensionSession) {
      return { success: false }
    }

    const result = this.extensionSession.handleCommand(command, true)
    this.broadcastExtensionState()

    return result
  }

  private sendStatus<T extends Status>(
    target: string,
    status: T,
    data: StatusDataMap[T],
  ) {
    const statusData = { name: status, data }

    if (this._manager.id === target) {
      this.managerStatus = statusData

      if (this.extensionSession) {
        this.syncExtensionStatus(status)
      }

      // Also forward sanitized status to all audience spectators
      const publicStatus = this.sanitizeStatusForAudience(statusData)
      for (const specId of this.spectatorSocketIds) {
        this.io.to(specId).emit(EVENTS.GAME.STATUS, publicStatus)
      }
    } else {
      this.playerStatus.set(target, statusData)
    }

    this.io.to(target).emit(EVENTS.GAME.STATUS, statusData)
  }

  // Player actions

  join(
    socket: Socket,
    username?: string,
    claimsExtra?: {
      rosterPlayerId?: string
      phoneE164?: string
      source?: "web" | "phone"
    },
  ): string | null {
    const clientId = getClientId(socket)
    const normalizedPhone = claimsExtra?.phoneE164
      ? normalizePhoneE164(claimsExtra.phoneE164)
      : null

    // 1. Resolve matching roster entry by explicit rosterPlayerId or phoneE164
    let rosterEntry = claimsExtra?.rosterPlayerId
      ? this.roster.entries.get(claimsExtra.rosterPlayerId)
      : undefined

    if (!rosterEntry && normalizedPhone) {
      const matchedId = this.roster.phoneIndex.get(normalizedPhone)

      if (matchedId) {
        rosterEntry = this.roster.entries.get(matchedId)
      }
    }

    // Browser representatives identify their existing public table row by the
    // configured display name. Match only one not-yet-bound pre-registered row;
    // phone/explicit IDs above remain authoritative and connected rows cannot
    // be taken over by another browser.
    if (!rosterEntry && !normalizedPhone && username?.trim()) {
      const normalizedName = username.trim().toLocaleLowerCase()
      const matches = [...this.roster.entries.values()].filter(
        (entry) =>
          entry.preRegistered &&
          entry.displayName.trim().toLocaleLowerCase() === normalizedName,
      )

      if (matches.length === 1) {
        rosterEntry = matches[0]
        if (
          rosterEntry.status === "connected" &&
          rosterEntry.clientId !== clientId
        ) {
          return "errors:game.playerAlreadyConnected"
        }
      }
    }

    // 2. Enforce phoneInviteOnly for unknown phone callers
    if (
      !rosterEntry &&
      this.isCreatingWorldsShow &&
      !this.temporaryGuestsAllowed &&
      [...this.roster.entries.values()].some((entry) => entry.preRegistered)
    ) {
      return "errors:game.locked"
    }
    if (
      !rosterEntry &&
      (claimsExtra?.source === "phone" || normalizedPhone) &&
      this._settings.phoneInviteOnly
    ) {
      return "errors:game.locked"
    }

    // 3. If this roster entry already has an existing Player (e.g., redial with a new CallId/clientId/socket),
    // rebind the existing Player row without creating a duplicate or losing score/epoch/answer state!
    if (rosterEntry?.clientId) {
      const existingPlayer = this.playerManager.findByClientId(
        rosterEntry.clientId,
      )

      if (existingPlayer) {
        // If same clientId is already connected and not a phone redial, refuse duplicate join
        if (
          existingPlayer.clientId === clientId &&
          existingPlayer.connected &&
          claimsExtra?.source !== "phone" &&
          !normalizedPhone
        ) {
          return "errors:game.playerAlreadyConnected"
        }

        const oldClientId = existingPlayer.clientId
        const oldSocketId = existingPlayer.id
        const replacesConnection =
          existingPlayer.connected && oldSocketId !== socket.id

        socket.join(this.gameId)

        if (oldClientId !== clientId) {
          this.roster.clientIndex.delete(oldClientId)
          this.playerManager.updateClientId(oldSocketId, clientId)
          this.round.updateCheckpointClientId(oldClientId, clientId)
          this.extensionSession?.rebindPlayerClientId(oldClientId, clientId)
        }

        this.playerManager.updateSocketId(oldSocketId, socket.id)
        this.round.updatePlayerId(oldSocketId, socket.id)
        existingPlayer.connected = true
        existingPlayer.username =
          rosterEntry.displayName || existingPlayer.username

        rosterEntry.clientId = clientId
        rosterEntry.status = "connected"
        rosterEntry.timedOut = false
        rosterEntry.lastSeenAt = Date.now()

        if (claimsExtra?.source) {
          rosterEntry.source = claimsExtra.source
        } else if (normalizedPhone) {
          rosterEntry.source = "phone"
        }

        this.roster.clientIndex.set(clientId, rosterEntry.rosterPlayerId)

        this.notifyPlayerUpdated(oldSocketId, existingPlayer, false)

        if (replacesConnection) {
          this.io.in(oldSocketId).disconnectSockets(true)
        }

        const oldStatus = this.playerStatus.get(oldSocketId)

        if (oldStatus) {
          this.playerStatus.delete(oldSocketId)
          this.playerStatus.set(socket.id, oldStatus)
        }

        const status = oldStatus ??
          this.lastBroadcastStatus ?? {
            name: STATUS.WAIT,
            data: { text: "game:waitingForPlayers" },
          }

        socket.emit(EVENTS.GAME.SUCCESS_JOIN, {
          gameId: this.gameId,
          username: existingPlayer.username,
          gameMode: this.gameMode,
        })

        if (this.started) {
          socket.emit(EVENTS.PLAYER.SUCCESS_RECONNECT, {
            gameId: this.gameId,
            gameMode: this.gameMode,
            currentQuestion: this.round.getReconnectInfo(),
            status,
            player: {
              username: existingPlayer.username,
              points: existingPlayer.points,
            },
          })
        }

        this.playerManager.broadcastCount()
        this.broadcastExtensionState()
        this.broadcastHostPresence()

        return null
      }
    }

    // 4. For brand-new joins (not rebinding an existing Player), check lock unless pre-registered in roster
    if (this._locked && !rosterEntry) {
      return "errors:game.locked"
    }

    let finalUsername = rosterEntry?.displayName ?? username

    if (this._settings.generatedUsernames && !rosterEntry) {
      const taken = this.playerManager.getAll().map((player) => player.username)
      finalUsername = createNickname(taken)
    }

    if (!finalUsername) {
      return "errors:auth.usernameTooShort"
    }

    const error = this.playerManager.join(socket, finalUsername)

    if (error) {
      return error
    }

    const now = Date.now()

    if (rosterEntry) {
      rosterEntry.clientId = clientId
      rosterEntry.displayName = finalUsername

      if (normalizedPhone && !rosterEntry.phoneE164) {
        rosterEntry.phoneE164 = normalizedPhone
        this.roster.phoneIndex.set(normalizedPhone, rosterEntry.rosterPlayerId)
      }

      rosterEntry.source =
        claimsExtra?.source ?? (rosterEntry.phoneE164 ? "phone" : "web")
      rosterEntry.status = "connected"
      rosterEntry.timedOut = false
      rosterEntry.lastSeenAt = now
      this.roster.clientIndex.set(clientId, rosterEntry.rosterPlayerId)
    } else {
      const rId = claimsExtra?.rosterPlayerId ?? generateRosterPlayerId()
      const source = claimsExtra?.source ?? (normalizedPhone ? "phone" : "web")
      this.roster.entries.set(rId, {
        rosterPlayerId: rId,
        clientId,
        displayName: finalUsername,
        phoneE164: normalizedPhone,
        source,
        status: "connected",
        timedOut: false,
        points: 0,
        lastSeenAt: now,
        preRegistered: false,
      })
      this.roster.clientIndex.set(clientId, rId)

      if (normalizedPhone) {
        this.roster.phoneIndex.set(normalizedPhone, rId)
      }
    }

    if (this.extensionSession) {
      this.extensionSession.onPlayerJoin(clientId)
      this.broadcastExtensionState()
    }

    // If the game has already started when a phone/rostered participant joins, send current status
    if (this.started && this.lastBroadcastStatus) {
      socket.emit(EVENTS.GAME.STATUS, this.lastBroadcastStatus)
    }

    this.broadcastHostPresence()

    return null
  }

  /**
   * Direct server-side join/rebind for the authenticated local Yemot pilot gateway.
   * Ensures phone callers appear in PlayerManager, host leaderboard, and HostPresenceSnapshot
   * even without a browser WebSocket client.
   */
  joinOrRebindPhoneCaller(input: {
    rosterPlayerId?: string
    phoneRaw?: string | null
    callId: string
    fallbackName?: string
  }): {
    ok: boolean
    error?: string
    rosterPlayerId?: string
    clientId?: string
    displayName?: string
    phoneE164?: string | null
    reconnected?: boolean
    points?: number
  } {
    const normalizedPhone = input.phoneRaw
      ? normalizePhoneE164(input.phoneRaw)
      : null

    let rosterEntry = input.rosterPlayerId
      ? this.roster.entries.get(input.rosterPlayerId)
      : normalizedPhone
        ? (() => {
            const rId = this.roster.phoneIndex.get(normalizedPhone)

            return rId ? this.roster.entries.get(rId) : undefined
          })()
        : undefined

    if (!rosterEntry && this._settings.phoneInviteOnly) {
      return {
        ok: false,
        error: "errors:game.locked",
      }
    }

    if (!rosterEntry && this._locked) {
      return {
        ok: false,
        error: "errors:game.locked",
      }
    }

    const now = Date.now()
    const syntheticSocketId = `phone-sock-${input.callId}`

    // Rebind if already in roster and has a Player
    if (rosterEntry?.clientId) {
      const existingPlayer = this.playerManager.findByClientId(
        rosterEntry.clientId,
      )

      if (existingPlayer) {
        const oldSocketId = existingPlayer.id
        this.playerManager.updateSocketId(oldSocketId, syntheticSocketId)
        this.round.updatePlayerId(oldSocketId, syntheticSocketId)
        existingPlayer.connected = true
        rosterEntry.status = "connected"
        rosterEntry.timedOut = false
        rosterEntry.lastSeenAt = now
        rosterEntry.source = "phone"
        rosterEntry.activeCallId = input.callId

        this.notifyPlayerUpdated(oldSocketId, existingPlayer, false)
        this.playerManager.broadcastCount()
        this.broadcastExtensionState()
        this.broadcastHostPresence()

        return {
          ok: true,
          rosterPlayerId: rosterEntry.rosterPlayerId,
          clientId: existingPlayer.clientId,
          displayName: existingPlayer.username,
          phoneE164: rosterEntry.phoneE164,
          reconnected: true,
          points: existingPlayer.points,
        }
      }
    }

    const rId = rosterEntry?.rosterPlayerId ?? generateRosterPlayerId()
    const clientId = rosterEntry?.clientId ?? `phone-client-${rId}`
    const suffix = normalizedPhone
      ? normalizedPhone.slice(-4)
      : input.callId.slice(-4).padStart(4, "0")
    const displayName =
      rosterEntry?.displayName ?? input.fallbackName ?? `Caller_${suffix}`

    const fakeSocket = {
      id: syntheticSocketId,
      data: { clientId, role: "player" },
      join: (_room: string) => undefined,
      to: (room: string) => this.io.to(room),
      emit: (_event: string) => false,
    } as unknown as Socket

    const joinErr = this.playerManager.join(fakeSocket, displayName)

    if (joinErr) {
      return { ok: false, error: joinErr }
    }

    if (rosterEntry) {
      rosterEntry.clientId = clientId
      rosterEntry.status = "connected"
      rosterEntry.timedOut = false
      rosterEntry.lastSeenAt = now
      rosterEntry.source = "phone"
      rosterEntry.activeCallId = input.callId
    } else {
      rosterEntry = {
        rosterPlayerId: rId,
        clientId,
        displayName,
        phoneE164: normalizedPhone,
        phoneRaw: input.phoneRaw ?? undefined,
        source: "phone",
        status: "connected",
        timedOut: false,
        points: 0,
        lastSeenAt: now,
        preRegistered: false,
        activeCallId: input.callId,
      }
      this.roster.entries.set(rId, rosterEntry)

      if (normalizedPhone) {
        this.roster.phoneIndex.set(normalizedPhone, rId)
      }
    }

    this.roster.clientIndex.set(clientId, rId)

    if (this.extensionSession) {
      this.extensionSession.onPlayerJoin(clientId)
      this.broadcastExtensionState()
    }

    this.broadcastHostPresence()

    return {
      ok: true,
      rosterPlayerId: rId,
      clientId,
      displayName,
      phoneE164: normalizedPhone,
      reconnected: false,
      points: 0,
    }
  }

  disconnectPhoneCallerByRosterId(
    rosterPlayerId: string,
    timedOut = false,
    callId?: string,
  ): boolean {
    const entry = this.roster.entries.get(rosterPlayerId)

    if (!entry) {
      return false
    }

    // If a callId was provided and does not match the currently bound callId, this hangup is stale!
    if (callId && entry.activeCallId && entry.activeCallId !== callId) {
      return false
    }

    entry.status = "disconnected"
    entry.timedOut = timedOut
    entry.lastSeenAt = Date.now()

    if (entry.clientId) {
      const player = this.playerManager.findByClientId(entry.clientId)

      if (player) {
        this.setPlayerDisconnected(player.id, timedOut)

        return true
      }
    }

    this.broadcastHostPresence()

    return true
  }

  dispose() {
    this.round.dispose()
    this.cancelManagerGrace()
  }

  waitForManager(onTimeout: () => void) {
    this.cancelManagerGrace()
    this.managerGraceTimer = setTimeout(() => {
      this.managerGraceTimer = null

      if (!this._manager.connected && !this.started) {
        onTimeout()
      }
    }, MANAGER_GRACE_SECONDS * SECOND_MS)
  }

  private cancelManagerGrace() {
    if (this.managerGraceTimer) {
      clearTimeout(this.managerGraceTimer)
      this.managerGraceTimer = null
    }
  }

  kickPlayer(playerId: string) {
    const player = this.playerManager.findById(playerId)

    if (this.playerManager.kick(playerId)) {
      this.playerStatus.delete(playerId)

      if (player) {
        const rId = this.roster.clientIndex.get(player.clientId)

        if (rId) {
          const entry = this.roster.entries.get(rId)

          if (entry) {
            if (entry.preRegistered || entry.phoneE164) {
              entry.status = "not_joined"
              entry.clientId = null
            } else {
              this.roster.entries.delete(rId)
            }
          }

          this.roster.clientIndex.delete(player.clientId)
        }
      }

      if (this.extensionSession && player) {
        this.extensionSession.onPlayerKicked(player.clientId)
        this.broadcastExtensionState()
      }

      this.broadcastHostPresence()
    }
  }

  // Reconnect

  reconnect(socket: Socket) {
    const clientId = getClientId(socket)

    if (this._manager.clientId === clientId) {
      this.reconnectManager(socket)

      return
    }

    this.reconnectPlayer(socket)
  }

  private reconnectManager(socket: Socket) {
    const previousSocketId = this._manager.connected ? this._manager.id : null

    socket.join(this.gameId)
    this._manager.id = socket.id
    this._manager.connected = true
    this.cancelManagerGrace()

    if (previousSocketId && previousSocketId !== socket.id) {
      this.io
        .to(previousSocketId)
        .emit(EVENTS.GAME.RESET, "errors:game.managerAlreadyConnected")
      this.io.in(previousSocketId).disconnectSockets(true)
    }

    const status = (() => {
      if (this.managerStatus) {
        return this.managerStatus
      }

      if (this.lastBroadcastStatus) {
        return this.lastBroadcastStatus
      }

      return {
        name: STATUS.SHOW_ROOM,
        data: {
          text: "game:waitingForPlayers",
          inviteCode: this.inviteCode,
        },
      }
    })()

    socket.emit(EVENTS.MANAGER.SUCCESS_RECONNECT, {
      gameId: this.gameId,
      inviteCode: this.inviteCode,
      settings: this._settings,
      locked: this._locked,
      currentQuestion: this.round.getReconnectInfo(),
      status,
      players: this.playerManager.getAll(),
    })
    socket.emit(EVENTS.GAME.TOTAL_PLAYERS, this.playerManager.joinedCount())
    socket.emit(EVENTS.MANAGER.HOST_PRESENCE, this.getHostPresenceSnapshot())

    if (this.round.isCurrentlyAcceptingAnswers) {
      socket.emit(EVENTS.GAME.COOLDOWN, this.round.getRemainingSeconds())
    }

    if (this.extensionSession) {
      const playerScores: PlayerScoreInfo[] = this.players.map((p) => ({
        clientId: p.clientId,
        score: p.points,
        isConnected: p.connected,
      }))

      socket.emit(
        EVENTS.EXTENSIONS.STATE,
        this.extensionSession.getStateSnapshot("manager", playerScores),
      )
    }

    registry.reactivateGame(this.gameId)
    console.log(`Manager reconnected to game ${this.inviteCode}`)
  }

  private reconnectPlayer(socket: Socket) {
    const clientId = getClientId(socket)
    const player = this.playerManager.findByClientId(clientId)

    if (!player) {
      return
    }

    socket.join(this.gameId)

    const oldSocketId = player.id
    const replacesConnection = player.connected && oldSocketId !== socket.id
    this.playerManager.updateSocketId(oldSocketId, socket.id)
    this.round.updatePlayerId(oldSocketId, socket.id)
    player.connected = true

    const rId = this.roster.clientIndex.get(clientId)

    if (rId) {
      const entry = this.roster.entries.get(rId)

      if (entry) {
        entry.status = "connected"
        entry.timedOut = false
        entry.lastSeenAt = Date.now()
      }
    }

    this.notifyPlayerUpdated(oldSocketId, player)

    if (replacesConnection) {
      this.io.in(oldSocketId).disconnectSockets(true)
    }

    const status = this.playerStatus.get(oldSocketId) ??
      this.lastBroadcastStatus ?? {
        name: STATUS.WAIT,
        data: { text: "game:waitingForPlayers" },
      }

    if (
      status.name === STATUS.SELECT_ANSWER &&
      this.round.isCurrentlyAcceptingAnswers
    ) {
      const remaining = this.round.getRemainingSeconds()

      if (remaining !== null && remaining !== undefined) {
        ;(status.data as Record<string, unknown>).remainingTime = remaining
      }
    }

    const oldStatus = this.playerStatus.get(oldSocketId)

    if (oldStatus) {
      this.playerStatus.delete(oldSocketId)
      this.playerStatus.set(socket.id, oldStatus)
    }

    socket.emit(EVENTS.PLAYER.SUCCESS_RECONNECT, {
      gameId: this.gameId,
      gameMode: this.gameMode,
      currentQuestion: this.round.getReconnectInfo(),
      status,
      player: { username: player.username, points: player.points },
    })
    this.playerManager.broadcastCount()
    this.broadcastHostPresence()

    if (this.round.isCurrentlyAcceptingAnswers) {
      socket.emit(EVENTS.GAME.COOLDOWN, this.round.getRemainingSeconds())
    }

    if (this.extensionSession) {
      const playerScores: PlayerScoreInfo[] = this.players.map((p) => ({
        clientId: p.clientId,
        score: p.points,
        isConnected: p.connected,
      }))

      socket.emit(
        EVENTS.EXTENSIONS.STATE,
        this.extensionSession.getStateSnapshot("player", playerScores),
      )
    }

    console.log(
      `Player ${player.username} reconnected to game ${this.inviteCode}`,
    )
  }

  // Disconnect helpers

  setManagerDisconnected() {
    this._manager.connected = false
  }

  removePlayer(socketId: string): Player | undefined {
    const existingPlayer = this.playerManager.findById(socketId)

    if (existingPlayer) {
      const rId = this.roster.clientIndex.get(existingPlayer.clientId)

      if (rId) {
        const entry = this.roster.entries.get(rId)

        if (
          entry &&
          (entry.preRegistered || entry.phoneE164 || entry.source === "phone")
        ) {
          // Keep pre-registered / phone participants in the game as disconnected so they aren't lost in lobby
          this.setPlayerDisconnected(socketId, false)

          return existingPlayer
        }

        this.roster.entries.delete(rId)
        this.roster.clientIndex.delete(existingPlayer.clientId)
      }
    }

    const player = this.playerManager.remove(socketId)

    if (player) {
      this.io.to(this._manager.id).emit(EVENTS.MANAGER.REMOVE_PLAYER, player.id)
      this.playerManager.broadcastCount()
      this.broadcastHostPresence()
    }

    return player
  }

  setPlayerDisconnected(socketId: string, timedOut = false) {
    this.playerManager.setDisconnected(socketId)
    this.playerManager.broadcastCount()
    this.round.endIfEveryoneAnswered()

    const player = this.playerManager.findById(socketId)

    if (player) {
      const rId = this.roster.clientIndex.get(player.clientId)

      if (rId) {
        const entry = this.roster.entries.get(rId)

        if (entry) {
          entry.status = "disconnected"
          entry.timedOut = timedOut
          entry.lastSeenAt = Date.now()
          entry.points = player.points
        }
      }

      this.notifyPlayerUpdated(socketId, player, timedOut)
    }

    this.broadcastHostPresence()
  }

  private notifyPlayerUpdated(
    previousId: string,
    player: Player,
    timedOut = false,
  ) {
    this.io
      .to(this._manager.id)
      .emit(EVENTS.MANAGER.PLAYER_UPDATED, { previousId, player, timedOut })
  }

  // Game flow

  abortCooldown() {
    this.round.noteManualVoteCompletion()
    this.cooldown.abort()
  }

  getVoteCompletionReason() {
    return this.round.getVoteCompletionReason()
  }

  async start(socket: Socket) {
    if (!this.started) {
      const away = this.playerManager.getAll().filter((p) => !p.connected)

      for (const player of away) {
        const rId = this.roster.clientIndex.get(player.clientId)
        const entry = rId ? this.roster.entries.get(rId) : undefined

        // Only remove ad-hoc web lobby leavers; keep pre-registered / phone participants
        if (
          !entry ||
          (!entry.preRegistered && !entry.phoneE164 && entry.source !== "phone")
        ) {
          this.removePlayer(player.id)
        }
      }
    }

    await this.round.start(socket)
    this.broadcastHostPresence()
  }

  selectAnswer(socket: Socket, answerIds: number[]) {
    if (this.showCoordinator?.isSceneActive()) {
      return { accepted: false, reason: "scene_active" as const }
    }

    return this.round.selectAnswer(socket, answerIds)
  }

  advance() {
    if (this.showCoordinator?.isSceneActive()) {
      this.showCoordinator.advanceScene()

      return
    }

    this.round.advance()
  }
}

export default Game
