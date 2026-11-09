/** Registry order is creation order: an owner-bound direct dial follows their newest room. */
export function selectQuizPilotTarget<
  T extends {
    quizId?: string
    started: boolean
    manager: { connected: boolean; clientId: string }
  },
>(
  games: T[],
  quizId: string,
  ownerId?: string,
): { game: T | null; error?: string } {
  const matching = games.filter(
    (game) =>
      game.quizId === quizId && (!ownerId || game.manager.clientId === ownerId),
  )
  const connected = matching.filter((game) => game.manager.connected)
  const candidates = connected.length ? connected : matching

  const latest = candidates.at(-1)

  if (ownerId && latest) {
    return { game: latest }
  }

  if (candidates.length === 1) {
    return { game: candidates[0] }
  }

  return {
    game: null,
    error: candidates.length
      ? "errors:game.ambiguousTargetGame"
      : "errors:game.notFound",
  }
}
