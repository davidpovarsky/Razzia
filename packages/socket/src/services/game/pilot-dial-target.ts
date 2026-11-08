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
      { ownerId?: string; quizId?: string }
    >
    const target = targets[dialedNumber.replace(/\D/g, "")]
    if (!target?.ownerId || !target.quizId)
      return { game: null, error: "errors:game.notFound" }
    return selectQuizPilotTarget(games, target.quizId, target.ownerId)
  } catch {
    return { game: null, error: "errors:game.notFound" }
  }
}
