// oxlint-disable typescript/no-unnecessary-condition
import {
  EVENTS,
  MAX_POINTS,
  MEDIA_TYPES,
  NO_TIME_LIMIT,
  QUIZZ_MODES,
} from "@razzia/common/constants"
import { isEstimationOptions } from "@razzia/common/questions/options"
import {
  resolveQuestionPlayMode,
  type Answer,
  type GameResult,
  type GameSettings,
  type GameUpdateQuestion,
  type Player,
  type Question,
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
import type { RevealDistributionSnapshot } from "@razzia/extensions/core"
import { createRevealDistribution } from "@razzia/extensions/server"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { QUESTION_SCORING } from "@razzia/socket/services/scoring"
import {
  countAnswers,
  recomputeScoresFromLedger,
  type LedgerQuestionEntry,
  type ScoredPlayer,
} from "@razzia/socket/services/scoring/round"
import { orderToPoint, timeToPoint } from "@razzia/socket/utils/game"
import { SECOND_MS } from "@razzia/socket/utils/sleep"
import { nanoid } from "nanoid"

type BroadcastFn = <T extends Status>(
  _status: T,
  _data: StatusDataMap[T],
) => void
type SendFn = <T extends Status>(
  _target: string,
  _status: T,
  _data: StatusDataMap[T],
) => void

export interface QuestionCheckpoint {
  questionIndex: number
  players: Player[]
  leaderboard: Player[]
  tempOldLeaderboard: Player[] | null
  questionsHistory: QuestionResult[]
  questionLedger?: Map<number, LedgerQuestionEntry>
}

export interface RoundManagerOptions {
  quizz: Quizz
  players: PlayerManager
  cooldown: CooldownTimer
  io: Server
  gameId: string
  getManagerId: () => string
  broadcast: BroadcastFn
  send: SendFn
  onNewQuestion: () => void
  onGameFinished: (_result: GameResult) => void
  getSettings: () => GameSettings
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

interface RoundStep {
  name: string
  gameModes: QuizzMode[]
  skip?: () => boolean
  enter: () => void
  delay: (_settings: GameSettings) => number
}

interface PendingDelay {
  timer: NodeJS.Timeout | null
  deadline: number
  remainingMs: number
  generation: number
  resolve: (_completed: boolean) => void
}

export interface GamePauseSnapshot {
  paused: boolean
  remainingMs: number | null
  deadline: number | null
}

export interface AnswerSubmissionResult {
  accepted: boolean
  reason?:
    | "player_not_found"
    | "not_accepting_answers"
    | "game_paused"
    | "duplicate_answer"
    | "invalid_answer"
}

export class RoundManager {
  private readonly opts: RoundManagerOptions
  private readonly steps: RoundStep[]
  private started = false
  private currentQuestion = 0
  private currentStep = -1
  private playersAnswers: Answer[] = []
  private startTime = 0
  private votingStartsAt: number | null = null
  private votingEndsAt: number | null = null
  private acceptingAnswers = false
  private voteCompletion: "elapsed" | "manual" | "allAnswered" | null = null
  private leaderboard: Player[] = []
  private tempOldLeaderboard: Player[] | null = null
  private questionsHistory: QuestionResult[] = []
  private autoAdvanceTimer: NodeJS.Timeout | null = null
  private autoAdvanceDeadline: number | null = null
  private autoAdvanceRemainingMs: number | null = null
  private autoAdvanceTotalSeconds: number | null = null
  private interludeTimer: NodeJS.Timeout | null = null
  private interludeDeadline: number | null = null
  private interludeRemainingMs: number | null = null
  private paused = false
  private pausedAt: number | null = null
  private generation = 0
  private readonly pendingDelays = new Set<PendingDelay>()
  private readonly checkpoints = new Map<number, QuestionCheckpoint>()
  private readonly questionLedger = new Map<number, LedgerQuestionEntry>()
  private latestRevealDistribution: RevealDistributionSnapshot | null = null

  constructor(opts: RoundManagerOptions) {
    this.opts = opts

    const steps: RoundStep[] = [
      {
        name: "reveal",
        gameModes: [QUIZZ_MODES.QUIZ, QUIZZ_MODES.SURVEY],
        enter: () => {
          this.showResults()
        },
        delay: (settings) => {
          if (this.opts.hasAuthoredResultsScene?.(this.currentQuestion)) {
            return 0
          }

          return (
            this.opts.quickResultsHoldSeconds?.() ??
            settings.autoAdvance.responsesDelay
          )
        },
      },
      {
        name: "leaderboard",
        gameModes: [QUIZZ_MODES.QUIZ],
        skip: () => {
          if (this.isSurvey()) {
            return true
          }

          if (this.opts.shouldShowLeaderboard) {
            const currentCat = this.question.category?.trim()
            const nextCat =
              this.opts.quizz.questions[
                this.currentQuestion + 1
              ]?.category?.trim()

            const show = this.opts.shouldShowLeaderboard({
              currentQuestionIndex: this.currentQuestion,
              currentCategory: currentCat,
              nextCategory: nextCat,
              totalQuestions: this.opts.quizz.questions.length,
            })

            return !show
          }

          return this.isLastQuestion() || this.isSameCategoryNext()
        },
        enter: () => {
          this.showLeaderboard()
        },
        delay: (settings) => settings.autoAdvance.leaderboardDelay,
      },
      {
        name: "interlude",
        gameModes: [QUIZZ_MODES.QUIZ, QUIZZ_MODES.SURVEY],
        skip: () => {
          if (this.isLastQuestion()) {
            return true
          }

          if (this.opts.hasInterlude) {
            return !this.opts.hasInterlude(this.currentQuestion)
          }

          return true
        },
        enter: () => {
          this.showInterlude()
        },
        delay: () => 0,
      },
    ]

    this.steps = steps
  }

  getAnsweredPlayerIds(): Set<string> {
    return new Set(this.playersAnswers.map((a) => a.playerId))
  }

  hasPlayerAnswered(playerId: string): boolean {
    return this.playersAnswers.some((a) => a.playerId === playerId)
  }

  getPlayerSubmittedAnswer(playerId: string): number[] | null {
    return (
      this.playersAnswers.find((a) => a.playerId === playerId)?.answerIds ??
      null
    )
  }

  isStarted(): boolean {
    return this.started
  }

  get currentQuestionIndex(): number {
    return this.currentQuestion
  }

  get isCurrentlyAcceptingAnswers(): boolean {
    return this.acceptingAnswers && !this.paused
  }

  get isPaused(): boolean {
    return this.paused
  }

  getPauseSnapshot(): GamePauseSnapshot {
    const candidates = [
      this.opts.cooldown.remainingMs,
      ...Array.from(this.pendingDelays, (delay) =>
        delay.timer
          ? Math.max(0, delay.deadline - Date.now())
          : delay.remainingMs,
      ),
      this.autoAdvanceTimer
        ? Math.max(0, (this.autoAdvanceDeadline ?? Date.now()) - Date.now())
        : this.autoAdvanceRemainingMs,
      this.interludeTimer
        ? Math.max(0, (this.interludeDeadline ?? Date.now()) - Date.now())
        : this.interludeRemainingMs,
    ].filter((value): value is number => value !== null)
    const remainingMs = candidates.length > 0 ? Math.min(...candidates) : null

    return {
      paused: this.paused,
      remainingMs,
      deadline:
        !this.paused && remainingMs !== null ? Date.now() + remainingMs : null,
    }
  }

  getRemainingSeconds(): number {
    if (!this.acceptingAnswers || this.question.time === NO_TIME_LIMIT) {
      return 0
    }

    const timerRemaining = this.opts.cooldown.remaining

    if (timerRemaining !== null) {
      return timerRemaining
    }

    const elapsed = (Date.now() - this.startTime) / 1000

    return Math.max(0, Math.ceil(this.question.time - elapsed))
  }

  get currentLeaderboard(): readonly Player[] {
    return this.leaderboard
  }

  get currentStepName(): string | null {
    if (this.currentStep < 0 || this.currentStep >= this.steps.length) {
      return null
    }

    return this.steps[this.currentStep].name
  }

  private get question(): Question {
    return this.opts.quizz.questions[this.currentQuestion]
  }

  private isAskingQuestion(): boolean {
    return this.currentStep < 0
  }

  private isLastQuestion(): boolean {
    return !this.opts.quizz.questions[this.currentQuestion + 1]
  }

  private isSameCategoryNext(): boolean {
    const category = this.question.category?.trim()
    const next = this.opts.quizz.questions[this.currentQuestion + 1]

    return Boolean(category) && next?.category?.trim() === category
  }

  get currentEpoch(): number {
    return this.generation
  }

  isSurvey(): boolean {
    const q = this.question

    return resolveQuestionPlayMode(q, this.opts.quizz.gameMode) === "survey"
  }

  private getInterludeStepIndex(): number {
    return this.steps.findIndex((s) => s.name === "interlude")
  }

  // ── Generation & Async Cancellation ─────────────────────────────────────

  private armDelay(delay: PendingDelay): void {
    if (this.paused || delay.remainingMs <= 0) {
      if (!this.paused) {
        this.pendingDelays.delete(delay)
        delay.resolve(this.generation === delay.generation && this.started)
      }

      return
    }

    delay.deadline = Date.now() + delay.remainingMs
    delay.timer = setTimeout(() => {
      delay.timer = null
      delay.remainingMs = 0
      this.pendingDelays.delete(delay)
      delay.resolve(this.generation === delay.generation && this.started)
    }, delay.remainingMs)
  }

  private cancellableSleep(sec: number, gen: number): Promise<boolean> {
    if (sec <= 0) {
      return Promise.resolve(this.generation === gen && this.started)
    }

    return new Promise((resolve) => {
      const delay: PendingDelay = {
        timer: null,
        deadline: Date.now() + sec * SECOND_MS,
        remainingMs: sec * SECOND_MS,
        generation: gen,
        resolve,
      }
      this.pendingDelays.add(delay)
      this.armDelay(delay)
    })
  }

  private cancelPendingAsync(): void {
    for (const delay of this.pendingDelays) {
      if (delay.timer) {
        clearTimeout(delay.timer)
      }
      delay.resolve(false)
    }

    this.pendingDelays.clear()
  }

  // ── Auto advance ─────────────────────────────────────────────────────────

  clearAutoAdvance(): void {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer)
      this.autoAdvanceTimer = null
    }

    const hadTimer =
      this.autoAdvanceDeadline !== null || this.autoAdvanceRemainingMs !== null
    this.autoAdvanceDeadline = null
    this.autoAdvanceRemainingMs = null
    this.autoAdvanceTotalSeconds = null

    if (hadTimer) {
      this.emitAutoAdvance(null)
    }
  }

  private clearInterludeTimer(): void {
    if (this.interludeTimer) {
      clearTimeout(this.interludeTimer)
      this.interludeTimer = null
    }

    this.interludeDeadline = null
    this.interludeRemainingMs = null
  }

  private emitAutoAdvance(state: { seconds: number; total: number } | null) {
    this.opts.io
      .to(this.opts.getManagerId())
      .emit(EVENTS.MANAGER.AUTO_ADVANCE, state)
  }

  private armAutoAdvance(): void {
    if (
      this.paused ||
      this.autoAdvanceRemainingMs === null ||
      this.autoAdvanceTotalSeconds === null
    ) {
      return
    }

    this.autoAdvanceDeadline = Date.now() + this.autoAdvanceRemainingMs
    const tick = () => {
      this.autoAdvanceTimer = null

      if (this.paused || this.autoAdvanceDeadline === null) {
        return
      }
      this.autoAdvanceRemainingMs = Math.max(
        0,
        this.autoAdvanceDeadline - Date.now(),
      )
      const seconds = Math.ceil(this.autoAdvanceRemainingMs / SECOND_MS)

      if (seconds > 0) {
        this.emitAutoAdvance({
          seconds,
          total: this.autoAdvanceTotalSeconds ?? seconds,
        })
        const delay = Math.max(
          1,
          Math.min(SECOND_MS, this.autoAdvanceRemainingMs),
        )
        this.autoAdvanceTimer = setTimeout(tick, delay)

        return
      }

      this.clearAutoAdvance()
      this.advance()
    }
    this.autoAdvanceTimer = setTimeout(
      tick,
      Math.max(1, Math.min(SECOND_MS, this.autoAdvanceRemainingMs)),
    )
  }

  private scheduleAutoAdvance(delay: number, force = false): void {
    this.clearAutoAdvance()

    if (!force && !this.opts.getSettings().autoAdvance.enable) {
      return
    }

    this.autoAdvanceRemainingMs = delay * SECOND_MS
    this.autoAdvanceTotalSeconds = delay
    this.emitAutoAdvance({ seconds: delay, total: delay })
    this.armAutoAdvance()
  }

  // ── Checkpoint management ────────────────────────────────────────────────

  private captureCheckpoint(index: number): void {
    const playersSnapshot = this.opts.players.getAll().map((p) => ({ ...p }))
    const leaderboardSnapshot = this.leaderboard.map((p) => ({ ...p }))
    const tempOldLeaderboardSnapshot = this.tempOldLeaderboard
      ? this.tempOldLeaderboard.map((p) => ({ ...p }))
      : null

    this.checkpoints.set(index, {
      questionIndex: index,
      players: playersSnapshot,
      leaderboard: leaderboardSnapshot,
      tempOldLeaderboard: tempOldLeaderboardSnapshot,
      questionsHistory: structuredClone(this.questionsHistory),
      questionLedger: new Map(this.questionLedger),
    })
  }

  getCheckpoints(): number[] {
    return Array.from(this.checkpoints.keys()).sort((a, b) => a - b)
  }

  replayFromCheckpoint(targetIndex: number): boolean {
    if (!this.started) {
      return false
    }

    if (targetIndex < 0 || targetIndex > this.currentQuestion) {
      return false
    }

    const cp = this.checkpoints.get(targetIndex)

    if (!cp) {
      return false
    }

    // Invalidate stale async operations
    this.generation += 1
    this.cancelPendingAsync()
    this.clearAutoAdvance()
    this.clearInterludeTimer()
    this.opts.cooldown.abort()
    this.acceptingAnswers = false

    // Restore players while preserving current socket IDs and connected state
    const currentPlayers = this.opts.players.getAll()
    const restoredPlayers = cp.players.map((saved) => {
      const live = currentPlayers.find((p) => p.clientId === saved.clientId)

      return {
        ...saved,
        id: live ? live.id : saved.id,
        connected: live ? live.connected : saved.connected,
      }
    })

    this.opts.players.replace(restoredPlayers)
    this.leaderboard = cp.leaderboard.map((p) => ({ ...p }))
    this.tempOldLeaderboard = cp.tempOldLeaderboard
      ? cp.tempOldLeaderboard.map((p) => ({ ...p }))
      : null
    this.questionsHistory = structuredClone(cp.questionsHistory)

    if (cp.questionLedger) {
      this.questionLedger.clear()
      for (const [k, v] of cp.questionLedger.entries()) {
        this.questionLedger.set(k, { ...v, answers: [...v.answers] })
      }
    }

    this.playersAnswers = []
    this.latestRevealDistribution = null

    // Prune later checkpoints
    for (const k of Array.from(this.checkpoints.keys())) {
      if (k > targetIndex) {
        this.checkpoints.delete(k)
      }
    }

    this.currentQuestion = targetIndex
    this.opts.onReplayCheckpoint?.(targetIndex)

    // Progress afresh into restored question
    void this.newQuestion()

    return true
  }

  getHistory(questionIndex?: number): QuestionResult[] | QuestionResult | null {
    if (questionIndex !== undefined) {
      return this.questionsHistory[questionIndex] ?? null
    }

    return this.questionsHistory
  }

  getQuestionLedgerEntry(
    questionIndex: number,
  ): LedgerQuestionEntry | undefined {
    return this.questionLedger.get(questionIndex)
  }

  getRevealDistribution(): RevealDistributionSnapshot | null {
    return this.latestRevealDistribution
  }

  // ── Authoritative Controls ──────────────────────────────────────────────

  pauseGame(): boolean {
    if (!this.started || this.paused) {
      return false
    }

    this.paused = true
    this.pausedAt = Date.now()
    this.opts.cooldown.pause()

    for (const delay of this.pendingDelays) {
      if (!delay.timer) {
        continue
      }
      clearTimeout(delay.timer)
      delay.timer = null
      delay.remainingMs = Math.max(0, delay.deadline - Date.now())
    }

    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer)
      this.autoAdvanceTimer = null
      this.autoAdvanceRemainingMs = Math.max(
        0,
        (this.autoAdvanceDeadline ?? Date.now()) - Date.now(),
      )
      this.autoAdvanceDeadline = null
    }

    if (this.interludeTimer) {
      clearTimeout(this.interludeTimer)
      this.interludeTimer = null
      this.interludeRemainingMs = Math.max(
        0,
        (this.interludeDeadline ?? Date.now()) - Date.now(),
      )
      this.interludeDeadline = null
    }

    return true
  }

  resumeGame(): boolean {
    if (!this.started || !this.paused) {
      return false
    }

    const pausedFor = this.pausedAt === null ? 0 : Date.now() - this.pausedAt
    this.paused = false
    this.pausedAt = null

    if (this.acceptingAnswers) {
      this.startTime += pausedFor
    }
    this.opts.cooldown.resume()

    for (const delay of this.pendingDelays) {
      this.armDelay(delay)
    }
    this.armAutoAdvance()
    this.armInterludeTimer()

    if (this.votingStartsAt !== null && this.currentStep < 0) {
      this.votingStartsAt += pausedFor
      if (this.votingEndsAt !== null) this.votingEndsAt += pausedFor
      this.broadcastVotingQuestion()
    }

    this.endIfEveryoneAnswered()
    return true
  }

  endTimer(): boolean {
    if (!this.started || !this.acceptingAnswers || this.paused) {
      return false
    }

    this.voteCompletion = "manual"
    this.acceptingAnswers = false
    this.opts.cooldown.abort()

    return true
  }

  getVoteCompletionReason() {
    return this.voteCompletion
  }

  noteManualVoteCompletion(): void {
    if (this.acceptingAnswers) {
      this.voteCompletion = "manual"
    }
  }

  nextScreen(): boolean {
    if (!this.started) {
      return false
    }

    // Do NOT silently skip scoring while accepting answers
    if (this.isAskingQuestion()) {
      return false
    }

    this.clearAutoAdvance()
    this.clearInterludeTimer()
    this.runStep(this.currentStep + 1)

    return true
  }

  skipScreen(): boolean {
    return this.nextScreen()
  }

  canPrevious(): {
    can: boolean
    reason?: string
    willReopenQuestion?: boolean
    answersReceived?: number
  } {
    if (!this.started) {
      return { can: false, reason: "Game not started" }
    }

    if (this.acceptingAnswers) {
      const answersReceived = this.playersAnswers.length

      if (this.opts.canPreviousTimelineStep) {
        const timelineCheck = this.opts.canPreviousTimelineStep()

        if (timelineCheck.can) {
          return {
            can: true,
            willReopenQuestion: timelineCheck.willReopenQuestion ?? true,
            answersReceived,
          }
        }
      }

      if (this.currentQuestion > 0) {
        return { can: true, willReopenQuestion: true, answersReceived }
      }

      return { can: false, reason: "At start of show" }
    }

    if (this.currentStep < 0) {
      if (this.opts.canPreviousTimelineStep)
        return this.opts.canPreviousTimelineStep()
      return { can: false, reason: "Question starting" }
    }

    // Step 0: reveal/results. Moving back reopens this question!
    if (this.currentStep === 0) {
      return { can: true, willReopenQuestion: true, answersReceived: 0 }
    }

    // Step 1: leaderboard, Step 2: interlude. Navigates back within question
    if (this.currentStep > 0) {
      return { can: true, willReopenQuestion: false, answersReceived: 0 }
    }

    if (this.opts.canPreviousTimelineStep) {
      return this.opts.canPreviousTimelineStep()
    }

    if (this.currentQuestion > 0) {
      return { can: true, willReopenQuestion: true, answersReceived: 0 }
    }

    return { can: false, reason: "At start of show" }
  }

  cancelActiveVote(): boolean {
    if (!this.started) {
      return false
    }

    this.generation += 1
    this.cancelPendingAsync()
    this.clearAutoAdvance()
    this.clearInterludeTimer()
    this.acceptingAnswers = false
    this.opts.cooldown.abort()
    this.playersAnswers = []
    this.latestRevealDistribution = null

    return true
  }

  getAnswerCount(): number {
    return this.playersAnswers.length
  }

  reopenQuestion(targetIndex: number): boolean {
    if (!this.started) {
      this.started = true
    }

    if (targetIndex < 0 || targetIndex >= this.opts.quizz.questions.length) {
      return false
    }

    this.generation += 1
    this.cancelPendingAsync()
    this.clearAutoAdvance()
    this.clearInterludeTimer()
    this.acceptingAnswers = false
    this.opts.cooldown.abort()
    this.playersAnswers = []
    this.latestRevealDistribution = null

    // Invalidate old attempt in ledger and questionsHistory
    this.questionLedger.delete(targetIndex)
    delete (
      this.questionsHistory as Record<number, QuestionResult | undefined>
    )[targetIndex]

    // Recompute player scores and streaks from remaining active ledger
    const recomputed = recomputeScoresFromLedger(
      this.opts.players.getAll(),
      Array.from(this.questionLedger.values()),
    )
    this.opts.players.replace(recomputed)
    this.leaderboard = recomputed
    this.tempOldLeaderboard = null
    this.opts.onQuestionScored?.(recomputed)

    this.currentQuestion = targetIndex
    this.opts.onReplayCheckpoint?.(targetIndex)
    void this.newQuestion()

    return true
  }

  showCompletedQuestionResults(targetQuestionIndex: number): boolean {
    if (
      targetQuestionIndex < 0 ||
      targetQuestionIndex >= this.questionsHistory.length
    ) {
      return false
    }

    const historyItem = this.questionsHistory[targetQuestionIndex]

    if (!historyItem) {
      return false
    }

    this.clearAutoAdvance()
    this.clearInterludeTimer()
    this.acceptingAnswers = false
    this.currentQuestion = targetQuestionIndex
    this.currentStep = 0

    const counts: Record<number, number> = {}

    for (let i = 0; i < historyItem.answers.length; i += 1) {
      counts[i] = 0
    }

    for (const pa of historyItem.playerAnswers) {
      if (Array.isArray(pa.answerIds)) {
        for (const id of pa.answerIds) {
          if (typeof id === "number" && id in counts) {
            counts[id] += 1
          }
        }
      }
    }

    const targetQ = this.opts.quizz.questions[targetQuestionIndex]

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
      ...targetQ,
      questionNumber: targetQuestionIndex + 1,
      questionId: this.opts.getQuestionId?.(targetQuestionIndex),
      solutions: this.isSurvey() ? undefined : targetQ.solutions,
      responses: counts,
    })

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.UPDATE_QUESTION, {
      current: targetQuestionIndex + 1,
      total: this.opts.quizz.questions.length,
    })

    return true
  }

  previousScreen(): boolean {
    if (!this.started) {
      return false
    }

    this.clearAutoAdvance()
    this.clearInterludeTimer()

    // 0. Active voting or question in progress before reveal
    if (this.acceptingAnswers || this.currentStep < 0) {
      this.cancelActiveVote()

      if (this.opts.onPreviousTimelineStep) {
        return this.opts.onPreviousTimelineStep()
      }

      if (this.currentQuestion > 0) {
        return this.reopenQuestion(this.currentQuestion - 1)
      }

      return false
    }

    // 1. If at interlude (step 2) or later:
    if (this.currentStep > 1) {
      let target = this.currentStep - 1

      while (target > 0 && this.steps[target]?.skip?.()) {
        target -= 1
      }

      this.currentStep = target
      this.steps[target].enter()

      return true
    }

    // 2. If at leaderboard (step 1):
    if (this.currentStep === 1) {
      this.currentStep = 0

      const targetQ = this.opts.quizz.questions[this.currentQuestion]
      const ledgerEntry = this.questionLedger.get(this.currentQuestion)
      const counts = countAnswers(ledgerEntry?.answers ?? [])

      this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
        ...targetQ,
        questionNumber: this.currentQuestion + 1,
        questionId: this.opts.getQuestionId?.(this.currentQuestion),
        solutions: this.isSurvey() ? undefined : targetQ.solutions,
        responses: counts,
      })

      this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.UPDATE_QUESTION, {
        current: this.currentQuestion + 1,
        total: this.opts.quizz.questions.length,
      })

      return true
    }

    // 3. If at reveal (step 0):
    // Navigating back from reveal reopens this question for a fresh vote!
    return this.reopenQuestion(this.currentQuestion)
  }

  endOrSkipInterlude(): boolean {
    if (!this.started) {
      return false
    }

    const interludeIdx = this.getInterludeStepIndex()

    if (this.currentStep !== interludeIdx) {
      return false
    }

    this.clearInterludeTimer()
    this.nextQuestion()

    return true
  }

  skipQuestion(reason?: string): boolean {
    if (!this.started) {
      return false
    }

    // If question was already scored (currentStep >= 0), refuse as required by spec:
    // refuse and request a separate Replay rollback
    if (this.currentStep >= 0) {
      return false
    }

    // Invalidate pending question operations
    this.generation += 1
    this.cancelPendingAsync()
    this.clearAutoAdvance()
    this.clearInterludeTimer()
    this.acceptingAnswers = false
    this.opts.cooldown.abort()

    // Record skipped question in ledger and history without awarding points or leaking solutions
    this.questionLedger.set(this.currentQuestion, {
      questionIndex: this.currentQuestion,
      question: this.question,
      answers: [],
      skipped: true,
    })

    this.questionsHistory[this.currentQuestion] = {
      ...this.question,
      solutions: undefined,
      skipped: true,
      skipReason: reason,
      playerAnswersCount: 0,
      playerAnswers: this.opts.players.getAll().map((player) => ({
        playerName: player.username,
        answerIds: null,
      })),
      ...(reason ? { note: `Skipped: ${reason}` } : {}),
    }

    this.playersAnswers = []

    if (this.opts.onQuestionSkipped) {
      this.opts.onQuestionSkipped(this.currentQuestion)
    } else {
      this.nextQuestion()
    }

    return true
  }

  // ── Flow ─────────────────────────────────────────────────────────────────

  getReconnectInfo(): GameUpdateQuestion | null {
    if (!this.started) {
      return null
    }

    return {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    }
  }

  async start(socket: Socket): Promise<void> {
    if (this.started) {
      return
    }

    if (this.opts.players.count() === 0) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:game.noPlayersConnected")

      return
    }

    this.started = true
    this.paused = false
    this.pausedAt = null

    if (this.opts.skipShowStartCountdown?.() && this.opts.onShowStart) {
      this.opts.onShowStart(() => {
        void this.newQuestion()
      })

      return
    }

    this.opts.broadcast(STATUS.SHOW_START, {
      time: 3,
      subject: this.opts.quizz.subject,
    })

    await this.cancellableSleep(
      Math.max(3, Math.ceil(1200 / SECOND_MS)),
      this.generation,
    )

    if (!this.started) {
      return
    }

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.START_COOLDOWN)
    await this.opts.cooldown.start(3)

    if (!this.started) {
      return
    }

    if (this.opts.onShowStart) {
      this.opts.onShowStart(() => {
        void this.newQuestion()
      })

      return
    }

    void this.newQuestion()
  }

  advance(): void {
    if (!this.started || this.paused) {
      return
    }

    this.clearAutoAdvance()
    this.clearInterludeTimer()

    if (this.isAskingQuestion()) {
      this.noteManualVoteCompletion()
      this.acceptingAnswers = false
      this.opts.cooldown.abort()

      return
    }

    this.runStep(this.currentStep + 1)
  }

  private runStep(index: number): void {
    const step = this.steps[index]

    if (!step) {
      this.nextQuestion()

      return
    }

    if (step.skip?.()) {
      this.runStep(index + 1)

      return
    }

    this.currentStep = index
    step.enter()

    const delay = step.delay(this.opts.getSettings())

    if (delay > 0) {
      const force =
        step.name === "reveal" && this.opts.quickResultsHoldSeconds?.() != null
      this.scheduleAutoAdvance(delay, force)
    }
  }

  private nextQuestion(): void {
    if (this.opts.onQuestionCompleted) {
      this.opts.onQuestionCompleted(this.currentQuestion, () => {
        if (this.isLastQuestion()) {
          this.finish()

          return
        }

        this.currentQuestion += 1
        void this.newQuestion()
      })

      return
    }

    if (this.isLastQuestion()) {
      this.finish()

      return
    }

    this.currentQuestion += 1
    void this.newQuestion()
  }

  private async newQuestion(): Promise<void> {
    if (!this.started) {
      return
    }

    this.generation += 1
    const gen = this.generation

    this.cancelPendingAsync()
    this.clearAutoAdvance()
    this.clearInterludeTimer()

    this.currentStep = -1
    this.acceptingAnswers = false
    this.playersAnswers = []
    this.votingStartsAt = null
    this.votingEndsAt = null
    this.latestRevealDistribution = null

    // Capture pre-question checkpoint
    this.voteCompletion = null
    this.captureCheckpoint(this.currentQuestion)

    this.opts.onNewQuestion()

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.UPDATE_QUESTION, {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    })

    // Tzila's picture-led show has ONE question screen: the question with its
    // five answer cards. Skip legacy prepared/question-only preview broadcasts.
    // All other quizzes retain their original prep and question cooldowns.
    if (!this.opts.skipQuestionPreview?.()) {
      this.opts.broadcast(STATUS.SHOW_PREPARED, {
        totalAnswers: this.question.answers.length,
        questionNumber: this.currentQuestion + 1,
        questionType: this.question.type,
      })

      const ok1 = await this.cancellableSleep(2, gen)
      if (!ok1 || this.generation !== gen || !this.started) return

      const imageMedia =
        this.question.media?.type === MEDIA_TYPES.IMAGE
          ? this.question.media
          : undefined
      this.opts.broadcast(STATUS.SHOW_QUESTION, {
        questionNumber: this.currentQuestion + 1,
        questionId: this.opts.getQuestionId?.(this.currentQuestion),
        question: this.question.question,
        media: imageMedia,
        cooldown: this.question.cooldown,
      })

      const ok2 = await this.cancellableSleep(this.question.cooldown, gen)
      if (!ok2 || this.generation !== gen || !this.started) return
    }

    const entranceMs = this.opts.votingEntranceMs?.() ?? 0
    if (entranceMs > 0) {
      this.votingStartsAt = Date.now() + entranceMs
      this.votingEndsAt =
        this.question.time === NO_TIME_LIMIT
          ? null
          : this.votingStartsAt + this.question.time * SECOND_MS
      this.broadcastVotingQuestion()
      const ready = await this.cancellableSleep(entranceMs / SECOND_MS, gen)
      if (!ready || this.generation !== gen || !this.started) return
    }
    this.startTime = Date.now()
    this.acceptingAnswers = true
    if (entranceMs > 0) {
      this.votingStartsAt = this.startTime
      this.votingEndsAt =
        this.question.time === NO_TIME_LIMIT
          ? null
          : this.startTime + this.question.time * SECOND_MS
    }
    this.broadcastVotingQuestion()
    await this.opts.cooldown.start(this.question.time)

    this.acceptingAnswers = false

    if (this.generation !== gen || !this.started) {
      return
    }

    this.voteCompletion ??= "elapsed"
    this.runStep(0)
  }

  private broadcastVotingQuestion(): void {
    this.opts.broadcast(STATUS.SELECT_ANSWER, {
      questionNumber: this.currentQuestion + 1,
      questionId: this.opts.getQuestionId?.(this.currentQuestion),
      question: this.question.question,
      answers: this.question.answers,
      media: this.question.media,
      time: this.question.time,
      totalPlayer: this.opts.players.count(),
      questionType: this.question.type,
      options: this.question.options,
      answersOnly: this.opts.getSettings().answersOnly,
      playMode: this.isSurvey() ? "survey" : "quiz",
      ...(this.votingStartsAt !== null
        ? {
            votingStartsAt: this.votingStartsAt,
            ...(this.votingEndsAt !== null
              ? { votingEndsAt: this.votingEndsAt }
              : {}),
          }
        : {}),
    })
  }

  // ── Steps ────────────────────────────────────────────────────────────────

  private recordHistory(players: Player[], scored: ScoredPlayer[] = []): void {
    const historyItem: QuestionResult = {
      ...this.question,
      solutions: this.isSurvey() ? undefined : this.question.solutions,
      playerAnswersCount: this.playersAnswers.length,
      playerAnswers: players.map((player) => {
        const score = scored.find((s) => s.id === player.id)

        return {
          playerName: player.username,
          answerIds:
            this.playersAnswers.find((a) => a.playerId === player.id)
              ?.answerIds ?? null,
          ...(score && {
            correct: score.lastCorrect,
            points: score.lastPoints,
          }),
        }
      }),
    }

    this.questionsHistory[this.currentQuestion] = historyItem
  }

  private showResults(): void {
    const currentPlayers = this.opts.players.getAll()
    this.latestRevealDistribution = createRevealDistribution({
      question: this.question,
      answers: this.playersAnswers,
      players: currentPlayers,
      survey: this.isSurvey(),
      questionIndex: this.currentQuestion,
      questionId: this.opts.getQuestionId?.(this.currentQuestion),
      startedAt: Date.now(),
    })

    this.opts.onResultsCalculated?.(this.latestRevealDistribution)

    const answerCounts = countAnswers(this.playersAnswers)

    const currentEntry: LedgerQuestionEntry = {
      questionIndex: this.currentQuestion,
      question: this.question,
      answers: [...this.playersAnswers],
      skipped: false,
    }
    this.questionLedger.set(this.currentQuestion, currentEntry)

    const hasAuthoredScene =
      this.opts.hasAuthoredResultsScene?.(this.currentQuestion) ?? false

    if (this.isSurvey()) {
      currentPlayers.forEach((player) => {
        this.opts.send(player.id, STATUS.WAIT, {
          text: "game:answerNoted",
        })
      })

      this.recordHistory(currentPlayers)
      this.playersAnswers = []

      if (!hasAuthoredScene) {
        this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
          ...this.question,
          questionNumber: this.currentQuestion + 1,
          questionId: this.opts.getQuestionId?.(this.currentQuestion),
          solutions: undefined,
          responses: answerCounts,
        })
      } else {
        // Authoritative: the immediately following interimResults timeline scene
        // owns the result presentation. Collapse standard results view and advance
        // straight to the authored scene!
        this.nextQuestion()
      }

      return
    }

    const oldLeaderboard = (() => {
      if (this.leaderboard.length === 0) {
        return currentPlayers.map((p) => ({ ...p }))
      }

      return this.leaderboard.map((p) => ({ ...p }))
    })()

    const sortedPlayers = recomputeScoresFromLedger(
      currentPlayers,
      Array.from(this.questionLedger.values()),
    )

    this.opts.players.replace(sortedPlayers)
    this.opts.onQuestionScored?.(sortedPlayers)

    const scoring = QUESTION_SCORING[this.question.type]

    // Immediate personal result to each player based on THIS question's contribution
    sortedPlayers.forEach((player, index) => {
      const aheadPlayer = sortedPlayers[index - 1]
      const playerAnswer = this.playersAnswers.find(
        (a) => a.playerId === player.id,
      )
      const multiplier =
        playerAnswer && scoring
          ? scoring(this.question, playerAnswer.answerIds)
          : 0
      const earned = Math.round((playerAnswer?.points ?? 0) * multiplier)
      const correct = multiplier > 0
      const penalty =
        !correct && playerAnswer ? (this.question.penalty ?? 0) : 0
      const delta = correct ? earned : -penalty

      this.opts.send(player.id, STATUS.SHOW_RESULT, {
        correct,
        message: correct ? "game:correct" : "game:wrong",
        points: delta,
        myPoints: player.points,
        rank: index + 1,
        aheadOfMe: aheadPlayer ? aheadPlayer.username : null,
      })
    })

    this.recordHistory(currentPlayers, sortedPlayers)

    if (!hasAuthoredScene) {
      this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
        ...this.question,
        questionNumber: this.currentQuestion + 1,
        questionId: this.opts.getQuestionId?.(this.currentQuestion),
        responses: answerCounts,
      })
    } else {
      this.nextQuestion()
    }

    this.leaderboard = sortedPlayers
    this.tempOldLeaderboard ??= oldLeaderboard
    this.playersAnswers = []
    this.opts.onPresenceChange?.()
  }

  private showLeaderboard(): void {
    const oldLeaderboard = this.tempOldLeaderboard ?? this.leaderboard

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_LEADERBOARD, {
      oldLeaderboard: oldLeaderboard.slice(0, 5),
      leaderboard: this.leaderboard.slice(0, 5),
    })

    this.tempOldLeaderboard = null
  }

  private armInterludeTimer(): void {
    if (
      this.paused ||
      this.interludeRemainingMs === null ||
      this.currentStep !== this.getInterludeStepIndex()
    ) {
      return
    }

    const gen = this.generation
    this.interludeDeadline = Date.now() + this.interludeRemainingMs
    this.interludeTimer = setTimeout(() => {
      this.interludeTimer = null
      this.interludeRemainingMs = null
      this.interludeDeadline = null

      if (
        !this.paused &&
        this.generation === gen &&
        this.started &&
        this.currentStep === this.getInterludeStepIndex()
      ) {
        this.advance()
      }
    }, this.interludeRemainingMs)
  }

  private showInterlude(): void {
    this.clearInterludeTimer()
    this.opts.onInterlude?.(this.currentQuestion)

    const advanceMode =
      this.opts.getInterludeAdvance?.(this.currentQuestion) ?? "manual"

    if (advanceMode === "auto") {
      this.interludeRemainingMs =
        this.opts.getInterludeDuration?.(this.currentQuestion) ?? 5000
      this.armInterludeTimer()
    }
  }

  private finishSurvey(): void {
    const players = this.opts.players.getAll()

    const summary = {
      subject: this.opts.quizz.subject,
      totalPlayers: players.length,
      totalQuestions: this.opts.quizz.questions.length,
    }

    this.opts.send(this.opts.getManagerId(), STATUS.SUMMARY, summary)

    players.forEach((player) => {
      this.opts.send(player.id, STATUS.SUMMARY, summary)
    })
  }

  finish(): void {
    this.started = false
    this.paused = false
    this.pausedAt = null
    this.clearAutoAdvance()
    this.clearInterludeTimer()

    const hasScoredQuestions = this.opts.quizz.questions.some(
      (q) => resolveQuestionPlayMode(q, this.opts.quizz.gameMode) === "quiz",
    )

    const finalPlayers = hasScoredQuestions
      ? this.leaderboard
      : this.opts.players.getAll()

    this.opts.onGameFinished({
      id: `${Date.now()}-${nanoid(8)}`,
      gameMode: hasScoredQuestions ? QUIZZ_MODES.QUIZ : QUIZZ_MODES.SURVEY,
      subject: this.opts.quizz.subject,
      date: new Date().toISOString(),
      players: finalPlayers.map((player, index) => ({
        username: player.username,
        points: player.points,
        rank: index + 1,
      })),
      questions: this.questionsHistory,
    })

    if (!hasScoredQuestions) {
      this.finishSurvey()

      return
    }

    const top = this.leaderboard
      .slice(0, 3)
      .map(({ username, points }) => ({ username, points }))

    this.opts.send(this.opts.getManagerId(), STATUS.FINISHED, {
      subject: this.opts.quizz.subject,
      top,
    })

    this.leaderboard.forEach((player, index) => {
      this.opts.send(player.id, STATUS.FINISHED, {
        subject: this.opts.quizz.subject,
        top,
        rank: index + 1,
      })
    })
  }

  startQuestionAtIndex(index: number): void {
    if (!this.started) {
      this.started = true
    }

    this.currentQuestion = index
    void this.newQuestion()
  }

  // ── Player actions ───────────────────────────────────────────────────────

  private normalizeAnswer(answerIds: number[]): number[] | null {
    const { options } = this.question

    if (!isEstimationOptions(options)) {
      return answerIds
    }

    const value = answerIds.at(0)

    if (
      answerIds.length !== 1 ||
      value === undefined ||
      !Number.isFinite(value)
    ) {
      return null
    }

    return [Math.min(options.max, Math.max(options.min, value))]
  }

  selectAnswer(socket: Socket, answerIds: number[]): AnswerSubmissionResult {
    const player = this.opts.players.findById(socket.id)

    if (!player) {
      return { accepted: false, reason: "player_not_found" }
    }
    if (this.paused) {
      return { accepted: false, reason: "game_paused" }
    }
    if (!this.acceptingAnswers) {
      return { accepted: false, reason: "not_accepting_answers" }
    }

    if (this.playersAnswers.find((a) => a.playerId === socket.id)) {
      return { accepted: false, reason: "duplicate_answer" }
    }

    const submitted = this.normalizeAnswer(answerIds)

    if (!submitted) {
      return { accepted: false, reason: "invalid_answer" }
    }

    const points = (() => {
      if (isEstimationOptions(this.question.options)) {
        return this.question.maxPoints ?? MAX_POINTS
      }

      if (this.question.time === NO_TIME_LIMIT) {
        return orderToPoint(
          this.playersAnswers.length,
          this.opts.players.count(),
          this.question.maxPoints,
        )
      }

      return timeToPoint(this.startTime, this.question)
    })()

    this.playersAnswers.push({
      playerId: player.id,
      answerIds: submitted,
      points,
    })

    this.opts.send(socket.id, STATUS.WAIT, {
      text: "game:waitingForAnswers",
    })

    socket
      .to(this.opts.gameId)
      .emit(EVENTS.GAME.PLAYER_ANSWER, this.playersAnswers.length)
    this.opts.players.broadcastCount()
    this.opts.onAnswerSubmitted?.(player.id, submitted, points)
    this.opts.onPresenceChange?.()
    this.endIfEveryoneAnswered()

    return { accepted: true }
  }

  updatePlayerId(oldId: string, newId: string): void {
    this.playersAnswers = this.playersAnswers.map((answer) =>
      answer.playerId === oldId ? { ...answer, playerId: newId } : answer,
    )
    this.leaderboard = this.leaderboard.map((p) =>
      p.id === oldId ? { ...p, id: newId } : p,
    )

    if (this.tempOldLeaderboard) {
      this.tempOldLeaderboard = this.tempOldLeaderboard.map((p) =>
        p.id === oldId ? { ...p, id: newId } : p,
      )
    }
  }

  updateCheckpointClientId(oldClientId: string, newClientId: string): void {
    for (const cp of this.checkpoints.values()) {
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

  endIfEveryoneAnswered(): void {
    if (!this.acceptingAnswers || this.paused) {
      return
    }

    // Unlimited questions still need their existing completion path. Timed
    // questions keep the full countdown unless the host explicitly opts in.
    if (
      this.question.time !== NO_TIME_LIMIT &&
      !this.opts.getSettings().endOnAllAnswered
    ) {
      return
    }

    const connected = this.opts.players.getAll().filter((p) => p.connected)
    const everyoneAnswered = connected.every((player) =>
      this.playersAnswers.some((a) => a.playerId === player.id),
    )

    if (connected.length > 0 && everyoneAnswered) {
      this.voteCompletion = "allAnswered"
      this.opts.cooldown.abort()
    }
  }

  dispose(): void {
    this.started = false
    this.paused = false
    this.pausedAt = null
    this.generation += 1
    this.cancelPendingAsync()
    this.clearAutoAdvance()
    this.clearInterludeTimer()
    this.opts.cooldown.abort()
  }
}
