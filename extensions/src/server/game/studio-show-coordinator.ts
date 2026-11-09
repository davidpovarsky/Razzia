// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import type {
  SceneConfig,
  StudioDefaults,
  TimelineItem,
} from "../../core/studio-timeline-schema"
import {
  TimelineRunner,
  type TimelineStepState,
} from "../../gameplay/timeline-runner"

export interface StudioCoordinatorCallbacks {
  onStartQuestion: (questionIndex: number) => Promise<void> | void
  onReopenQuestion?: (questionIndex: number) => Promise<void> | void
  onShowCompletedQuestionResults?: (questionIndex: number) => void
  onFinish: () => void
  onBroadcastState: () => void
}

export interface StudioShowCoordinatorOptions {
  timeline: TimelineItem[]
  scenes: Record<string, SceneConfig>
  questionIds: string[]
  defaults: StudioDefaults
  callbacks: StudioCoordinatorCallbacks
}

export interface AuthoritativeStepEnvelope {
  id: string
  kind: string
  questionId?: string
  sceneId?: string
  questionOrdinal: number
  stepIndex: number
  totalSteps: number
  advance: "auto" | "manual" | "onMediaEnd"
  startedAt: number
  durationMs: number
  epoch: number
  seq: number
  scene?: SceneConfig
}

/**
 * Server show coordinator owning TimelineRunner for V2 Studio shows.
 * Enforces:
 * - Monotonic step ID and epoch progression
 * - Non-question scenes (transition, animation, media, leaderboard, interimResults, countdown, opening, closing)
 *   strictly block answer acceptance on the server
 * - Auto-advance timer management with cancel-on-skip and race prevention
 * - Full multi-scene sequencing before, between, and after questions
 */
export class StudioShowCoordinator {
  private readonly runner: TimelineRunner
  private readonly questionIds: string[]
  private readonly questionSteps = new Map<string, number>()
  private readonly callbacks: StudioCoordinatorCallbacks

  private phase: "lobby" | "scene" | "question" | "finished" = "lobby"
  private epoch = 0
  private seq = 0
  private startedAt = 0
  private timer: NodeJS.Timeout | null = null
  private timerDeadline: number | null = null
  private timerRemainingMs: number | null = null
  private paused = false
  private pausedAt: number | null = null

  constructor(options: StudioShowCoordinatorOptions) {
    this.runner = new TimelineRunner(options.timeline, options.scenes)
    this.questionIds = options.questionIds
    options.timeline.forEach((item, index) => {
      if (item.kind === "question") {
        this.questionSteps.set(item.questionId, index)
      }
    })
    this.callbacks = options.callbacks
  }

  get currentEpoch(): number {
    return this.epoch
  }

  /** Align the authored cursor with a checkpoint restored by RoundManager. */
  restoreQuestionPosition(questionIndex: number): boolean {
    const questionId = this.questionIds[questionIndex]
    const stepIndex = this.questionSteps.get(questionId)

    if (stepIndex === undefined) {
      return false
    }

    this.clearTimer()
    this.runner.jumpTo(stepIndex)
    this.phase = "question"
    this.epoch += 1
    this.seq += 1
    this.startedAt = Date.now()

    return true
  }

  get currentSeq(): number {
    return this.seq
  }

  get currentPhase(): "lobby" | "scene" | "question" | "finished" {
    return this.phase
  }

  get currentScene(): SceneConfig | undefined {
    if (this.phase !== "scene") {
      return undefined
    }

    return this.runner.currentScene
  }

  get totalSteps(): number {
    return this.runner.length
  }

  get currentIndex(): number {
    return this.runner.index
  }

  get currentStep(): TimelineStepState | null {
    return this.runner.getCurrentStep()
  }

  isSceneActive(): boolean {
    return this.phase === "scene"
  }

  canAcceptAnswers(): boolean {
    return this.phase === "question" && !this.paused
  }

  get isPaused(): boolean {
    return this.paused
  }

  getSceneElapsedMs(): number {
    return Math.max(0, (this.pausedAt ?? Date.now()) - this.startedAt)
  }

