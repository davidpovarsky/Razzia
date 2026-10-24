import deExtensions from "./de/extensions.json"
import enExtensions from "./en/extensions.json"
import esExtensions from "./es/extensions.json"
import frExtensions from "./fr/extensions.json"
import itExtensions from "./it/extensions.json"
import jaExtensions from "./ja/extensions.json"
import trExtensions from "./tr/extensions.json"
import viExtensions from "./vi/extensions.json"

export const EXTENSION_LOCALES = {
  de: deExtensions,
  en: enExtensions,
  es: esExtensions,
  fr: frExtensions,
  it: itExtensions,
  ja: jaExtensions,
  tr: trExtensions,
  vi: viExtensions,
} as const

export const SUPPORTED_EXTENSION_LANGUAGES = [
  "en",
  "de",
  "es",
  "fr",
  "it",
  "ja",
  "tr",
  "vi",
] as const

export type SupportedExtensionLanguage =
  (typeof SUPPORTED_EXTENSION_LANGUAGES)[number]

/**
 * Returns an i18next-compatible resources map for the "extensions" namespace.
 */
export const getExtensionResources = () => ({
  de: { extensions: deExtensions },
  en: { extensions: enExtensions },
  es: { extensions: esExtensions },
  fr: { extensions: frExtensions },
  it: { extensions: itExtensions },
  ja: { extensions: jaExtensions },
  tr: { extensions: trExtensions },
  vi: { extensions: viExtensions },
})
