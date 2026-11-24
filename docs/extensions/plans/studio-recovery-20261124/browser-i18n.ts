import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "../../../../extensions/src/locales/en/extensions.json"
import he from "../../../../extensions/src/locales/he/extensions.json"
import commonEn from "../../../../packages/web/src/locales/en/common.json"
import commonHe from "../../../../packages/web/src/locales/he/common.json"
import quizzEn from "../../../../packages/web/src/locales/en/quizz.json"
import quizzHe from "../../../../packages/web/src/locales/he/quizz.json"
import errorsEn from "../../../../packages/web/src/locales/en/errors.json"
import errorsHe from "../../../../packages/web/src/locales/he/errors.json"

await i18n.use(initReactI18next).init({
  lng: new URL(location.href).searchParams.get("lng") ?? "en",
  fallbackLng: "en",
  defaultNS: "common",
  resources: {
    en: { extensions: en, common: commonEn, quizz: quizzEn, errors: errorsEn },
    he: { extensions: he, common: commonHe, quizz: quizzHe, errors: errorsHe },
  },
  interpolation: { escapeValue: false },
})
document.documentElement.lang = i18n.language
document.documentElement.dir = i18n.dir()

export default i18n
