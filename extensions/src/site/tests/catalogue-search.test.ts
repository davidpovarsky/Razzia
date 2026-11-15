import { describe, expect, it } from "vitest"
import { matchesCatalogueSearch } from "../web/marketing/catalogue-search"

describe("catalogue search", () => {
  it("matches the reported Turkish and German uppercase queries", () => {
    expect(
      matchesCatalogueSearch(
        "Kararı kalabalık verir",
        "KARARI KALABALIK VERİR",
        "tr",
      ),
    ).toBe(true)
    expect(
      matchesCatalogueSearch("Das große Quiz", "DAS GROSSE QUIZ", "de"),
    ).toBe(true)
  })

  it("preserves Turkish dotted and dotless distinctions", () => {
    expect(matchesCatalogueSearch("ışık", "IŞIK", "tr")).toBe(true)
    expect(matchesCatalogueSearch("ışık", "İŞİK", "tr")).toBe(false)
    expect(matchesCatalogueSearch("izmir", "İZMİR", "tr")).toBe(true)
    expect(matchesCatalogueSearch("izmir", "IZMIR", "tr")).toBe(false)
  })

  it("matches canonically equivalent text and non-Latin titles", () => {
    expect(matchesCatalogueSearch("Café", "CAFE\u0301", "fr")).toBe(true)
    expect(matchesCatalogueSearch("Café", "CAFE", "fr")).toBe(false)
    expect(matchesCatalogueSearch("クイズ大会", "クイズ", "ja")).toBe(true)
    expect(matchesCatalogueSearch("クイズ大会", "質問", "ja")).toBe(false)
  })
})
