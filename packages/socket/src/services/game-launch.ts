import type { QuizzWithId } from "@razzia/common/types/game"
import Game from "./game"
import { getIo } from "./io"
import Registry from "./registry"

// Retry keys are scoped to a host principal and live only with their native room.
const creationRequests = new WeakMap<
  Game,
  { requestId: string; quizId: string }
>()

export class GameCreationRequestConflict extends Error {
  constructor() {
    super("game-creation-request-conflict")
  }
}

/** The same synchronous native creation path serves owner and delegated hosts. */
export function launchNativeGame(input: {
  managerId: string
  quiz: QuizzWithId
  requestId?: string
  delegation?: {
    contentOwnerId: string
    managedClientId: string
    sourceQuizId: string
  }
}): Game {
  const registry = Registry.getInstance()

  if (input.requestId) {
    const existing = registry
      .getAllGames()
      .find(
        (game) =>
          game.manager.clientId === input.managerId &&
          creationRequests.get(game)?.requestId === input.requestId,
      )

    if (existing) {
      if (
        creationRequests.get(existing)?.quizId !== input.quiz.id ||
        existing.contentOwnerId !==
          (input.delegation?.contentOwnerId ?? input.managerId) ||
        existing.managedClientId !== input.delegation?.managedClientId
      ) {
        throw new GameCreationRequestConflict()
      }

      return existing
    }
  }

  const game = new Game(getIo(), input.managerId, input.quiz, input.delegation)
  registry.addGame(game)
  registry.markGameAsEmpty(game)

  if (input.requestId) {
    creationRequests.set(game, {
      requestId: input.requestId,
      quizId: input.quiz.id,
    })
  }

  return game
}
