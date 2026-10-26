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
  type Status,
  STATUS,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import type {
  RevealDistributionSnapshot,
  RevealOptionDistribution,
  EstimationDistribution,
} from "@razzia/extensions/core"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import {
  countAnswers,
  scoreQuestion,
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
  onAnswerSubmitted?: (playerId: string, answerIds: number[], points: number) => void
  onQuestionScored?: (scoredPlayers: ScoredPlayer[]) => void
  onQuestionCompleted?: (questionIndex: number, proceed: () => void) => void
  onShowStart?: (proceed: () => void) => void
}

interface RoundStep {
  name: string
  gameModes: QuizzMode[]
  skip?: () => boolean
  enter: () => void
  delay: (_settings: GameSettings) => number
}

export class RoundManager {
  private readonly opts: RoundManagerOptions
  private readonly steps: RoundStep[]
  private started = false
  private currentQuestion = 0
  private currentStep = -1
  private playersAnswers: Answer[] = []
  private startTime = 0
  private acceptingAnswers = false
  private leaderboard: Player[] = []
  private tempOldLeaderboard: Player[] | null = null
  private questionsHistory: QuestionResult[] = []
  private autoAdvanceTimer: NodeJS.Timeout | null = null
  private interludeTimer: NodeJS.Timeout | null = null
  private generation = 0
  private readonly activeTimeouts = new Set<NodeJS.Timeout>()
  private readonly checkpoints = new Map<number, QuestionCheckpoint>()
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
        delay: (settings) => settings.autoAdvance.responsesDelay,
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
    return this.acceptingAnswers
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

  isSurvey(): boolean {
    const q = this.question

    return resolveQuestionPlayMode(q, this.opts.quizz.gameMode) === "survey"
  }

  private getInterludeStepIndex(): number {
    return this.steps.findIndex((s) => s.name === "interlude")
  }

  // ── Generation & Async Cancellation ─────────────────────────────────────

  private cancellableSleep(sec: number, gen: number): Promise<boolean> {
    if (sec <= 0) {
      return Promise.resolve(this.generation === gen && this.started)
    }

    return new Promise((resolve) => {
      let timeoutHandle: NodeJS.Timeout | null = null

      timeoutHandle = setTimeout(() => {
        if (timeoutHandle) {
          this.activeTimeouts.delete(timeoutHandle)
        }

        resolve(this.generation === gen && this.started)
      }, sec * SECOND_MS)

      this.activeTimeouts.add(timeoutHandle)
    })
  }

  private cancelPendingAsync(): void {
    for (const timeoutHandle of this.activeTimeouts) {
      clearTimeout(timeoutHandle)
    }

    this.activeTimeouts.clear()
  }

  // ── Auto advance ─────────────────────────────────────────────────────────

  clearAutoAdvance(): void {
    if (!this.autoAdvanceTimer) {
      return
    }

    clearInterval(this.autoAdvanceTimer)
    this.autoAdvanceTimer = null
    this.emitAutoAdvance(null)
  }

  private clearInterludeTimer(): void {
    if (this.interludeTimer) {
      clearTimeout(this.interludeTimer)
      this.interludeTimer = null
    }
  }

  private emitAutoAdvance(state: { seconds: number; total: number } | null) {
    this.opts.io
      .to(this.opts.getManagerId())
      .emit(EVENTS.MANAGER.AUTO_ADVANCE, state)
  }

