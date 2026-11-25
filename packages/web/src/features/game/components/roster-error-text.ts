import type { TFunction } from "i18next"

/** Translate parser/API error keys at render time, including after a language change. */
export function localizeRosterError(t: TFunction, key?: string): string {
  const translatedKey = key?.startsWith("errors:extensions.")
    ? key.replace("errors:extensions.", "extensions:roster.errors.")
    : (key ?? "extensions:roster.errors.corruptImportFile")

  return t(translatedKey, {
    defaultValue: t("extensions:roster.errors.corruptImportFile"),
  })
}
