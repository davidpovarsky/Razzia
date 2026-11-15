import { createInstance } from "i18next"
import en from "../../locales/en/extensions.json"
import fr from "../../locales/fr/extensions.json"
import de from "../../locales/de/extensions.json"
import es from "../../locales/es/extensions.json"
import it from "../../locales/it/extensions.json"
import ja from "../../locales/ja/extensions.json"
import tr from "../../locales/tr/extensions.json"
import vi from "../../locales/vi/extensions.json"
import type { TadazzStageLabels } from "../tadazz-show/labels"
import { TADAZZ_V4_LABELS, type TadazzV4Labels } from "../tadazz-v4/types"

export type PreviewLocale = "en" | "fr" | "de" | "es" | "it" | "ja" | "tr" | "vi"
const localeData = { en, fr, de, es, it, ja, tr, vi }
const streak = { en: "Streak", fr: "Série", de: "Serie", es: "Racha", it: "Serie", ja: "連続", tr: "Seri", vi: "Chuỗi" }

/** A private instance: never changes the application or editor language. */
export function previewNativeLabels(locale: PreviewLocale): { labels: TadazzStageLabels; v4Labels: TadazzV4Labels } {
  const data = localeData[locale]
  if (!data) throw new Error("show-preview:unsupported-locale")
  const i18n = createInstance()
  void i18n.init({ lng: locale, fallbackLng: false, initImmediate: false, interpolation: { escapeValue: false }, resources: { [locale]: { translation: data.tadazzShow } } })
  const t = (key: string, vars?: Record<string, unknown>) => String(i18n.t(key, vars))
  const labels: TadazzStageLabels = {
    questionReady: t("questionReady"), votingOpen: t("votingOpen"), votesLocked: t("votesLocked"),
    audienceResults: t("audienceResults"), audienceFavourite: t("audienceFavourite"),
    jointAudienceFavourite: t("jointAudienceFavourite"), correctAnswer: t("correctAnswer"),
    footer: t("footer"), leaderboardEyebrow: t("leaderboardEyebrow"), leaderboardTitlePrefix: t("leaderboardTitlePrefix"),
    leaderboardTitleAccent: t("leaderboardTitleAccent"), champion: t("champion"), finaleNoWinner: t("finaleNoWinner"),
    introCaption: t("introCaption"), answerChoices: t("answerChoices"), answerOption: t("answerOption"),
    streak: streak[locale], points: (score) => t("points", { score: score.toLocaleString(locale) }),
    roundLabel: ({ round, number, totalQuestions }) => {
      const n = String(number).padStart(2, "0")
      const question = totalQuestions ? t("questionOfTotal", { n, total: totalQuestions }) : t("questionNumber", { n })
      return round ? t("roundPrefix", { round: String(round).padStart(2, "0"), question }) : question
    },
  }
  const v4Labels = Object.fromEntries(Object.keys(TADAZZ_V4_LABELS).map((key) => {
    const shared = ["audienceResults", "audienceFavourite", "jointAudienceFavourite", "correctAnswer", "votingOpen"].includes(key)
    return [key, t(shared ? key : `v4.${key}`)]
  })) as unknown as TadazzV4Labels
  return { labels, v4Labels }
}
