import type { QuizExtrasV2, StudioDefaults } from "@razzia/extensions/core"

/** Keep the editor policy and the existing round-engine policy in one update. */
export function withLeaderboardPolicy(
  extras: QuizExtrasV2,
  policy: StudioDefaults["leaderboardPolicy"],
  everyN?: number,
): QuizExtrasV2 {
  const requestedInterval = everyN ?? extras.leaderboard?.everyN ?? 1
  const interval = Number.isFinite(requestedInterval)
    ? Math.max(1, Math.min(100, Math.trunc(requestedInterval)))
    : 1
  let { leaderboard } = extras

  if (policy === "everyN") {
    leaderboard = { ...leaderboard, mode: policy, everyN: interval }
  } else if (policy === "upstream") {
    leaderboard = { ...leaderboard, mode: policy }
  }

  return {
    ...extras,
    defaults: { ...extras.defaults, leaderboardPolicy: policy },
    leaderboard,
  }
}
