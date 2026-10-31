import { EVENTS, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { Server } from "@razzia/common/types/game/socket"
import { SECOND_MS } from "@razzia/socket/utils/sleep"

export class CooldownTimer {
  private readonly io: Server
  private readonly gameId: string
  private active = false
  private currentRemaining: number | null = null

  constructor(io: Server, gameId: string) {
    this.io = io
    this.gameId = gameId
  }

  get remaining(): number | null {
    return this.active ? this.currentRemaining : null
  }

  start(seconds: number): Promise<void> {
    if (this.active) {
      return Promise.resolve()
    }

    this.active = true
    this.currentRemaining = seconds

    if (seconds === NO_TIME_LIMIT) {
      return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (!this.active) {
            clearInterval(interval)
            this.currentRemaining = null
            resolve()
          }
        }, SECOND_MS)
      })
    }

    let count = seconds - 1

    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (!this.active || count <= 0) {
          this.active = false
          this.currentRemaining = null
          clearInterval(interval)
          resolve()

          return
        }

        this.currentRemaining = count
        this.io.to(this.gameId).emit(EVENTS.GAME.COOLDOWN, count)
        count -= 1
      }, SECOND_MS)
    })
  }

  abort() {
    this.active = false
    this.currentRemaining = null
  }
}
