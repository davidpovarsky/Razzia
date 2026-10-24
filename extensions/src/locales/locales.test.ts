import { describe, expect, it } from "vitest"
import { EXTENSION_LOCALES, SUPPORTED_EXTENSION_LANGUAGES } from "./index"

type FlatDict = Record<string, string>

const flatten = (obj: Record<string, unknown>, prefix = ""): FlatDict => {
  const result: FlatDict = {}

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (typeof value === "object" && value !== null) {
      Object.assign(result, flatten(value as Record<string, unknown>, fullKey))
    } else if (typeof value === "string") {
      result[fullKey] = value
    }
  }

  return result
}

describe("extensions/locales parity", () => {
  const referenceKeys = Object.keys(flatten(EXTENSION_LOCALES.en)).sort()

  it("has exactly 8 supported languages", () => {
    expect(SUPPORTED_EXTENSION_LANGUAGES).toHaveLength(8)
    expect(Object.keys(EXTENSION_LOCALES).sort()).toEqual(
      [...SUPPORTED_EXTENSION_LANGUAGES].sort(),
    )
  })

  it("reference English dictionary has keys across all sections", () => {
    expect(referenceKeys.length).toBeGreaterThan(30)
    expect(referenceKeys).toContain("tabs.leaderboard")
    expect(referenceKeys).toContain("teams.enableTeams")
    expect(referenceKeys).toContain("audio.cuesTitle")
    expect(referenceKeys).toContain("visuals.revealTitle")
    expect(referenceKeys).toContain("interludes.interludeTitle")
    expect(referenceKeys).toContain("conflict.title")
    expect(referenceKeys).toContain("errors.everyNRequired")
  })

  for (const lang of SUPPORTED_EXTENSION_LANGUAGES) {
    if (lang === "en") {
      continue
    }

    it(`language '${lang}' matches English keys perfectly`, () => {
      const langDict = flatten(EXTENSION_LOCALES[lang])
      const langKeys = Object.keys(langDict).sort()

      const missing = referenceKeys.filter((k) => !langKeys.includes(k))
      const extra = langKeys.filter((k) => !referenceKeys.includes(k))

      expect(missing).toEqual([])
      expect(extra).toEqual([])

      // Also ensure values are non-empty strings
      for (const key of referenceKeys) {
        expect(langDict[key]?.trim().length).toBeGreaterThan(0)
      }
    })
  }
})
