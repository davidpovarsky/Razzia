import {
  PLATFORM_OPENING_DURATION_MS,
  type PlatformOpeningSnapshot,
} from "../../core/platform-opening"

export class PresentationLaunch {
  private stage: "standby" | "opening" | "lobby" = "standby"
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

  /** Only an explicit host advance starts or skips the product opening. */
  advance(): boolean {
    if (this.stage === "lobby") {
      return false
    }

    if (this.pausedAt !== null) {
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

  pause(): boolean {
    if (!this.isOpening || this.pausedAt !== null) {
      return false
    }

    this.pausedAt = Date.now()
    this.dispose()
    this.onChange()

    return true
  }

  resume(): boolean {
    if (!this.isOpening || this.pausedAt === null || this.startedAt === null) {
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
    const remainingMs = this.isOpening
      ? Math.max(0, PLATFORM_OPENING_DURATION_MS - elapsed)
      : null

    return {
      paused: this.pausedAt !== null,
      remainingMs,
      deadline:
        this.isOpening && this.pausedAt === null && remainingMs !== null
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
    this.stage = "lobby"
    this.pausedAt = null
    this.onChange()
  }

  snapshot(running: boolean): PlatformOpeningSnapshot {
    return {
      stage: running ? "running" : this.stage,
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
