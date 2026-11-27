import type { siteLanguages } from "../../locales"

export function matchesCatalogueSearch(
  title: string,
  query: string,
  language: (typeof siteLanguages)[number],
): boolean {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/\s+/gu, " ")
      .normalize("NFC")
      .toLocaleUpperCase(language)
      .normalize("NFC")

  return normalize(title).includes(normalize(query))
}
