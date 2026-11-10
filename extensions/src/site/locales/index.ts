import "@razzia/web/i18n"
import i18n from "i18next"
import { useTranslation } from "react-i18next"

export const siteLanguages = [
  "en",
  "fr",
  "de",
  "es",
  "it",
  "ja",
  "tr",
  "vi",
] as const

// Register resources without replacing any upstream namespace.
const resources = import.meta.glob<{ default: Record<string, string> }>(
  "./*.json",
  { eager: true },
)
for (const language of siteLanguages) {
  i18n.addResourceBundle(
    language,
    "tadazzSite",
    resources[`./${language}.json`].default,
    true,
    true,
  )
}

export const siteText = (
  key: string,
  values: Record<string, string | number> = {},
) =>
  i18n.t(key, {
    ns: "tadazzSite",
    nsSeparator: false,
    keySeparator: false,
    ...values,
  })

export function useSiteText() {
  useTranslation("tadazzSite")

  return siteText
}
