import { createInstance, type Resource } from "i18next"
import { initReactI18next } from "react-i18next"

export const CATALOG_LOCALES = [
  "en",
  "fr",
  "de",
  "es",
  "it",
  "ja",
  "tr",
  "vi",
] as const
// Read existing resources; the internal catalog never writes shared namespaces.
const files = import.meta.glob<{ default: Record<string, unknown> }>(
  [
    "../../../../packages/web/src/locales/*/common.json",
    "../../../../packages/web/src/locales/*/errors.json",
    "../../../../packages/web/src/locales/*/game.json",
    "../../locales/*/extensions.json",
  ],
  { eager: true },
)
const resources: Resource = {}
for (const [path, resource] of Object.entries(files)) {
  const match = /\/locales\/(\w+)\/(\w+)\.json$/u.exec(path)
  if (!match) continue
  const [, language, namespace] = match
  resources[language] ??= {}
  resources[language][namespace] = resource.default
}
export const catalogI18n = createInstance()
export const catalogReady = catalogI18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  defaultNS: "common",
  resources,
  interpolation: { escapeValue: false },
})
