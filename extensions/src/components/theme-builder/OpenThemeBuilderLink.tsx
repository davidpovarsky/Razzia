import { useTranslation } from "react-i18next"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"
import { builderText } from "./strings"

/** Narrow navigation only; no editor appearance, draft or live room mutation. */
export function OpenThemeBuilderLink({ className }: { className?: string }) {
  const { i18n } = useTranslation()
  const language = i18n.language.split("-")[0]
  const locale = (
    ["en", "fr", "de", "es", "it", "ja", "tr", "vi", "he"].includes(language)
      ? language
      : "en"
  ) as PreviewLocale
  return (
    <a href="/studio/themes" className={className}>
      {builderText(locale)("title")}
    </a>
  )
}
