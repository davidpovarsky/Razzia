/** Prefer the connected host's live show; never guess between two active hosts. */
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
  const started = connected.filter((game) => game.started)
  const candidates = started.length
    ? started
    : connected.length
      ? connected
      : matching
  if (candidates.length === 1) return { game: candidates[0] }
  return {
    game: null,
    error: candidates.length
      ? "errors:game.ambiguousTargetGame"
      : "errors:game.notFound",
  }
}
