export interface CountdownPorts {
  tickMs: number
  noTimeLimit: number
  onTick(seconds: number): void
}

/** Server-owned countdown that can be paused without resolving its waiter. */
export class PausableCountdown {
  private readonly ports: CountdownPorts
  private active = false
  private paused = false
  private currentRemaining: number | null = null
  private remainingMilliseconds: number | null = null
  private deadline: number | null = null
  private interval: NodeJS.Timeout | null = null
  private resolveActive: (() => void) | null = null

  constructor(ports: CountdownPorts) {
    this.ports = ports
  }

  get remaining(): number | null {
    return this.active ? this.currentRemaining : null
  }

  get remainingMs(): number | null {
    if (!this.active || this.remainingMilliseconds === null) {
      return null
    }

    if (!this.paused && this.deadline !== null) {
      return Math.max(0, this.deadline - Date.now())
    }

    return this.remainingMilliseconds
  }

  get isPaused(): boolean {
    return this.active && this.paused
  }

  start(seconds: number): Promise<void> {
    if (this.active) {
      return Promise.resolve()
    }

    if (seconds !== this.ports.noTimeLimit && seconds <= 0) {
      return Promise.resolve()
    }

    this.active = true
    this.paused = false
    this.currentRemaining = seconds
    this.remainingMilliseconds =
      seconds === this.ports.noTimeLimit ? null : seconds * this.ports.tickMs
    this.deadline =
      this.remainingMilliseconds === null
        ? null
        : Date.now() + this.remainingMilliseconds

    return new Promise<void>((resolve) => {
      this.resolveActive = resolve
      this.arm()
    })
  }

  pause(): number | null {
    if (!this.active || this.paused) {
      return this.remainingMs
    }

    if (this.deadline !== null) {
      this.remainingMilliseconds = Math.max(0, this.deadline - Date.now())
      this.currentRemaining = Math.ceil(
        this.remainingMilliseconds / this.ports.tickMs,
      )
    }

    this.paused = true
    this.clearInterval()

    return this.remainingMilliseconds
  }

  resume(): boolean {
    if (!this.active || !this.paused) {
      return false
    }

    this.paused = false

    if (this.remainingMilliseconds !== null) {
      this.deadline = Date.now() + this.remainingMilliseconds
    }

    this.arm()

    return true
  }

  abort(): void {
    if (!this.active) {
      return
    }

    // Preserve the historical contract: abort closes acceptance immediately,
    // but the awaiting round advances on the next game tick. Several callers
    // may still classify a duplicate answer during that synchronization tick.
    this.clearInterval()
    this.active = false
    this.paused = false
    this.currentRemaining = null
    this.remainingMilliseconds = null
    this.deadline = null
    const resolve = this.resolveActive
    this.resolveActive = null

    if (resolve) {
      setTimeout(resolve, this.ports.tickMs)
    }
  }

  private arm(): void {
    this.clearInterval()
    const delay =
      this.remainingMilliseconds === null
        ? this.ports.tickMs
        : Math.max(1, Math.min(this.ports.tickMs, this.remainingMilliseconds))
    this.interval = setTimeout(() => {
      this.interval = null
      this.tick()
    }, delay)
  }

  private tick(): void {
    if (!this.active || this.paused) {
      return
    }

    if (this.deadline === null) {
      this.arm()

      return
    }

    this.remainingMilliseconds = Math.max(0, this.deadline - Date.now())
    const seconds = Math.ceil(this.remainingMilliseconds / this.ports.tickMs)
    this.currentRemaining = seconds

    if (this.remainingMilliseconds <= 0) {
      this.finish()

      return
    }

    this.ports.onTick(seconds)
    this.arm()
  }

  private clearInterval(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  private finish(): void {
    this.clearInterval()
    this.active = false
    this.paused = false
    this.currentRemaining = null
    this.remainingMilliseconds = null
    this.deadline = null
    const resolve = this.resolveActive
    this.resolveActive = null
    resolve?.()
  }
}
