import type { ResultMeta } from "./Events"
import type { QuizMeta } from "./MyGames"

function timestamp(date: string | undefined) {
  const value = date ? Date.parse(date) : 0

  return Number.isFinite(value) ? value : 0
}

export function recentStudioGames(
  games: readonly QuizMeta[],
  results: readonly ResultMeta[],
) {
  const activity = new Map(
    games.map(({ id, updatedAt }) => [id, timestamp(updatedAt)]),
  )
  const uniqueSubjects = new Map<string, string | null>()

  for (const { id, subject } of games) {
    uniqueSubjects.set(subject, uniqueSubjects.has(subject) ? null : id)
  }

  for (const result of results) {
    // Legacy results had only a title. A duplicate title cannot identify a quiz.
    const id = result.quizId ?? uniqueSubjects.get(result.subject)

    if (id && activity.has(id)) {
      activity.set(id, Math.max(activity.get(id) ?? 0, timestamp(result.date)))
    }
  }

  return [...games].sort(
    (a, b) => (activity.get(b.id) ?? 0) - (activity.get(a.id) ?? 0),
  )
}
