export class PresentationLaunch {
  private stage: "standby" | "opening" | "lobby" = "standby"
  private startedAt: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  constructor(private readonly onChange: () => void) {}

  /** Only the host's explicit advance begins or skips the opening. */
  advance(): boolean {
    if (this.stage === "lobby") return false
    if (this.stage === "standby") {
      this.stage = "opening"
      this.startedAt = Date.now()
      this.timer = setTimeout(() => this.finish(), 10200)
      this.onChange()
    } else this.finish()
    return true
  }

  private finish() {
    this.dispose()
    this.stage = "lobby"
    this.onChange()
  }

  snapshot(running: boolean) {
    return { stage: running ? "running" as const : this.stage, startedAt: this.startedAt }
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
