import {
  getExtensionResources,
  registerHostLocaleAdditions,
} from "@razzia/extensions/locales"
import i18n, { type Resource, type ResourceKey } from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"
import { syncDocumentLanguage } from "./language-direction"

const modules = import.meta.glob("./locales/*/*.json", { eager: true })

const resources = Object.entries(modules).reduce<Resource>(
  (acc, [path, mod]) => {
    const match = /\.\/locales\/(\w+)\/(\w+)\.json$/u.exec(path)

    if (!match) {
      return acc
    }

    const [, lang, ns] = match
    acc[lang] ??= {}
    acc[lang][ns] = (mod as { default: ResourceKey }).default

    return acc
  },
  {},
)

// Register each supported language without replacing upstream namespaces.
const extensionResources = getExtensionResources()
registerHostLocaleAdditions(resources)
for (const [lang, nsMap] of Object.entries(extensionResources)) {
  resources[lang] ??= {}
  resources[lang].extensions = nsMap.extensions
}

i18n.on("languageChanged", syncDocumentLanguage)
i18n.on("initialized", () =>
  syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language),
)

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: Object.keys(resources),
    load: "languageOnly",
    defaultNS: "common",
    resources,
    detection: {
      order: ["querystring", "localStorage", "navigator"],
      lookupQuerystring: "lng",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  })

export default i18n
