import {
  DEFAULT_TADAZZ_STAGE_LABELS,
  TADAZZ_V4_LABELS,
  type TadazzStageLabels,
  type TadazzV4Labels,
} from "@razzia/extensions/presentation"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

const K = "extensions:tadazzShow"

/** i18next labels for the TADAZZ stage (English defaults = canonical strings). */
export function useTadazzStageLabels(): TadazzStageLabels {
  const { t, i18n } = useTranslation()
  return useMemo(() => {
    const d = DEFAULT_TADAZZ_STAGE_LABELS
    const tx = (key: string, fallback: string) => t(`${K}.${key}`, fallback)
    return {
      questionReady: tx("questionReady", d.questionReady),
      votingOpen: tx("votingOpen", d.votingOpen),
      votesLocked: tx("votesLocked", d.votesLocked),
      audienceResults: tx("audienceResults", d.audienceResults),
      audienceFavourite: tx("audienceFavourite", d.audienceFavourite),
      jointAudienceFavourite: tx("jointAudienceFavourite", d.jointAudienceFavourite),
      correctAnswer: tx("correctAnswer", d.correctAnswer),
      footer: tx("footer", d.footer),
      leaderboardEyebrow: tx("leaderboardEyebrow", d.leaderboardEyebrow),
      leaderboardTitlePrefix: tx("leaderboardTitlePrefix", d.leaderboardTitlePrefix),
      leaderboardTitleAccent: tx("leaderboardTitleAccent", d.leaderboardTitleAccent),
      champion: tx("champion", d.champion),
      finaleNoWinner: tx("finaleNoWinner", d.finaleNoWinner),
      introCaption: tx("introCaption", d.introCaption),
      answerChoices: tx("answerChoices", d.answerChoices),
      answerOption: tx("answerOption", d.answerOption),
      streak: t("game:streak", d.streak),
      points: (score: number) =>
        t(`${K}.points`, {
          defaultValue: "{{score}} POINTS",
          score: Number(score).toLocaleString("en-US"),
        }),
      roundLabel: ({ round, number, totalQuestions }) => {
        const n = String(number || 1).padStart(2, "0")
        const question = totalQuestions
          ? t(`${K}.questionOfTotal`, { defaultValue: "QUESTION {{n}} / {{total}}", n, total: totalQuestions })
          : t(`${K}.questionNumber`, { defaultValue: "QUESTION {{n}}", n })
        return round
          ? t(`${K}.roundPrefix`, { defaultValue: "ROUND {{round}} · {{question}}", round: String(round).padStart(2, "0"), question })
          : question
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, i18n.language])
}

/** Shell strings (lobby, waiting, player pad…). */
export function useTadazzShellText() {
  const { t } = useTranslation()
  return (key: string, fallback: string, vars?: Record<string, unknown>) =>
    t(`${K}.${key}`, { defaultValue: fallback, ...vars })
}

/** i18next labels for the TADAZZ v4 stage kit (English defaults = canonical v4 strings). */
export function useTadazzV4Labels(): Partial<TadazzV4Labels> {
  const { t, i18n } = useTranslation()
  return useMemo(() => {
    const d = TADAZZ_V4_LABELS
    const tx = (key: keyof TadazzV4Labels) => t(`${K}.v4.${key}`, d[key])
    return {
      nextQuestion: tx("nextQuestion"),
      storyBuild: tx("storyBuild"),
      storyReady: tx("storyReady"),
      storyTime: tx("storyTime"),
      storyUnfolds: tx("storyUnfolds"),
      storyNow: tx("storyNow"),
      storyTitle: tx("storyTitle"),
      storyRound: tx("storyRound"),
      focus: tx("focus"),
      chooseOne: tx("chooseOne"),
      votesLocked: tx("votesLocked"),
      choiceSelected: tx("choiceSelected"),
      timeLeft: tx("timeLeft"),
      mostChosenAnswer: tx("mostChosenAnswer"),
      liveStandings: tx("liveStandings"),
      teamLeaderboard: tx("teamLeaderboard"),
      leaderboard: tx("leaderboard"),
      roundRecap: tx("roundRecap"),
      storyBegin: tx("storyBegin"),
      upNext: tx("upNext"),
      lookClosely: tx("lookClosely"),
      noVotes: tx("noVotes"),
      points: tx("points"),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, i18n.language])
}
