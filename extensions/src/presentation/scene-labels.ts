import type { ScenePresenterProps } from "./scene-presenter"

export function createScenePresenterLabels(
  t: (key: string, fallback: string) => string,
): ScenePresenterProps["labels"] {
  return {
    rankLabel: t("extensions:studio.scene.rankLabel", "Rank"),
    scoreLabel: t("extensions:studio.scene.scoreLabel", "pts"),
    noRankingsYet: t(
      "extensions:studio.scene.noRankingsYet",
      "No player scores yet.",
    ),
    noResponsesYet: t(
      "extensions:studio.scene.noResponsesYet",
      "No responses recorded yet.",
    ),
    votesSuffix: t("extensions:studio.scene.votesSuffix", "votes"),
    advanceButtonLabel: t(
      "extensions:studio.scene.advanceButtonLabel",
      "Next →",
    ),
    intermissionDefaultTitle: t(
      "extensions:studio.scene.intermissionDefaultTitle",
      "Take a Breather",
    ),
    intermissionDefaultSubtitle: t(
      "extensions:studio.scene.intermissionDefaultSubtitle",
      "The next question will begin shortly...",
    ),
    leaderboardDefaultTitle: t(
      "extensions:studio.scene.leaderboardDefaultTitle",
      "Leaderboard",
    ),
    leaderboardDefaultSubtitle: t(
      "extensions:studio.scene.leaderboardDefaultSubtitle",
      "Top scorers right now",
    ),
    interimResultsDefaultTitle: t(
      "extensions:studio.scene.interimResultsDefaultTitle",
      "Interim Results",
    ),
    interimResultsDefaultSubtitle: t(
      "extensions:studio.scene.interimResultsDefaultSubtitle",
      "Latest question breakdown",
    ),
  }
}
