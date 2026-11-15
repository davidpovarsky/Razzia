import type { siteLanguages } from "../../locales"

export function matchesCatalogueSearch(
  title: string,
  query: string,
  language: (typeof siteLanguages)[number],
): boolean {
  return title
    .normalize("NFC")
    .toLocaleUpperCase(language)
    .normalize("NFC")
    .includes(
      query.normalize("NFC").toLocaleUpperCase(language).normalize("NFC"),
    )
}
