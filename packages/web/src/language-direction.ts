/** Direction is a UI preference; saved questions and media keep their own content. */
export function languageDirection(language: string): "ltr" | "rtl" {
  return /^(?:he|iw)(?:-|$)/iu.test(language) ? "rtl" : "ltr"
}

export function syncDocumentLanguage(language: string): void {
  if (typeof document === "undefined") {
    return
  }

  const normalized = language.toLowerCase().split("-")[0] || "en"
  document.documentElement.lang = normalized === "iw" ? "he" : normalized
  document.documentElement.dir = languageDirection(language)
}
