import {
  DEFAULT_TADAZZ_STAGE_LABELS,
  type TadazzStageLabels,
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
