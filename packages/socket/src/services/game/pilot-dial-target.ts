// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import { selectQuizPilotTarget } from "./pilot-target"

/** Protected provider callbacks select an owner from server configuration, never the caller. */
export function selectDialedPilotTarget<
  T extends {
    quizId?: string
    started: boolean
    manager: { connected: boolean; clientId: string }
  },
>(
  games: T[],
  dialedNumber: string,
  configuration: string,
): { game: T | null; error?: string } {
  try {
    const targets = JSON.parse(configuration) as Record<
      string,
      { ownerId?: string; quizId?: string; quizIds?: string[] }
    >
    const target = targets[dialedNumber.replace(/\D/g, "")]

    if (!target?.ownerId) {
      return { game: null, error: "errors:game.notFound" }
    }

    // A server-owned line can serve more than one approved show. Only the
    // configured owner's explicitly allowed quizzes may compete for that line.
    if (target.quizIds !== undefined) {
      if (
        !Array.isArray(target.quizIds) ||
        target.quizIds.length === 0 ||
        target.quizIds.length > 32 ||
        target.quizIds.some((id) => typeof id !== "string" || !id.trim())
      ) {
        return { game: null, error: "errors:game.notFound" }
      }

      const approved = new Set(target.quizIds)
      const matching = games.filter(
        (game) =>
          game.manager.clientId === target.ownerId &&
          game.quizId !== undefined &&
          approved.has(game.quizId),
      )
      const connected = matching.filter((game) => game.manager.connected)
      const latest = (connected.length ? connected : matching).at(-1)

      return latest
        ? { game: latest }
        : { game: null, error: "errors:game.notFound" }
    }

    if (!target.quizId) {
      return { game: null, error: "errors:game.notFound" }
    }

    return selectQuizPilotTarget(games, target.quizId, target.ownerId)
  } catch {
    return { game: null, error: "errors:game.notFound" }
  }
}
