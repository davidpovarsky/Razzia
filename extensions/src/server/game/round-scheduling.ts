interface PendingDelay {
  timer: NodeJS.Timeout | null
  deadline: number
  remainingMs: number
  generation: number
  resolve: (_completed: boolean) => void
}

export interface RoundSchedulingPorts {
  tickMs: number
  isPaused(): boolean
  isStarted(): boolean
  generation(): number
  isInterlude(): boolean
  autoAdvanceEnabled(): boolean
  emitAutoAdvance(state: { seconds: number; total: number } | null): void
  advance(): void
}

/** Pausable/cancellable show scheduling; no game state or score ownership. */
export class RoundScheduling {
  private readonly ports: RoundSchedulingPorts
  constructor(ports: RoundSchedulingPorts) {
    this.ports = ports
  }
  private autoAdvanceTimer: NodeJS.Timeout | null = null
  private autoAdvanceDeadline: number | null = null
  private autoAdvanceRemainingMs: number | null = null
  private autoAdvanceTotalSeconds: number | null = null
  private interludeTimer: NodeJS.Timeout | null = null
  private interludeDeadline: number | null = null
  private interludeRemainingMs: number | null = null
  private readonly pendingDelays = new Set<PendingDelay>()
  private armDelay(delay: PendingDelay): void {
    if (this.ports.isPaused() || delay.remainingMs <= 0) {
      if (!this.ports.isPaused()) {
        this.pendingDelays.delete(delay)
        delay.resolve(
          this.ports.generation() === delay.generation &&
            this.ports.isStarted(),
        )
      }

      return
    }

    delay.deadline = Date.now() + delay.remainingMs
    delay.timer = setTimeout(() => {
      delay.timer = null
      delay.remainingMs = 0
      this.pendingDelays.delete(delay)
      delay.resolve(
        this.ports.generation() === delay.generation && this.ports.isStarted(),
      )
    }, delay.remainingMs)
  }

  cancellableSleep(sec: number, gen: number): Promise<boolean> {
    if (sec <= 0) {
      return Promise.resolve(
        this.ports.generation() === gen && this.ports.isStarted(),
      )
    }

    return new Promise((resolve) => {
      const delay: PendingDelay = {
        timer: null,
        deadline: Date.now() + sec * this.ports.tickMs,
        remainingMs: sec * this.ports.tickMs,
        generation: gen,
        resolve,
      }
      this.pendingDelays.add(delay)
      this.armDelay(delay)
    })
  }

  cancelPendingAsync(): void {
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
      this.ports.emitAutoAdvance(null)
    }
  }

  clearInterludeTimer(): void {
    if (this.interludeTimer) {
      clearTimeout(this.interludeTimer)
      this.interludeTimer = null
    }

    this.interludeDeadline = null
    this.interludeRemainingMs = null
  }

  private armAutoAdvance(): void {
    if (
      this.ports.isPaused() ||
      this.autoAdvanceRemainingMs === null ||
      this.autoAdvanceTotalSeconds === null
    ) {
      return
    }

    this.autoAdvanceDeadline = Date.now() + this.autoAdvanceRemainingMs
    const tick = () => {
      this.autoAdvanceTimer = null

      if (this.ports.isPaused() || this.autoAdvanceDeadline === null) {
        return
      }

      this.autoAdvanceRemainingMs = Math.max(
        0,
        this.autoAdvanceDeadline - Date.now(),
      )
      const seconds = Math.ceil(this.autoAdvanceRemainingMs / this.ports.tickMs)

      if (seconds > 0) {
        this.ports.emitAutoAdvance({
          seconds,
          total: this.autoAdvanceTotalSeconds ?? seconds,
        })
        const delay = Math.max(
          1,
          Math.min(this.ports.tickMs, this.autoAdvanceRemainingMs),
        )
        this.autoAdvanceTimer = setTimeout(tick, delay)

        return
      }

      this.clearAutoAdvance()
      this.ports.advance()
    }
    this.autoAdvanceTimer = setTimeout(
      tick,
      Math.max(1, Math.min(this.ports.tickMs, this.autoAdvanceRemainingMs)),
    )
  }

  scheduleAutoAdvance(delay: number, force = false): void {
    this.clearAutoAdvance()

    if (!force && !this.ports.autoAdvanceEnabled()) {
      return
    }

    this.autoAdvanceRemainingMs = delay * this.ports.tickMs
    this.autoAdvanceTotalSeconds = delay
    this.ports.emitAutoAdvance({ seconds: delay, total: delay })
    this.armAutoAdvance()
  }

  // ── Checkpoint management ────────────────────────────────────────────────

  private armInterludeTimer(): void {
    if (
      this.ports.isPaused() ||
      this.interludeRemainingMs === null ||
      !this.ports.isInterlude()
    ) {
      return
    }

    const gen = this.ports.generation()
    this.interludeDeadline = Date.now() + this.interludeRemainingMs
    this.interludeTimer = setTimeout(() => {
      this.interludeTimer = null
      this.interludeRemainingMs = null
      this.interludeDeadline = null

      if (
        !this.ports.isPaused() &&
        this.ports.generation() === gen &&
        this.ports.isStarted() &&
        this.ports.isInterlude()
      ) {
        this.ports.advance()
      }
    }, this.interludeRemainingMs)
  }

  pause(): void {
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
  }

  resume(): void {
    for (const delay of this.pendingDelays) {
      this.armDelay(delay)
    }
    this.armAutoAdvance()
    this.armInterludeTimer()
  }
  scheduleInterlude(milliseconds: number): void {
    this.interludeRemainingMs = milliseconds
    this.armInterludeTimer()
  }
  remainingCandidates(): Array<number | null> {
    return [
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
    ]
  }
}
