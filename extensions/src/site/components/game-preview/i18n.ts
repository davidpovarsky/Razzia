import type { i18n as I18n } from "i18next"
import { previewResources, type PreviewTextKey } from "./resources"

const NAMESPACE = "tadazzGamePreview"

export type PreviewLocale = keyof typeof previewResources

export type PreviewText = (
  key: PreviewTextKey,
  values?: Record<string, string | number>,
) => string

export function previewLocale(instance: I18n): PreviewLocale {
  const candidate = instance.resolvedLanguage?.split("-")[0] ?? "en"

  return Object.hasOwn(previewResources, candidate)
    ? (candidate as PreviewLocale)
    : "en"
}

/** Called only by an enabled Site boundary; no editor/default namespace is replaced. */
export function registerPreviewResources(instance: I18n): void {
  for (const [language, dictionary] of Object.entries(previewResources)) {
    if (!instance.hasResourceBundle(language, NAMESPACE)) {
      instance.addResourceBundle(
        language,
        NAMESPACE,
        { ...dictionary },
        true,
        false,
      )
    }
  }
}

export function createPreviewText(
  instance: I18n,
  locale: PreviewLocale,
): PreviewText {
  return (key, values = {}) =>
    instance.t(key, {
      ns: NAMESPACE,
      nsSeparator: false,
      keySeparator: false,
      defaultValue: previewResources[locale][key],
      ...values,
    })
}
