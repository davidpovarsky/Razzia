import { useMemo, type ReactNode } from "react"
import { I18nextProvider, useTranslation } from "react-i18next"

/** The game language owns both translations and browser writing direction. */
export function PresentationLocale({
  locale: requestedLocale,
  children,
}: {
  locale?: unknown
  children: ReactNode
}) {
  const { i18n } = useTranslation()
  const locale =
    typeof requestedLocale === "string" &&
    ["en", "fr", "de", "es", "it", "ja", "tr", "vi", "he"].includes(
      requestedLocale,
    )
      ? requestedLocale
      : undefined
  const presentationI18n = useMemo(
    () =>
      locale ? i18n.cloneInstance({ lng: locale, initAsync: false }) : i18n,
    [i18n, locale],
  )
  const language =
    locale ?? presentationI18n.resolvedLanguage ?? presentationI18n.language

  return (
    <I18nextProvider i18n={presentationI18n}>
      <div
        dir={presentationI18n.dir(language)}
        lang={language}
        style={{ display: "contents" }}
        data-testid="tadazz-presentation-locale"
      >
        {children}
      </div>
    </I18nextProvider>
  )
}
