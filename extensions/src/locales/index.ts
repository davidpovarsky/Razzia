import deExtensions from "./de/extensions.json" with { type: "json" }
import billing from "./billing.json" with { type: "json" }
import packages from "./packages.json" with { type: "json" }
import enExtensions from "./en/extensions.json" with { type: "json" }
import esExtensions from "./es/extensions.json" with { type: "json" }
import frExtensions from "./fr/extensions.json" with { type: "json" }
import itExtensions from "./it/extensions.json" with { type: "json" }
import jaExtensions from "./ja/extensions.json" with { type: "json" }
import trExtensions from "./tr/extensions.json" with { type: "json" }
import viExtensions from "./vi/extensions.json" with { type: "json" }

export { registerHostLocaleAdditions } from "./host-additions"

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
  de: {
    extensions: { ...deExtensions, billing: billing.de, packages: packages.de },
  },
  en: {
    extensions: { ...enExtensions, billing: billing.en, packages: packages.en },
  },
  es: {
    extensions: { ...esExtensions, billing: billing.es, packages: packages.es },
  },
  fr: {
    extensions: { ...frExtensions, billing: billing.fr, packages: packages.fr },
  },
  it: {
    extensions: { ...itExtensions, billing: billing.it, packages: packages.it },
  },
  ja: {
    extensions: { ...jaExtensions, billing: billing.ja, packages: packages.ja },
  },
  tr: {
    extensions: { ...trExtensions, billing: billing.tr, packages: packages.tr },
  },
  vi: {
    extensions: { ...viExtensions, billing: billing.vi, packages: packages.vi },
  },
})
