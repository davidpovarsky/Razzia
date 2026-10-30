import type {
  TimelineItem,
  SceneConfig,
} from "../core/studio-timeline-schema"

export interface TimelineStepState {
  index: number
  total: number
  item: TimelineItem
  scene?: SceneConfig
  canAcceptAnswers: boolean
  advanceMode: "auto" | "manual"
  durationMs: number
}

/**
 * Server and gameplay runner managing progression through the timeline of all 10 card kinds.
 * Enforces:
 * - Non-question scenes (transition, animation, media, leaderboard, interimResults, countdown, opening, closing)
 *   do not accept answer submissions.
 * - Accurate advance modes (auto vs manual) and duration timings.
 * - Isolated question index mapping so question numbering is independent of non-question scene placement.
 */
export class TimelineRunner {
  private currentIndex = 0
  private readonly timeline: TimelineItem[]
  private readonly scenes: Record<string, SceneConfig>

  constructor(
    timeline: TimelineItem[],
    scenes: Record<string, SceneConfig> = {},
  ) {
    this.timeline = timeline
    this.scenes = scenes
  }

  get length(): number {
    return this.timeline.length
  }

  get index(): number {
    return this.currentIndex
  }

  get currentItem(): TimelineItem | undefined {
    return this.timeline[this.currentIndex]
  }

  get currentScene(): SceneConfig | undefined {
    const item = this.currentItem

    if (!item || item.kind === "question") {
      return undefined
    }

    return this.scenes[item.sceneId]
  }

  get isQuestion(): boolean {
    return this.currentItem?.kind === "question"
  }

  get canAcceptAnswers(): boolean {
    return this.isQuestion
  }

  getAdvanceMode(): "auto" | "manual" {
    const scene = this.currentScene

    if (scene && "advance" in scene) {
      return (scene as { advance?: "auto" | "manual" }).advance ?? "manual"
    }

    return "manual"
  }

  getDurationMs(): number {
    const scene = this.currentScene

    if (scene && "durationMs" in scene) {
      return (scene as { durationMs?: number }).durationMs ?? 5000
    }

    return 5000
  }

  getCurrentStep(): TimelineStepState | null {
    const item = this.currentItem

    if (!item) {
      return null
    }

    return {
      index: this.currentIndex,
      total: this.timeline.length,
      item,
      scene: this.currentScene,
      canAcceptAnswers: this.canAcceptAnswers,
      advanceMode: this.getAdvanceMode(),
      durationMs: this.getDurationMs(),
    }
  }

  advance(): { step: TimelineStepState | null; done: boolean } {
    if (this.currentIndex + 1 >= this.timeline.length) {
      return { step: null, done: true }
    }

    this.currentIndex += 1

    return { step: this.getCurrentStep(), done: false }
  }

  canPrevious(): boolean {
    return this.currentIndex > 0
  }

  previous(): { step: TimelineStepState | null; done: boolean } {
    if (this.currentIndex <= 0) {
      return { step: null, done: true }
    }

    this.currentIndex -= 1

    return { step: this.getCurrentStep(), done: false }
  }

  jumpTo(index: number): TimelineStepState | null {
    if (index < 0 || index >= this.timeline.length) {
      return null
    }

    this.currentIndex = index

    return this.getCurrentStep()
  }

  getQuestionOrdinal(): number {
    let qCount = 0

    for (let i = 0; i <= this.currentIndex; i += 1) {
      if (this.timeline[i]?.kind === "question") {
        qCount += 1
      }
    }

    return qCount
  }
}
