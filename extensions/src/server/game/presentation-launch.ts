import {
  PLATFORM_CLOSING_DURATION_MS,
  PLATFORM_OPENING_DURATION_MS,
  type PlatformOpeningSnapshot,
} from "../../core/platform-opening"

/** Product-owned opening and ending; neither depends on a selected show theme. */
export class PresentationLaunch {
  private stage: Exclude<PlatformOpeningSnapshot["stage"], "running"> =
    "standby"
  private startedAt: number | null = null
  private pausedAt: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  get isOpening() {
    return this.stage === "opening"
  }

  get isTransitioning() {
    return this.isOpening || this.stage === "closing"
  }

  /** Only an explicit host advance starts or skips the product opening. */
  advance(): boolean {
    if (this.stage === "lobby") {
      return false
    }

    if (this.pausedAt !== null || this.stage === "closed") {
      return true
    }

    if (this.stage === "standby") {
      this.stage = "opening"
      this.startedAt = Date.now()
      this.scheduleFinish(PLATFORM_OPENING_DURATION_MS)
      this.onChange()
    } else {
      this.finish()
    }

    return true
  }

  /**
   * A terminal authored finale has already started the shared curtain timeline.
   * Retain that timestamp at game completion instead of replaying a second ending.
   */
  close(authoredStartedAt?: number): void {
    if (this.stage === "closing" || this.stage === "closed") {
      return
    }

    this.dispose()
    this.pausedAt = null
    this.startedAt =
      typeof authoredStartedAt === "number" &&
      Number.isFinite(authoredStartedAt)
        ? Math.min(Date.now(), authoredStartedAt)
        : Date.now()
    const remainingMs = Math.max(
      0,
      PLATFORM_CLOSING_DURATION_MS - (Date.now() - this.startedAt),
    )
    this.stage = remainingMs === 0 ? "closed" : "closing"

    if (remainingMs > 0) {
      this.scheduleFinish(remainingMs)
    }

    this.onChange()
  }

  /** History/replay returns to the same room without replaying the product ident. */
  resumeRunning(): void {
    if (this.stage !== "closing" && this.stage !== "closed") {
      return
    }

    this.dispose()
    this.stage = "lobby"
    this.startedAt = null
    this.pausedAt = null
    this.onChange()
  }

  pause(): boolean {
    if (!this.isTransitioning || this.pausedAt !== null) {
      return false
    }

    this.pausedAt = Date.now()
    this.dispose()
    this.onChange()

    return true
  }

  resume(): boolean {
    if (
      !this.isTransitioning ||
      this.pausedAt === null ||
      this.startedAt === null
    ) {
      return false
    }

    this.startedAt += Date.now() - this.pausedAt
    this.pausedAt = null
    this.scheduleFinish(this.getPauseSnapshot().remainingMs ?? 0)
    this.onChange()

    return true
  }

  getPauseSnapshot() {
    const elapsed =
      this.startedAt === null
        ? 0
        : Math.max(0, (this.pausedAt ?? Date.now()) - this.startedAt)
    const durationMs = this.isOpening
      ? PLATFORM_OPENING_DURATION_MS
      : PLATFORM_CLOSING_DURATION_MS
    const remainingMs = this.isTransitioning
      ? Math.max(0, durationMs - elapsed)
      : null

    return {
      paused: this.pausedAt !== null,
      remainingMs,
      deadline:
        this.isTransitioning && this.pausedAt === null && remainingMs !== null
          ? Date.now() + remainingMs
          : null,
    }
  }

  private scheduleFinish(remainingMs: number) {
    this.dispose()
    this.timer = setTimeout(() => this.finish(), remainingMs)
  }

  private finish() {
    this.dispose()
    this.stage = this.stage === "closing" ? "closed" : "lobby"
    this.pausedAt = null
    this.onChange()
  }

  snapshot(running: boolean): PlatformOpeningSnapshot {
    return {
      stage:
        this.stage === "closing" || this.stage === "closed"
          ? this.stage
          : running
            ? "running"
            : this.stage,
      startedAt: this.startedAt,
    }
  }

  dispose() {
    if (this.timer) {
      clearTimeout(this.timer)
    }

    this.timer = null
  }
}
