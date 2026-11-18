import { afterEach, describe, expect, it, vi } from "vitest"
import { languageDirection, syncDocumentLanguage } from "./language-direction"

afterEach(() => vi.unstubAllGlobals())

describe("application language direction", () => {
  it.each(["he", "he-IL", "HE-il", "iw"])("uses RTL for %s", (locale) => {
    expect(languageDirection(locale)).toBe("rtl")
  })

  it.each(["en", "fr", "de", "es", "it", "ja", "tr", "vi"])(
    "preserves LTR for %s",
    (locale) => expect(languageDirection(locale)).toBe("ltr"),
  )

  it("updates language and direction together when switching back to English", () => {
    const element = { lang: "en", dir: "ltr" }
    vi.stubGlobal("document", { documentElement: element })
    syncDocumentLanguage("he-IL")
    expect(element).toEqual({ lang: "he", dir: "rtl" })
    syncDocumentLanguage("en-GB")
    expect(element).toEqual({ lang: "en", dir: "ltr" })
  })

  it("is safe in a server render without a document", () => {
    vi.stubGlobal("document", undefined)
    expect(() => syncDocumentLanguage("he")).not.toThrow()
  })
})
