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
  advanceMode: "auto" | "manual" | "onMediaEnd"
  durationMs: number
  safetyTimeoutMs?: number
}

function resolveSceneAdvanceMode(
  scene: SceneConfig | undefined,
): "auto" | "manual" | "onMediaEnd" {
  if (!scene || !("advance" in scene)) {
    return "manual"
  }
  const rawAdvance =
    (scene as { advance?: "auto" | "manual" | "onMediaEnd" }).advance ??
    "manual"
  if (rawAdvance === "manual") {
    return "manual"
  }
  if (rawAdvance === "onMediaEnd") {
    return "onMediaEnd"
  }
  // Legacy compatibility: endBehavior: "advanceNext" on opening/closing/media with foreground video/audio
  if (
    "endBehavior" in scene &&
    scene.endBehavior === "advanceNext" &&
    "mediaType" in scene &&
    (scene.mediaType === "video" || scene.mediaType === "audio") &&
    typeof scene.mediaUrl === "string" &&
    scene.mediaUrl.trim().length > 0
  ) {
    return "onMediaEnd"
  }
  return rawAdvance
}

export function computeSceneSafetyTimeoutMs(
  scene: SceneConfig | undefined,
  advanceMode: "auto" | "manual" | "onMediaEnd",
  durationMs: number,
): number | undefined {
  if (advanceMode === "manual") {
    return undefined
  }
  if (advanceMode === "auto") {
    return durationMs
  }
  // advanceMode === "onMediaEnd"
  const hasForegroundTimedMedia = Boolean(
    scene &&
      "mediaUrl" in scene &&
      typeof scene.mediaUrl === "string" &&
      scene.mediaUrl.trim().length > 0 &&
      (("mediaType" in scene &&
        (scene.mediaType === "video" || scene.mediaType === "audio")) ||
        (!("mediaType" in scene) &&
          /\.(mp4|webm|mov|m4v|mp3|wav|ogg|m4a)$/iu.test(scene.mediaUrl))),
  )
  const isLooping = Boolean(
    scene && "loop" in scene && (scene as { loop?: boolean }).loop === true,
  )

  // Contradictory loop:true + onMediaEnd or non-video/audio scene falls back to bounded durationMs
  if (!hasForegroundTimedMedia || isLooping) {
    return durationMs
  }

  const explicitFallback =
    scene && "mediaEndFallbackMs" in scene
      ? (scene as { mediaEndFallbackMs?: number }).mediaEndFallbackMs
      : undefined

  if (
    typeof explicitFallback === "number" &&
    Number.isFinite(explicitFallback) &&
    explicitFallback >= 500
  ) {
    return Math.max(durationMs, explicitFallback)
  }

  // When durationMs is still at or below the 5000ms default, do not cut an 8s–25s clip at 5s;
  // use a bounded 30s safety timeout unless durationMs is explicitly longer (then add 5s grace).
  if (durationMs <= 5000) {
    return 30000
  }

  return durationMs + 5000
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

  getItem(index: number): TimelineItem | undefined {
    return this.timeline[index]
  }

  peekPrevious(): TimelineStepState | null {
    if (this.currentIndex <= 0) {
      return null
    }

    const prevIndex = this.currentIndex - 1
    const item = this.timeline[prevIndex]

    if (!item) {
      return null
    }

    const scene = item.kind === "question" ? undefined : this.scenes[item.sceneId]
    const advanceMode = resolveSceneAdvanceMode(scene)
    const durationMs =
      scene && "durationMs" in scene
        ? ((scene as { durationMs?: number }).durationMs ?? 5000)
        : 5000
    const safetyTimeoutMs = computeSceneSafetyTimeoutMs(
      scene,
      advanceMode,
      durationMs,
    )

    return {
      index: prevIndex,
      total: this.timeline.length,
      item,
      scene,
      canAcceptAnswers: item.kind === "question",
      advanceMode,
      durationMs,
      safetyTimeoutMs,
    }
  }

  get canAcceptAnswers(): boolean {
    return this.isQuestion
  }

  getAdvanceMode(): "auto" | "manual" | "onMediaEnd" {
    return resolveSceneAdvanceMode(this.currentScene)
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

    const advanceMode = this.getAdvanceMode()
    const durationMs = this.getDurationMs()

    return {
      index: this.currentIndex,
      total: this.timeline.length,
      item,
      scene: this.currentScene,
      canAcceptAnswers: this.canAcceptAnswers,
      advanceMode,
      durationMs,
      safetyTimeoutMs: computeSceneSafetyTimeoutMs(
        this.currentScene,
        advanceMode,
        durationMs,
      ),
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
