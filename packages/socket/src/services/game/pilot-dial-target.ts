// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import {
  getLobbyPhoneRegion,
  type LobbyPhoneRegion,
} from "@razzia/extensions/core"
import { selectQuizPilotTarget } from "./pilot-target"

interface DialPilotGame {
  quizId?: string
  started: boolean
  contentOwnerId?: string
  manager: { connected: boolean; clientId: string }
}

/** Protected provider callbacks select an owner from server configuration, never the caller. */
export function selectDialedPilotTarget<T extends DialPilotGame>(
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
          (game.contentOwnerId ?? game.manager.clientId) === target.ownerId &&
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

/** Expose a routed line only when a call to that exact line would join this room. */
export function resolvePublicDialNumber<T extends DialPilotGame>(
  games: T[],
  room: T,
  options: { configuration: string | undefined; region?: LobbyPhoneRegion },
): string | undefined {
  const { configuration, region = "auto" } = options

  if (!configuration) {
    return undefined
  }

  try {
    const targets: unknown = JSON.parse(configuration)

    if (!targets || typeof targets !== "object" || Array.isArray(targets)) {
      return undefined
    }

    const numbers = Object.keys(targets).filter(
      (number) =>
        /^\d{5,20}$/u.test(number) &&
        (region === "auto" || getLobbyPhoneRegion(number) === region) &&
        selectDialedPilotTarget(games, number, configuration).game === room,
    )

    const number =
      numbers.length === 1
        ? numbers[0]
        : (numbers.find(
            (candidate) => getLobbyPhoneRegion(candidate) === "il",
          ) ??
          numbers.find((candidate) => getLobbyPhoneRegion(candidate) === "uk"))

    // Inbound routing keys contain only digits. Restore the international
    // prefix for callers while keeping nationally formatted lines intact.
    return number?.match(/^(?:44[0-9]{10}|972[2-9][0-9]{7,8})$/u)
      ? `+${number}`
      : number
  } catch {
    return undefined
  }
}
