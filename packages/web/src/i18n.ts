import { getExtensionResources } from "@razzia/extensions/locales"
import i18n, { type Resource, type ResourceKey } from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

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

// Register extensions namespaces for all 8 supported languages
const extensionResources = getExtensionResources()
for (const [lang, nsMap] of Object.entries(extensionResources)) {
  resources[lang] ??= {}
  resources[lang].extensions = nsMap.extensions as unknown as ResourceKey
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    defaultNS: "common",
    resources,
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  })

export default i18n
