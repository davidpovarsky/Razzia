import commonEn from "../../../../packages/web/src/locales/en/common.json"
import commonFr from "../../../../packages/web/src/locales/fr/common.json"
import commonDe from "../../../../packages/web/src/locales/de/common.json"
import commonEs from "../../../../packages/web/src/locales/es/common.json"
import commonIt from "../../../../packages/web/src/locales/it/common.json"
import commonJa from "../../../../packages/web/src/locales/ja/common.json"
import commonTr from "../../../../packages/web/src/locales/tr/common.json"
import commonVi from "../../../../packages/web/src/locales/vi/common.json"
import { requireLibraryValue } from "../../core/show-library/required"
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
import { createScenePresenterLabels } from "../scene-labels"
import type { ScenePresenterLabels } from "../scene-presenter"
import gameEn from "../../../../packages/web/src/locales/en/game.json"
import gameFr from "../../../../packages/web/src/locales/fr/game.json"
import gameDe from "../../../../packages/web/src/locales/de/game.json"
import gameEs from "../../../../packages/web/src/locales/es/game.json"
import gameIt from "../../../../packages/web/src/locales/it/game.json"
import gameJa from "../../../../packages/web/src/locales/ja/game.json"
import gameTr from "../../../../packages/web/src/locales/tr/game.json"
import gameVi from "../../../../packages/web/src/locales/vi/game.json"

export type PreviewLocale =
  "en" | "fr" | "de" | "es" | "it" | "ja" | "tr" | "vi"

const commonData = {
  en: commonEn,
  fr: commonFr,
  de: commonDe,
  es: commonEs,
  it: commonIt,
  ja: commonJa,
  tr: commonTr,
  vi: commonVi,
}
const localeData = { en, fr, de, es, it, ja, tr, vi }
const gameData = {
  en: gameEn,
  fr: gameFr,
  de: gameDe,
  es: gameEs,
  it: gameIt,
  ja: gameJa,
  tr: gameTr,
  vi: gameVi,
}
const streak = {
  en: "Streak",
  fr: "Série",
  de: "Serie",
  es: "Racha",
  it: "Serie",
  ja: "連続",
  tr: "Seri",
  vi: "Chuỗi",
}

/** A private instance: never changes the application or editor language. */
export function previewNativeLabels(locale: PreviewLocale): {
  labels: TadazzStageLabels
  v4Labels: TadazzV4Labels
  sceneLabels: ScenePresenterLabels
  i18n: ReturnType<typeof createInstance>
} {
  const data = localeData[locale]

  // oxlint-disable-next-line typescript/no-unnecessary-condition -- Runtime callers may supply an unsupported locale despite the static union.
  if (!data) {
    throw new Error("show-preview:unsupported-locale")
  }

  const i18n = createInstance()
  void i18n.init({
    lng: locale,
    fallbackLng: false,
    initAsync: false,
    interpolation: { escapeValue: false },
    resources: {
      [locale]: {
        translation: data.tadazzShow,
        extensions: data,
        game: gameData[locale],
        common: commonData[locale],
      },
    },
  })
  const t = (key: string, vars?: Record<string, unknown>) => i18n.t(key, vars)
  const labels: TadazzStageLabels = {
    questionReady: t("questionReady"),
    votingOpen: t("votingOpen"),
    votesLocked: t("votesLocked"),
    audienceResults: t("audienceResults"),
    audienceFavourite: t("audienceFavourite"),
    jointAudienceFavourite: t("jointAudienceFavourite"),
    correctAnswer: t("correctAnswer"),
    footer: t("footer"),
    leaderboardEyebrow: t("leaderboardEyebrow"),
    leaderboardTitlePrefix: t("leaderboardTitlePrefix"),
    leaderboardTitleAccent: t("leaderboardTitleAccent"),
    champion: t("champion"),
    finaleNoWinner: t("finaleNoWinner"),
    introCaption: t("introCaption"),
    answerChoices: t("answerChoices"),
    answerOption: t("answerOption"),
    streak: streak[locale],
    points: (score) => t("points", { score: score.toLocaleString(locale) }),
    roundLabel: ({ round, number, totalQuestions }) => {
      const n = String(number).padStart(2, "0")
      const question = totalQuestions
        ? t("questionOfTotal", { n, total: totalQuestions })
        : t("questionNumber", { n })

      return round
        ? t("roundPrefix", { round: String(round).padStart(2, "0"), question })
        : question
    },
  }
  const v4Labels = Object.fromEntries(
    Object.keys(TADAZZ_V4_LABELS).map((key) => {
      const shared = [
        "audienceResults",
        "audienceFavourite",
        "jointAudienceFavourite",
        "correctAnswer",
        "votingOpen",
      ].includes(key)

      return [key, t(shared ? key : `v4.${key}`)]
    }),
  ) as unknown as TadazzV4Labels
  const sceneLabels = requireLibraryValue(
    createScenePresenterLabels((key, fallback) =>
      i18n.t(key, { defaultValue: fallback }),
    ),
  )

  return {
    labels,
    v4Labels,
    i18n,
    sceneLabels: {
      ...sceneLabels,
      awaitingHost: i18n.t("extensions:interludes.awaitingHost"),
      skipped: i18n.t("extensions:interludes.skipped"),
      noMedia: i18n.t("extensions:studio.scene.noMedia"),
    },
  }
}
