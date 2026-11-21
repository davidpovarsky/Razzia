import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const languages = ["en", "he", "fr", "de", "es", "it", "ja", "tr", "vi"]
const read = (language: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../locales/clients/${language}.json`, import.meta.url),
      "utf8",
    ),
  ) as Record<string, string>
const english = read("en")
const variables = (value: string) =>
  [...value.matchAll(/\{\{(\w+)\}\}/gu)].map((match) => match[1]).sort()

describe("client access translations", () => {
  it.each(languages)(
    "keeps complete %s copy and interpolation fields",
    (language) => {
      const copy = read(language)
      expect(Object.keys(copy).sort()).toEqual(Object.keys(english).sort())
      for (const [key, value] of Object.entries(copy)) {
        expect(value.trim().length, `${language}:${key}`).toBeGreaterThan(0)
        expect(variables(value), `${language}:${key}`).toEqual(
          variables(english[key]),
        )
      }
    },
  )
})
