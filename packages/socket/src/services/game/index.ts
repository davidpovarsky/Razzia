import { createDefaultGameSettings, EVENTS, SESSION_ROLES } from "@razzia/common/constants"
import {
  resolveQuestionPlayMode,
  type GameSettings,
  type Player,
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
  type HostPlayerStatus,
  type HostPresenceSnapshot,
  type RevealDistributionSnapshot,
  type RosterParticipant,
} from "@razzia/extensions/core"
import { shouldShowLeaderboard } from "@razzia/extensions/gameplay"
import {
  ExtensionGameSession,
  readSidecar,
  StudioShowCoordinator,
  type PlayerScoreInfo,
} from "@razzia/extensions/server"
import { isQuestionSupportedOnPstn } from "@razzia/extensions/telephony"
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
  private presenceSeq = 0
  private readonly rosterMap = new Map<
    string,
    {
      rosterPlayerId: string
      clientId: string | null
      displayName: string
      phoneE164: string | null
      phoneRaw?: string
      source: "web" | "phone"
      status: "not_joined" | "connected" | "disconnected"
      timedOut?: boolean
      points: number
      lastSeenAt?: number
      preRegistered: boolean
      activeCallId?: string
    }
  >()
  private readonly phoneIndex = new Map<string, string>()
  private readonly clientRosterIndex = new Map<string, string>()
  private readonly lastVerdictByRosterId = new Map<
    string,
    { epoch: number; correct: boolean; points: number }
  >()

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

    const quizzId = (quizz as { id?: string }).id
    const sidecar = quizzId ? readSidecar(getPath, quizzId) : null

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
            this.broadcastExtensionState()
          },
        },
      })
      this.extensionSession?.setShowCoordinator(this.showCoordinator)
    }

    if (sidecar?.roster) {
      this._settings = {
        ...this._settings,
        phoneInviteOnly: sidecar.roster.phoneInviteOnly,
      }
      for (const item of sidecar.roster.participants) {
        const normalized = item.phoneE164
          ? normalizePhoneE164(item.phoneE164)
          : null
        this.rosterMap.set(item.rosterPlayerId, {
          rosterPlayerId: item.rosterPlayerId,
          clientId: null,
          displayName: item.displayName,
          phoneE164: normalized,
          phoneRaw: item.phoneRaw,
          source: normalized ? "phone" : "web",
          status: "not_joined",
          points: 0,
          preRegistered: true,
        })

        if (normalized) {
          this.phoneIndex.set(normalized, item.rosterPlayerId)
        }
      }
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
      onGameFinished: saveResult,
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
        for (const sp of scoredPlayers) {
          const rId = this.clientRosterIndex.get(sp.clientId)

          if (rId) {
            const entry = this.rosterMap.get(rId)

            if (entry) {
              entry.points = sp.points
            }

            this.lastVerdictByRosterId.set(rId, {
              epoch,
              correct: sp.lastCorrect,
              points: sp.lastPoints,
            })
          }
        }
      },
      onReplayCheckpoint: (qIdx) => {
        this.lastCompletedDistribution = null

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
        ? () => this.showCoordinator?.hasAuthoredOpeningAtStart() ?? false
        : undefined,
      onQuestionCompleted: this.showCoordinator
        ? (qIdx) => {
            this.showCoordinator?.onQuestionCompleted(qIdx)
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
    })

    if (this.extensionSession) {
      this.extensionSession.setDelegate({
        endAnswerTimer: () => this.round.endTimer(),
        nextScreen: () => this.round.nextScreen(),
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
        replayFromCheckpoint: (qIdx) => this.round.replayFromCheckpoint(qIdx),
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
        getLeaderboard: () => {
          const currentLb = this.round.currentLeaderboard
          const source = currentLb.length > 0 ? currentLb : this.players

          return source.map((p) => ({
            displayName: p.username,
            points: p.points,
          }))
        },
        getLastCompletedQuestionSummary: () => {
          const dist =
            this.lastCompletedDistribution ??
            this.round.getRevealDistribution()

          if (
            !dist ||
            dist.questionIndex < 0 ||
            dist.questionIndex >= this.quizz.questions.length
          ) {
            return null
          }

          const q = this.quizz.questions[dist.questionIndex]
          const qId = this.extensionSession?.getQuestionId(dist.questionIndex)
          const qExtras =
            qId &&
            this.extensionSession?.extras &&
            "perQuestion" in this.extensionSession.extras
              ? (this.extensionSession.extras as any).perQuestion?.[qId]
              : undefined
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
            const visual = answerVisuals.find(
              (v: any) => v.answerIndex === idx,
            )
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
        },
        getAnswerRecapSummary: (scene, timelineStepIndex) => {
          if (scene.kind !== "answerRecap") {
            return null
          }

          const extras = this.extensionSession?.extras
          if (!extras || !isQuizExtrasV2(extras)) {
            return null
          }

          const timeline = extras.timeline
          const boundIndex = Math.min(timelineStepIndex, timeline.length)

          const precedingQuestions: Array<{
            questionId: string
            questionIndex: number
            questionNumber: number
          }> = []

          let qOrdinal = 0
          for (let i = 0; i < boundIndex; i += 1) {
            const item = timeline[i]
            if (item?.kind === "question") {
              qOrdinal += 1
              const qIdx = extras.questionIds.indexOf(item.questionId)
              if (qIdx >= 0 && qIdx < this.quizz.questions.length) {
                precedingQuestions.push({
                  questionId: item.questionId,
                  questionIndex: qIdx,
                  questionNumber: qOrdinal,
                })
              }
            }
          }

          let startPos = 0
          if (scene.startQuestionId) {
            const foundPos = precedingQuestions.findIndex(
              (pq) => pq.questionId === scene.startQuestionId,
            )
            if (foundPos >= 0) {
              startPos = foundPos
            }
          }

          const selectedRange = precedingQuestions.slice(startPos)
          const historyAll = (this.round.getHistory() ?? []) as QuestionResult[]

          const items = []
          for (const pq of selectedRange) {
            const q = this.quizz.questions[pq.questionIndex]
            const hist = historyAll[pq.questionIndex]
            const ledger = this.round.getQuestionLedgerEntry(pq.questionIndex)

            if (!q) continue
            // Skip questions that were skipped or not yet completed
            if (hist?.skipped || ledger?.skipped) {
              continue
            }
            if (!hist && !ledger) {
              continue
            }

            const qExtras = extras.perQuestion?.[pq.questionId]
            const answerVisuals = qExtras?.answerVisuals ?? []
            const playMode = resolveQuestionPlayMode(q, this.quizz.gameMode)

            // Tally votes per option index from authoritative ledger or history
            const optionCounts = new Array<number>(q.answers.length).fill(0)
            let totalResponders = 0

            if (ledger && !ledger.skipped) {
              totalResponders = ledger.answers.length
              for (const ans of ledger.answers) {
                for (const aid of ans.answerIds) {
                  if (aid >= 0 && aid < optionCounts.length) {
                    optionCounts[aid] += 1
                  }
                }
              }
            } else if (hist) {
              const answeredPlayers = (hist.playerAnswers ?? []).filter(
                (pa) => Array.isArray(pa.answerIds) && pa.answerIds.length > 0,
              )
              totalResponders =
                typeof hist.playerAnswersCount === "number"
                  ? hist.playerAnswersCount
                  : answeredPlayers.length
              for (const pa of answeredPlayers) {
                for (const aid of pa.answerIds ?? []) {
                  if (aid >= 0 && aid < optionCounts.length) {
                    optionCounts[aid] += 1
                  }
                }
              }
            }

            let maxCount = 0
            for (const c of optionCounts) {
              if (c > maxCount) maxCount = c
            }

            const useCorrectAnswer =
              scene.mode === "correctAnswer" &&
              playMode === "quiz" &&
              Array.isArray(q.solutions) &&
              q.solutions.length > 0

            let winningIdxList: number[] = []
            let badgeType:
              | "mostSelected"
              | "correctAnswer"
              | "tiedMostSelected"
              | "noResponses" = "mostSelected"
            let isTie = false

            if (useCorrectAnswer) {
              winningIdxList = (q.solutions ?? []).filter(
                (idx) => idx >= 0 && idx < q.answers.length,
              )
              badgeType = "correctAnswer"
              isTie = winningIdxList.length > 1
            } else if (totalResponders === 0 || maxCount === 0) {
              winningIdxList = []
              badgeType = "noResponses"
              isTie = false
            } else {
              for (let idx = 0; idx < optionCounts.length; idx += 1) {
                if (optionCounts[idx] === maxCount) {
                  winningIdxList.push(idx)
                }
              }
              isTie = winningIdxList.length > 1
              badgeType = isTie ? "tiedMostSelected" : "mostSelected"
            }

            const winningOptions = winningIdxList.map((idx) => {
              const count = optionCounts[idx] ?? 0
              const percentage =
                totalResponders > 0
                  ? Math.round((count / totalResponders) * 100)
                  : 0
              const visual = answerVisuals.find(
                (v: any) => v.answerIndex === idx,
              )
              return {
                answerIndex: idx,
                label: q.answers[idx] ?? `Option ${idx + 1}`,
                count,
                percentage,
                imageUrl: visual?.url,
                alt: visual?.alt,
              }
            })

            items.push({
              questionId: pq.questionId,
              questionNumber: pq.questionNumber,
              questionText: q.question,
              questionImageUrl: q.image,
              playMode,
              badgeType,
              totalResponders,
              isTie,
              winningOptions,
            })
          }

          return {
            title: scene.title,
            subtitle: scene.subtitle,
            startQuestionId:
              scene.startQuestionId ??
              selectedRange[0]?.questionId ??
              null,
            endQuestionId:
              selectedRange[selectedRange.length - 1]?.questionId ?? null,
            mode: scene.mode ?? "mostSelected",
            maxItemsPerPage: scene.maxItemsPerPage ?? 4,
            showCounts: scene.showCounts ?? true,
            showPercentages: scene.showPercentages ?? true,
            items,
          }
        },
      })
    }

    console.log(
      `New game created: ${this.inviteCode} subject: ${quizz.subject}`,
    )
  }

  get manager() {
    return this._manager
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

  updateSettings(settings: Partial<GameSettings>): boolean {
    if (this.started) {
      return false
    }

    this._settings = { ...this._settings, ...settings }
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

  findRosterByPhone(rawOrE164: string): {
    rosterPlayerId: string
    displayName: string
    phoneE164: string
    clientId: string | null
    status: "not_joined" | "connected" | "disconnected"
    points: number
  } | null {
    const normalized = normalizePhoneE164(rawOrE164)

    if (!normalized) {
      return null
    }

    const rId = this.phoneIndex.get(normalized)

    if (!rId) {
      return null
    }

    const entry = this.rosterMap.get(rId)

    if (!entry?.phoneE164) {
      return null
    }

    return {
      rosterPlayerId: entry.rosterPlayerId,
      displayName: entry.displayName,
      phoneE164: entry.phoneE164,
      clientId: entry.clientId,
      status: entry.status,
      points: entry.points,
    }
  }

  getRosterEntry(rosterPlayerId: string) {
    return this.rosterMap.get(rosterPlayerId) ?? null
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
      const entry = rosterPlayerId ? this.rosterMap.get(rosterPlayerId) : null
      const player = entry?.clientId
        ? this.playerManager.findByClientId(entry.clientId)
        : undefined
      const verdict = rosterPlayerId
        ? this.lastVerdictByRosterId.get(rosterPlayerId) ?? null
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
    const entry = rosterPlayerId ? this.rosterMap.get(rosterPlayerId) : null
    const player = entry?.clientId
      ? this.playerManager.findByClientId(entry.clientId)
      : undefined
    const answered = player ? this.round.hasPlayerAnswered(player.id) : false
    const verdict = rosterPlayerId
      ? this.lastVerdictByRosterId.get(rosterPlayerId) ?? null
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
    const epoch = pstn.epoch

    if (this.showCoordinator?.isSceneActive()) {
      return {
        accepted: false,
        epoch,
        reason: "scene_active",
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

    const entry = this.rosterMap.get(rosterPlayerId)

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
        ;(this.io.to(player.id) as unknown as { emit: (_e: string, _p: unknown) => void }).emit(
          ev,
          payload,
        )
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
    const verdict = this.lastVerdictByRosterId.get(rosterPlayerId)

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
  upsertRosterParticipant(input: {
    rosterPlayerId?: string
    displayName: string
    phone?: string | null
  }): RosterParticipant {
    const trimmedName = input.displayName.trim()

    if (!trimmedName || trimmedName.length > 40) {
      throw new Error("errors:auth.usernameTooShort")
    }

    let phoneE164: string | null = null

    if (input.phone?.trim()) {
      phoneE164 = normalizePhoneE164(input.phone)

      if (!phoneE164) {
        throw new Error("errors:invalidRequest")
      }
    }

    // Check duplicate phone across other entries
    if (phoneE164) {
      const existingOwner = this.phoneIndex.get(phoneE164)

      if (existingOwner && existingOwner !== input.rosterPlayerId) {
        throw new Error("errors:game.playerAlreadyConnected")
      }
    }

    const rId = input.rosterPlayerId ?? generateRosterPlayerId()
    const existing = this.rosterMap.get(rId)

    if (existing) {
      if (existing.phoneE164 && existing.phoneE164 !== phoneE164) {
        this.phoneIndex.delete(existing.phoneE164)
      }

      existing.displayName = trimmedName
      existing.phoneE164 = phoneE164
      existing.phoneRaw = input.phone ?? undefined

      if (phoneE164) {
        this.phoneIndex.set(phoneE164, rId)
      }

      // Also update live Player username if already joined
      if (existing.clientId) {
        const livePlayer = this.playerManager.findByClientId(existing.clientId)

        if (livePlayer) {
          livePlayer.username = trimmedName
          this.notifyPlayerUpdated(livePlayer.id, livePlayer, false)
        }
      }
    } else {
      this.rosterMap.set(rId, {
        rosterPlayerId: rId,
        clientId: null,
        displayName: trimmedName,
        phoneE164,
        phoneRaw: input.phone ?? undefined,
        source: phoneE164 ? "phone" : "web",
        status: "not_joined",
        points: 0,
        preRegistered: true,
      })

      if (phoneE164) {
        this.phoneIndex.set(phoneE164, rId)
      }
    }

    this.broadcastHostPresence()

    return {
      rosterPlayerId: rId,
      displayName: trimmedName,
      phoneE164,
      phoneRaw: input.phone ?? undefined,
    }
  }

  removeRosterParticipant(rosterPlayerId: string): boolean {
    const existing = this.rosterMap.get(rosterPlayerId)

    if (!existing) {
      return false
    }

    if (existing.phoneE164) {
      this.phoneIndex.delete(existing.phoneE164)
    }

    if (existing.clientId) {
      this.clientRosterIndex.delete(existing.clientId)
      const livePlayer = this.playerManager.findByClientId(existing.clientId)

      if (livePlayer) {
        this.kickPlayer(livePlayer.id)
      }
    }

    this.rosterMap.delete(rosterPlayerId)
    this.broadcastHostPresence()

    return true
  }

  replaceRosterParticipants(
    participants: RosterParticipant[],
    phoneInviteOnly?: boolean,
  ): void {
    if (phoneInviteOnly !== undefined) {
      this._settings = { ...this._settings, phoneInviteOnly }
    }

    // Keep currently connected/disconnected ad-hoc players, update/add imported pre-registered ones
    for (const item of participants) {
      const normalized = item.phoneE164
        ? normalizePhoneE164(item.phoneE164)
        : null
      const existingByPhone = normalized
        ? this.phoneIndex.get(normalized)
        : undefined
      const targetId = existingByPhone ?? item.rosterPlayerId
      const current = this.rosterMap.get(targetId)

      if (current) {
        if (current.phoneE164 && current.phoneE164 !== normalized) {
          this.phoneIndex.delete(current.phoneE164)
        }

        current.displayName = item.displayName
        current.phoneE164 = normalized
        current.phoneRaw = item.phoneRaw
        current.preRegistered = true

        if (normalized) {
          this.phoneIndex.set(normalized, targetId)
        }

        if (current.clientId) {
          const livePlayer = this.playerManager.findByClientId(current.clientId)

          if (livePlayer) {
            livePlayer.username = item.displayName
          }
        }
      } else {
        this.rosterMap.set(targetId, {
          rosterPlayerId: targetId,
          clientId: null,
          displayName: item.displayName,
          phoneE164: normalized,
          phoneRaw: item.phoneRaw,
          source: normalized ? "phone" : "web",
          status: "not_joined",
          points: 0,
          preRegistered: true,
        })

        if (normalized) {
          this.phoneIndex.set(normalized, targetId)
        }
      }
    }

    this.broadcastHostPresence()
  }

  private clearQuestionVerdicts(_qIdx?: number): void {
    this.lastVerdictByRosterId.clear()
  }

  private syncRosterScoresFromPlayers(): void {
    for (const player of this.playerManager.getAll()) {
      const rId = this.clientRosterIndex.get(player.clientId)

      if (rId) {
        const entry = this.rosterMap.get(rId)

        if (entry) {
          entry.points = player.points
          entry.status = player.connected ? "connected" : "disconnected"
        }
      }
    }
  }

  getHostPresenceSnapshot(): HostPresenceSnapshot {
    this.syncRosterScoresFromPlayers()
    const answeredIds = this.round.getAnsweredPlayerIds()
    const playersList: HostPlayerStatus[] = []

    // Ensure any player in playerManager that wasn't indexed yet is indexed
    for (const p of this.playerManager.getAll()) {
      let rId = this.clientRosterIndex.get(p.clientId)

      if (!rId) {
        rId = generateRosterPlayerId()
        this.clientRosterIndex.set(p.clientId, rId)
        this.rosterMap.set(rId, {
          rosterPlayerId: rId,
          clientId: p.clientId,
          displayName: p.username,
          phoneE164: null,
          source: "web",
          status: p.connected ? "connected" : "disconnected",
          points: p.points,
          lastSeenAt: Date.now(),
          preRegistered: false,
        })
      }
    }

    let connectedNow = 0
    let disconnectedNow = 0
    let notJoinedNow = 0

    for (const entry of this.rosterMap.values()) {
      const livePlayer = entry.clientId
        ? this.playerManager.findByClientId(entry.clientId)
        : undefined
      let status: "not_joined" | "connected" | "disconnected" = entry.status

      if (livePlayer) {
        status = livePlayer.connected ? "connected" : "disconnected"
      }

      const points = livePlayer ? livePlayer.points : entry.points
      const answeredCurrentQuestion = livePlayer
        ? answeredIds.has(livePlayer.id)
        : false

      if (status === "connected") {
        connectedNow += 1
      } else if (status === "disconnected") {
        disconnectedNow += 1
      } else {
        notJoinedNow += 1
      }

      playersList.push({
        rosterPlayerId: entry.rosterPlayerId,
        clientId: entry.clientId,
        displayName: livePlayer ? livePlayer.username : entry.displayName,
        phoneE164: entry.phoneE164,
        source: entry.source,
        status,
        timedOut: entry.timedOut,
        points,
        answeredCurrentQuestion,
        lastSeenAt: entry.lastSeenAt,
      })
    }

    return {
      v: 1,
      gameId: this.gameId,
      seq: this.presenceSeq,
      phoneInviteOnly: Boolean(this._settings.phoneInviteOnly),
      registeredTotal: playersList.length,
      connectedNow,
      disconnectedNow,
      notJoinedNow,
      players: playersList,
    }
  }

  broadcastHostPresence(): void {
    this.presenceSeq += 1

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
            name: STATUS.WAIT,
            data: { text: "game:waitingForPlayers" },
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
      socket.emit(
        EVENTS.GAME.STATUS,
        sanitized,
      )
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
    this.io.to(this.gameId).emit(EVENTS.GAME.STATUS, publicStatus)

    if (this.extensionSession) {
      this.syncExtensionStatus(status)
    }
  }

  private syncExtensionStatus(status: Status) {
    if (!this.extensionSession) {
      return
    }

    if (status === STATUS.SHOW_QUESTION) {
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
      ? this.rosterMap.get(claimsExtra.rosterPlayerId)
      : undefined

    if (!rosterEntry && normalizedPhone) {
      const matchedId = this.phoneIndex.get(normalizedPhone)

      if (matchedId) {
        rosterEntry = this.rosterMap.get(matchedId)
      }
    }

    // 2. Enforce phoneInviteOnly for unknown phone callers
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
          this.clientRosterIndex.delete(oldClientId)
          this.playerManager.updateClientId(oldSocketId, clientId)
          this.round.updateCheckpointClientId(oldClientId, clientId)
          this.extensionSession?.rebindPlayerClientId(oldClientId, clientId)
        }

        this.playerManager.updateSocketId(oldSocketId, socket.id)
        this.round.updatePlayerId(oldSocketId, socket.id)
        existingPlayer.connected = true
        existingPlayer.username = rosterEntry.displayName || existingPlayer.username

        rosterEntry.clientId = clientId
        rosterEntry.status = "connected"
        rosterEntry.timedOut = false
        rosterEntry.lastSeenAt = Date.now()

        if (claimsExtra?.source) {
          rosterEntry.source = claimsExtra.source
        } else if (normalizedPhone) {
          rosterEntry.source = "phone"
        }

        this.clientRosterIndex.set(clientId, rosterEntry.rosterPlayerId)

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
        this.phoneIndex.set(normalizedPhone, rosterEntry.rosterPlayerId)
      }

      rosterEntry.source =
        claimsExtra?.source ?? (rosterEntry.phoneE164 ? "phone" : "web")
      rosterEntry.status = "connected"
      rosterEntry.timedOut = false
      rosterEntry.lastSeenAt = now
      this.clientRosterIndex.set(clientId, rosterEntry.rosterPlayerId)
    } else {
      const rId = claimsExtra?.rosterPlayerId ?? generateRosterPlayerId()
      const source =
        claimsExtra?.source ?? (normalizedPhone ? "phone" : "web")
      this.rosterMap.set(rId, {
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
      this.clientRosterIndex.set(clientId, rId)

      if (normalizedPhone) {
        this.phoneIndex.set(normalizedPhone, rId)
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

    let rosterEntry = normalizedPhone
      ? (() => {
          const rId = this.phoneIndex.get(normalizedPhone)

          return rId ? this.rosterMap.get(rId) : undefined
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
      this.rosterMap.set(rId, rosterEntry)

      if (normalizedPhone) {
        this.phoneIndex.set(normalizedPhone, rId)
      }
    }

    this.clientRosterIndex.set(clientId, rId)

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
    const entry = this.rosterMap.get(rosterPlayerId)

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
        const rId = this.clientRosterIndex.get(player.clientId)

        if (rId) {
          const entry = this.rosterMap.get(rId)

          if (entry) {
            if (entry.preRegistered || entry.phoneE164) {
              entry.status = "not_joined"
              entry.clientId = null
            } else {
              this.rosterMap.delete(rId)
            }
          }

          this.clientRosterIndex.delete(player.clientId)
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

    const rId = this.clientRosterIndex.get(clientId)

    if (rId) {
      const entry = this.rosterMap.get(rId)

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
      const rId = this.clientRosterIndex.get(existingPlayer.clientId)

      if (rId) {
        const entry = this.rosterMap.get(rId)

        if (entry && (entry.preRegistered || entry.phoneE164 || entry.source === "phone")) {
          // Keep pre-registered / phone participants in the game as disconnected so they aren't lost in lobby
          this.setPlayerDisconnected(socketId, false)

          return existingPlayer
        }

        this.rosterMap.delete(rId)
        this.clientRosterIndex.delete(existingPlayer.clientId)
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
      const rId = this.clientRosterIndex.get(player.clientId)

      if (rId) {
        const entry = this.rosterMap.get(rId)

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
    this.cooldown.abort()
  }

  async start(socket: Socket) {
    if (!this.started) {
      const away = this.playerManager.getAll().filter((p) => !p.connected)

      for (const player of away) {
        const rId = this.clientRosterIndex.get(player.clientId)
        const entry = rId ? this.rosterMap.get(rId) : undefined

        // Only remove ad-hoc web lobby leavers; keep pre-registered / phone participants
        if (!entry || (!entry.preRegistered && !entry.phoneE164 && entry.source !== "phone")) {
          this.removePlayer(player.id)
        }
      }
    }

    await this.round.start(socket)
    this.broadcastHostPresence()
  }

  selectAnswer(socket: Socket, answerIds: number[]) {
    if (this.showCoordinator?.isSceneActive()) {
      return
    }

    this.round.selectAnswer(socket, answerIds)
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
