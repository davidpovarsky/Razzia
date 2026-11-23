import { EVENTS } from "@razzia/common/constants"
import type { Socket } from "@razzia/common/types/game/socket"
import type Game from "@razzia/socket/services/game"
import type Registry from "@razzia/socket/services/registry"
import { withManagerGame } from "@razzia/socket/utils/game"

/** Downstream transport registration retains the canonical manager authorization. */
export function registerGameExtensionHandlers(
  socket: Socket,
  registry: Registry,
): void {
  socket.on("extensions:clock", (ack) => {
    if (typeof ack === "function") {
      ack(Date.now())
    }
  })

  socket.on(EVENTS.EXTENSIONS.COMMAND, (command, ack) =>
    withManagerGame(command.gameId, socket, (game) => {
      try {
        const result = game.handleExtensionCommand(command)
        ack?.(result)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        ack?.({ success: false, error: message })
        socket.emit(EVENTS.GAME.ERROR_MESSAGE, message)
      }
    }),
  )

  socket.on(
    EVENTS.SPECTATOR.JOIN,
    ({ gameId, inviteCode }: { gameId?: string; inviteCode?: string }) => {
      let game: Game | undefined = undefined

      if (gameId) {
        game = registry.getGameById(gameId)
      } else if (inviteCode) {
        game = registry.getGameByInviteCode(inviteCode)
      }

      if (!game) {
        socket.emit(EVENTS.GAME.RESET, "errors:game.notFound")

        return
      }

      game.joinSpectator(socket)
    },
  )

  socket.on(EVENTS.SPECTATOR.LEAVE, ({ gameId }: { gameId?: string }) => {
    const game = gameId
      ? registry.getGameById(gameId)
      : registry.getGameBySpectatorSocketId(socket.id)

    if (game) {
      game.leaveSpectator(socket)
    }
  })
}
