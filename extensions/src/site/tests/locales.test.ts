import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
const read = (language: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../locales/${language}.json`, import.meta.url)),
      "utf8",
    ),
  ) as Record<string, string>
const variables = (value: string) =>
  [...value.matchAll(/\{\{(\w+)\}\}/gu)].map((match) => match[1]).sort()
describe("site locale contract", () => {
  const en = read("en")
  for (const language of ["fr", "de", "es", "it", "ja", "tr", "vi"]) {
    it(`${language} covers all site keys and preserves interpolation`, () => {
      const dictionary = read(language)
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort())
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim(), key).not.toBe("")
        expect(variables(value), key).toEqual(variables(en[key]))
      }
    })
  }
})