  getPauseSnapshot(): {
    paused: boolean
    remainingMs: number | null
    deadline: number | null
  } {
    const remainingMs = this.timer
      ? Math.max(0, (this.timerDeadline ?? Date.now()) - Date.now())
      : this.timerRemainingMs

    return {
      paused: this.paused,
      remainingMs,
      deadline:
        !this.paused && remainingMs !== null ? Date.now() + remainingMs : null,
    }
  }

  /**
   * Returns true when step 0 of the timeline is an authored `opening` scene.
   * Used by RoundManager to avoid broadcasting a duplicate 6-second SHOW_START countdown
   * right before an authored opening scene.
   */
  hasAuthoredOpeningAtStart(): boolean {
    const first = this.runner.getItem(0)
    const firstScene = this.runner.getCurrentStep()?.scene

    return (
      first?.kind === "opening" ||
      (first?.kind === "animation" &&
        firstScene?.kind === "animation" &&
        firstScene.preset === "company-opening")
    )
  }

  /**
   * Returns true if the current active question is immediately followed in the timeline
   * by an authored results scene (interimResults). When true, that scene owns the public
   * result reveal, allowing the server to collapse the standard intermediate SHOW_RESPONSES.
   */
  hasNextSceneResultsForQuestion(questionIndex: number): boolean {
    if (this.phase !== "question") {
      return false
    }

    const currentStep = this.runner.getCurrentStep()

    if (currentStep?.item.kind !== "question") {
      return false
    }

    const currentQIdx = this.getQuestionIndex(currentStep.item.questionId)

    if (currentQIdx !== questionIndex) {
      return false
    }

    const nextIndex = this.runner.index + 1

    if (nextIndex >= this.runner.length) {
      return false
    }

    const nextItem = this.runner.getItem(nextIndex)

    if (!nextItem) {
      return false
    }

    return nextItem.kind === "interimResults"
  }

  getQuestionOrdinal(): number {
    return this.runner.getQuestionOrdinal()
  }

  private getQuestionIndex(questionId: string): number {
    const idx = this.questionIds.indexOf(questionId)

    return idx >= 0 ? idx : 0
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.timerDeadline = null
    this.timerRemainingMs = null
  }

  private scheduleAutoAdvance(durationMs: number, expectedEpoch: number): void {
    this.clearTimer()
    this.timerRemainingMs = durationMs

    if (this.paused) {
      return
    }

    this.timerDeadline = Date.now() + durationMs
    this.timer = setTimeout(() => {
      this.timer = null
      this.timerDeadline = null
      this.timerRemainingMs = null

      if (
        !this.paused &&
        this.epoch === expectedEpoch &&
        this.phase === "scene"
      ) {
        this.advanceScene()
      }
    }, durationMs)
  }

  pauseGame(): boolean {
    if (this.paused || (this.phase !== "scene" && this.phase !== "question")) {
      return false
    }

    this.paused = true
    this.pausedAt = Date.now()

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      this.timerRemainingMs = Math.max(
        0,
        (this.timerDeadline ?? Date.now()) - Date.now(),
      )
      this.timerDeadline = null
    }

    this.seq += 1
    this.callbacks.onBroadcastState()

