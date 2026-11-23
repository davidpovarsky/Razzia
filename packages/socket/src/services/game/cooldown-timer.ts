import { EVENTS, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { Server } from "@razzia/common/types/game/socket"
import { PausableCountdown } from "@razzia/extensions/server"
import { SECOND_MS } from "@razzia/socket/utils/sleep"

/** Socket adapter; the downstream scheduler owns pause/resume and cancellation. */
export class CooldownTimer extends PausableCountdown {
  constructor(io: Server, gameId: string) {
    super({
      tickMs: SECOND_MS,
      noTimeLimit: NO_TIME_LIMIT,
      onTick: (seconds) => io.to(gameId).emit(EVENTS.GAME.COOLDOWN, seconds),
    })
  }
}