  private scheduleAutoAdvance(delay: number): void {
    this.clearAutoAdvance()

    if (!this.opts.getSettings().autoAdvance.enable) {
      return
    }

    let remaining = delay

    this.emitAutoAdvance({ seconds: remaining, total: delay })

    this.autoAdvanceTimer = setInterval(() => {
      remaining -= 1

      if (remaining > 0) {
        this.emitAutoAdvance({ seconds: remaining, total: delay })

        return
      }

      this.clearAutoAdvance()
      this.advance()
    }, SECOND_MS)
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

  getRevealDistribution(): RevealDistributionSnapshot | null {
    return this.latestRevealDistribution
  }

  // ── Authoritative Controls ──────────────────────────────────────────────

  endTimer(): boolean {
    if (!this.started || !this.acceptingAnswers) {
      return false
    }

    this.acceptingAnswers = false
    this.opts.cooldown.abort()

    return true
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

    // Record skipped question in history without awarding points or leaking solutions
    this.questionsHistory.push({
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
    })

    this.playersAnswers = []
    this.nextQuestion()

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
    if (!this.started) {
      return
    }

    this.clearAutoAdvance()
    this.clearInterludeTimer()

    if (this.isAskingQuestion()) {
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
      this.scheduleAutoAdvance(delay)
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
    this.latestRevealDistribution = null

    // Capture pre-question checkpoint
    this.captureCheckpoint(this.currentQuestion)

    this.opts.onNewQuestion()

    this.opts.io.to(this.opts.gameId).emit(EVENTS.GAME.UPDATE_QUESTION, {
      current: this.currentQuestion + 1,
      total: this.opts.quizz.questions.length,
    })

    this.opts.broadcast(STATUS.SHOW_PREPARED, {
      totalAnswers: this.question.answers.length,
      questionNumber: this.currentQuestion + 1,
      questionType: this.question.type,
    })

    const ok1 = await this.cancellableSleep(2, gen)

    if (!ok1 || this.generation !== gen || !this.started) {
      return
    }

    const imageMedia = (() => {
      if (this.question.media?.type !== MEDIA_TYPES.IMAGE) {
        return undefined
      }

      return this.question.media
    })()

    this.opts.broadcast(STATUS.SHOW_QUESTION, {
      question: this.question.question,
      media: imageMedia,
      cooldown: this.question.cooldown,
    })

    const ok2 = await this.cancellableSleep(this.question.cooldown, gen)

    if (!ok2 || this.generation !== gen || !this.started) {
      return
    }

    this.startTime = Date.now()
    this.acceptingAnswers = true

    this.opts.broadcast(STATUS.SELECT_ANSWER, {
      question: this.question.question,
      answers: this.question.answers,
      media: this.question.media,
      time: this.question.time,
      totalPlayer: this.opts.players.count(),
      questionType: this.question.type,
      options: this.question.options,
      answersOnly: this.opts.getSettings().answersOnly,
    })

    await this.opts.cooldown.start(this.question.time)

    this.acceptingAnswers = false

    if (this.generation !== gen || !this.started) {
      return
    }

    this.runStep(0)
  }

  // ── Steps ────────────────────────────────────────────────────────────────

  private recordHistory(players: Player[], scored: ScoredPlayer[] = []): void {
    this.questionsHistory.push({
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
    })
  }

  private showResults(): void {
    const currentPlayers = this.opts.players.getAll()
    const connectedPlayers = currentPlayers.filter((p) => p.connected)
    const eligibleCount = connectedPlayers.length
    const uniqueResponders = new Set(this.playersAnswers.map((a) => a.playerId))
      .size

    // Calculate reveal distribution data for cinematic reveal without withholding player results
    let optionsDist: Record<number, RevealOptionDistribution> | undefined =
      undefined
    let estimationDist: EstimationDistribution | undefined = undefined

    if (isEstimationOptions(this.question.options)) {
      const guesses: number[] = []

      for (const ans of this.playersAnswers) {
        const val = ans.answerIds?.[0]

        if (typeof val === "number" && Number.isFinite(val)) {
          guesses.push(val)
        }
      }

      guesses.sort((a, b) => a - b)
      const target = this.question.solutions?.[0] ?? 0
      let closestGuess: number | undefined = undefined

      if (guesses.length > 0) {
        closestGuess = guesses.reduce((prev, curr) =>
          Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev,
        )
      }

      const median =
        guesses.length > 0 ? guesses[Math.floor(guesses.length / 2)] : undefined

      estimationDist = {
        min: this.question.options.min,
        max: this.question.options.max,
        target,
        guessesCount: guesses.length,
        closestGuess,
        median,
        guesses,
      }
    } else {
      optionsDist = {}
      const counts: Record<number, number> = {}

      for (let i = 0; i < this.question.answers.length; i += 1) {
        counts[i] = 0
      }

      for (const ans of this.playersAnswers) {
        if (Array.isArray(ans.answerIds)) {
          for (const id of ans.answerIds) {
            if (typeof id === "number" && id in counts) {
              counts[id] += 1
            }
          }
        }
      }

      for (let i = 0; i < this.question.answers.length; i += 1) {
        const count = counts[i]
        const percentage =
          uniqueResponders > 0
            ? Math.round((count / uniqueResponders) * 100)
            : 0
        const isSolution = this.isSurvey()
          ? undefined
          : (this.question.solutions?.includes(i) ?? false)

        optionsDist[i] = {
          index: i,
          count,
          percentage,
          isSolution,
        }
      }
    }

    this.latestRevealDistribution = {
      questionId: this.opts.getQuestionId?.(this.currentQuestion),
      questionIndex: this.currentQuestion,
      questionType: this.question.type,
      totalResponders: uniqueResponders,
      eligiblePlayers: eligibleCount,
      revealStartedAt: Date.now(),
      options: optionsDist,
      estimation: estimationDist,
      solutions: this.isSurvey() ? undefined : this.question.solutions,
    }

    this.opts.onResultsCalculated?.(this.latestRevealDistribution)

    const answerCounts = countAnswers(this.playersAnswers)

    if (this.isSurvey()) {
      this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
        ...this.question,
        solutions: undefined,
        responses: answerCounts,
      })

      currentPlayers.forEach((player) => {
        this.opts.send(player.id, STATUS.WAIT, {
          text: "game:answerNoted",
        })
      })

      this.recordHistory(currentPlayers)
      this.playersAnswers = []

      return
    }

    const oldLeaderboard = (() => {
      if (this.leaderboard.length === 0) {
        return currentPlayers.map((p) => ({ ...p }))
      }

      return this.leaderboard.map((p) => ({ ...p }))
    })()

    const sortedPlayers = scoreQuestion(
      this.question,
      currentPlayers,
      this.playersAnswers,
    )

    this.opts.players.replace(sortedPlayers)
    this.opts.onQuestionScored?.(sortedPlayers)

    // Immediate personal result to each player (no delayed withholding for projector)
    sortedPlayers.forEach((player, index) => {
      const aheadPlayer = sortedPlayers[index - 1]

      this.opts.send(player.id, STATUS.SHOW_RESULT, {
        correct: player.lastCorrect,
        message: player.lastCorrect ? "game:correct" : "game:wrong",
        points: player.lastPoints,
        myPoints: player.points,
        rank: index + 1,
        aheadOfMe: aheadPlayer ? aheadPlayer.username : null,
      })
    })

    this.opts.send(this.opts.getManagerId(), STATUS.SHOW_RESPONSES, {
      ...this.question,
      responses: answerCounts,
    })

    this.recordHistory(currentPlayers, sortedPlayers)

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

  private showInterlude(): void {
    this.clearInterludeTimer()
    this.opts.onInterlude?.(this.currentQuestion)

    const advanceMode =
      this.opts.getInterludeAdvance?.(this.currentQuestion) ?? "manual"

    if (advanceMode === "auto") {
      const durationMs =
        this.opts.getInterludeDuration?.(this.currentQuestion) ?? 5000
      const gen = this.generation

      this.interludeTimer = setTimeout(
        () => {
          this.interludeTimer = null

          if (
            this.generation === gen &&
            this.started &&
            this.currentStep === this.getInterludeStepIndex()
          ) {
            this.advance()
          }
        },
        (durationMs / 1000) * SECOND_MS,
      )
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

  selectAnswer(socket: Socket, answerIds: number[]): void {
    const player = this.opts.players.findById(socket.id)

    if (!player || !this.acceptingAnswers) {
      return
    }

    if (this.playersAnswers.find((a) => a.playerId === socket.id)) {
      return
    }

    const submitted = this.normalizeAnswer(answerIds)

    if (!submitted) {
      return
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
    if (!this.acceptingAnswers) {
      return
    }

    const connected = this.opts.players.getAll().filter((p) => p.connected)
    const everyoneAnswered = connected.every((player) =>
      this.playersAnswers.some((a) => a.playerId === player.id),
    )

    if (connected.length > 0 && everyoneAnswered) {
      this.opts.cooldown.abort()
    }
  }

  dispose(): void {
    this.started = false
    this.generation += 1
    this.cancelPendingAsync()
    this.clearAutoAdvance()
    this.clearInterludeTimer()
    this.opts.cooldown.abort()
  }
}