    return true
  }

  resumeGame(): boolean {
    if (!this.paused) {
      return false
    }

    const pausedFor = this.pausedAt === null ? 0 : Date.now() - this.pausedAt
    this.paused = false
    this.pausedAt = null
    this.startedAt += pausedFor
    this.seq += 1

    if (this.timerRemainingMs !== null) {
      const remaining = this.timerRemainingMs
      const expectedEpoch = this.epoch
      this.timerRemainingMs = null
      this.scheduleAutoAdvance(remaining, expectedEpoch)
    }

    this.callbacks.onBroadcastState()

    return true
  }

  /**
   * Starts timeline execution from step 0.
   */
  start(): void {
    if (this.phase !== "lobby") {
      return
    }

    const step = this.runner.getCurrentStep()

    if (!step) {
      this.phase = "finished"
      this.callbacks.onFinish()

      return
    }

    this.epoch += 1
    this.seq += 1
    this.startedAt = Date.now()

    if (step.item.kind === "question") {
      this.phase = "question"
      const qIdx = this.getQuestionIndex(step.item.questionId)
      void this.callbacks.onStartQuestion(qIdx)
    } else {
      this.phase = "scene"

      if (step.advanceMode === "auto" || step.advanceMode === "onMediaEnd") {
        this.scheduleAutoAdvance(
          step.safetyTimeoutMs ?? step.durationMs,
          this.epoch,
        )
      }

      this.callbacks.onBroadcastState()
    }
  }

  /**
   * Advances the current non-question scene.
   * Cancels any pending auto-advance timer to prevent double advances.
   */
  advanceScene(
    sceneId?: string,
    epoch?: number,
    timelineStepIndex?: number,
  ): boolean {
    if (this.phase !== "scene" || this.paused) {
      return false
    }

    if (epoch !== undefined && epoch !== this.epoch) {
      return false
    }

    if (
      timelineStepIndex !== undefined &&
      timelineStepIndex !== this.runner.index
    ) {
      return false
    }

    const activeStep = this.runner.getCurrentStep()
    const activeSceneId =
      activeStep?.item.kind !== "question"
        ? activeStep?.item.sceneId
        : undefined

    if (
      sceneId &&
      activeSceneId &&
      sceneId !== activeSceneId &&
      sceneId !== activeStep?.item.id
    ) {
      return false
    }

    this.clearTimer()

    const { step, done } = this.runner.advance()

    if (done || !step) {
      this.phase = "finished"
      this.epoch += 1
      this.seq += 1
      this.callbacks.onFinish()

      return true
    }

    this.epoch += 1
    this.seq += 1
    this.startedAt = Date.now()

    if (step.item.kind === "question") {
      this.phase = "question"
      const qIdx = this.getQuestionIndex(step.item.questionId)
      void this.callbacks.onStartQuestion(qIdx)
    } else {
      this.phase = "scene"

      if (step.advanceMode === "auto" || step.advanceMode === "onMediaEnd") {
        this.scheduleAutoAdvance(
          step.safetyTimeoutMs ?? step.durationMs,
          this.epoch,
        )
      }

      this.callbacks.onBroadcastState()
    }

    return true
  }

  /**
   * Skips exactly one active scene.
   */
  skipScene(
    sceneId?: string,
    epoch?: number,
    timelineStepIndex?: number,
  ): boolean {
    return this.advanceScene(sceneId, epoch, timelineStepIndex)
  }

  canPrevious(): {
    can: boolean
    reason?: string
    willReopenQuestion?: boolean
    answersReceived?: number
  } {
    if (this.phase === "lobby" || this.phase === "finished") {
      return { can: false, reason: "Show not in active timeline" }
    }

    if (this.runner.index <= 0) {
      return { can: false, reason: "At start of show" }
    }

    const prev = this.runner.peekPrevious()
    const willReopenQuestion = prev?.item.kind === "question"

    return { can: true, willReopenQuestion }
  }

  /**
   * Safely navigates to the immediately preceding timeline step.
   * If the previous step is a scene, activates it.
   * If the previous step is a question, reopens it for a fresh voting round.
   */
  previousScene(): boolean {
    if (this.paused || !this.canPrevious().can) {
      return false
    }

    this.clearTimer()

    const oldIndex = this.runner.index
    const { step, done } = this.runner.previous()

    if (done || !step) {
      return false
    }

    this.epoch += 1
    this.seq += 1
    this.startedAt = Date.now()

    if (step.item.kind === "question") {
      this.phase = "question"
      const qIdx = this.getQuestionIndex(step.item.questionId)

      try {
        if (this.callbacks.onReopenQuestion) {
          void this.callbacks.onReopenQuestion(qIdx)
        } else if (this.callbacks.onStartQuestion) {
          void this.callbacks.onStartQuestion(qIdx)
        }
      } catch {
        this.runner.jumpTo(oldIndex)

        return false
      }
    } else {
      this.phase = "scene"

      if (step.advanceMode === "auto" || step.advanceMode === "onMediaEnd") {
        this.scheduleAutoAdvance(
          step.safetyTimeoutMs ?? step.durationMs,
          this.epoch,
        )
      }

      this.callbacks.onBroadcastState()
    }

    return true
  }

  /**
   * Skips the active question and all of its authored result/story scenes.
   * The first following question becomes authoritative in one transition.
   */
  skipQuestionSequence(): boolean {
    if (this.phase !== "question" || this.paused) {
      return false
    }

    this.clearTimer()

    while (true) {
      const { step, done } = this.runner.advance()

      if (done || !step) {
        this.phase = "finished"
        this.epoch += 1
        this.seq += 1
        this.startedAt = Date.now()
        this.callbacks.onFinish()

        return true
      }

      if (step.item.kind !== "question") {
        // Round summaries and the finale are show boundaries, not scenes owned
        // by the skipped vote. Keep them even if Q5/Q10 was skipped.
        if (
          step.scene?.kind === "animation" &&
          ["round-recap", "grand-finale"].includes(step.scene.preset)
        ) {
          this.phase = "scene"
          this.epoch += 1
          this.seq += 1
          this.startedAt = Date.now()

          if (step.advanceMode === "auto") {
            this.scheduleAutoAdvance(step.durationMs, this.epoch)
          }

          this.callbacks.onBroadcastState()

          return true
        }

        continue
      }

      this.phase = "question"
      this.epoch += 1
      this.seq += 1
      this.startedAt = Date.now()
      const nextQIdx = this.getQuestionIndex(step.item.questionId)
      void this.callbacks.onStartQuestion(nextQIdx)

      return true
    }
  }

  /**
   * Called by RoundManager when a question completes its reveal/leaderboard cycles.
   * Advances the timeline runner to the next item (scene or next question).
   */
  onQuestionCompleted(_currentQuestionIndex: number): void {
    if (this.phase !== "question" || this.paused) {
      return
    }

    this.clearTimer()

    const { step, done } = this.runner.advance()

    if (done || !step) {
      this.phase = "finished"
      this.epoch += 1
      this.seq += 1
      this.callbacks.onFinish()

      return
    }

    this.epoch += 1
    this.seq += 1
    this.startedAt = Date.now()

    if (step.item.kind === "question") {
      this.phase = "question"
      const nextQIdx = this.getQuestionIndex(step.item.questionId)
      void this.callbacks.onStartQuestion(nextQIdx)
    } else {
      this.phase = "scene"

      if (step.advanceMode === "auto" || step.advanceMode === "onMediaEnd") {
        this.scheduleAutoAdvance(
          step.safetyTimeoutMs ?? step.durationMs,
          this.epoch,
        )
      }

      this.callbacks.onBroadcastState()
    }
  }

  /**
   * Returns authoritative step envelope.
   * For players, returns safe active-scene payload only (no future timeline or private details).
   */
  getAuthoritativeStepEnvelope(
    _forRole: "manager" | "player" = "player",
  ): AuthoritativeStepEnvelope | null {
    if (this.phase === "lobby" || this.phase === "finished") {
      return null
    }

    const step = this.runner.getCurrentStep()

    if (!step) {
      return null
    }

    return {
      id: step.item.id,
      kind: step.item.kind,
      questionId:
        step.item.kind === "question" ? step.item.questionId : undefined,
      sceneId: step.item.kind !== "question" ? step.item.sceneId : undefined,
      questionOrdinal: this.runner.getQuestionOrdinal(),
      stepIndex: step.index,
      totalSteps: step.total,
      advance: step.advanceMode,
      startedAt: this.startedAt,
      durationMs: step.durationMs,
      epoch: this.epoch,
      seq: this.seq,
      scene: step.scene,
    }
  }

  dispose(): void {
    this.clearTimer()
    this.phase = "finished"
  }
}
