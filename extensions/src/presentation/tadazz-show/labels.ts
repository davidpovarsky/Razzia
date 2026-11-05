/**
 * User-facing stage strings. English defaults are the exact strings of the
 * canonical TADAZZ Motion Kit; the game shell supplies i18next translations
 * (8 project locales) through `labels` overrides.
 */
export interface TadazzStageLabels {
  questionReady: string
  votingOpen: string
  votesLocked: string
  audienceResults: string
  audienceFavourite: string
  jointAudienceFavourite: string
  correctAnswer: string
  footer: string
  leaderboardEyebrow: string
  leaderboardTitlePrefix: string
  leaderboardTitleAccent: string
  champion: string
  finaleNoWinner: string
  introCaption: string
  answerChoices: string
  answerOption: string
  streak: string
  points: (score: number) => string
  roundLabel: (q: { round?: number | null; number: number; totalQuestions: number | null }) => string
}

const pad2 = (n: number) => String(n).padStart(2, "0")

export const DEFAULT_TADAZZ_STAGE_LABELS: TadazzStageLabels = {
  questionReady: "QUESTION READY",
  votingOpen: "VOTING OPEN",
  votesLocked: "VOTES LOCKED · AWAIT REVEAL",
  audienceResults: "AUDIENCE RESULTS",
  audienceFavourite: "AUDIENCE FAVOURITE",
  jointAudienceFavourite: "JOINT AUDIENCE FAVOURITE",
  correctAnswer: "CORRECT ANSWER",
  footer: "TADAZZ · THE AUDIENCE DECIDES",
  leaderboardEyebrow: "THE AUDIENCE HAS SPOKEN",
  leaderboardTitlePrefix: "THE ",
  leaderboardTitleAccent: "LEADERBOARD",
  champion: "THE CHAMPION",
  finaleNoWinner: "THANK YOU FOR PLAYING",
  introCaption: "THE AUDIENCE DECIDES",
  answerChoices: "Answer choices",
  answerOption: "Answer option",
  streak: "Streak",
  points: (score) => `${Number(score).toLocaleString("en-US")} POINTS`,
  roundLabel: ({ round, number, totalQuestions }) => {
    const question = `QUESTION ${pad2(number || 1)}${totalQuestions ? ` / ${totalQuestions}` : ""}`
    return round ? `ROUND ${pad2(round)} · ${question}` : question
  },
}
