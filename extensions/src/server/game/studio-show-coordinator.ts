import type {
  TimelineItem,
  SceneConfig,
  StudioDefaults,
} from "../../core/studio-timeline-schema"
import { TimelineRunner, type TimelineStepState } from "../../gameplay/timeline-runner"

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
  private readonly defaults: StudioDefaults
  private readonly callbacks: StudioCoordinatorCallbacks

  private phase: "lobby" | "scene" | "question" | "finished" = "lobby"
  private epoch = 0
  private seq = 0
  private startedAt = 0
  private currentStepId: string | null = null
  private timer: NodeJS.Timeout | null = null
  private readonly processedRequestIds = new Set<string>()

  constructor(options: StudioShowCoordinatorOptions) {
    this.runner = new TimelineRunner(options.timeline, options.scenes)
    this.questionIds = options.questionIds
    this.defaults = options.defaults
    this.callbacks = options.callbacks
  }

  get currentEpoch(): number {
    return this.epoch
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
    return this.phase === "question"
  }

  /**
   * Returns true when step 0 of the timeline is an authored `opening` scene.
   * Used by RoundManager to avoid broadcasting a duplicate 6-second SHOW_START countdown
   * right before an authored opening scene.
   */
  hasAuthoredOpeningAtStart(): boolean {
    const first = this.runner.getItem(0)
    return first?.kind === "opening"
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
    if (!currentStep || currentStep.item.kind !== "question") {
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
  }

  private scheduleAutoAdvance(durationMs: number, expectedEpoch: number): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null

      if (this.epoch === expectedEpoch && this.phase === "scene") {
        this.advanceScene()
      }
    }, durationMs)
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
    this.currentStepId = step.item.id

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
    if (this.phase !== "scene") {
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
      activeStep?.item.kind !== "question" ? activeStep?.item.sceneId : undefined

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
    this.currentStepId = step.item.id

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
    if (!this.canPrevious().can) {
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
    this.currentStepId = step.item.id

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
   * Called by RoundManager when a question completes its reveal/leaderboard cycles.
   * Advances the timeline runner to the next item (scene or next question).
   */
  onQuestionCompleted(_currentQuestionIndex: number): void {
    if (this.phase !== "question") {
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
    this.currentStepId = step.item.id

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
