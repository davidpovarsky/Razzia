import { describe, expect, it } from "vitest"
import billing from "../../locales/billing.json" with { type: "json" }
const flatten = (value: object, prefix = ""): string[] =>
  Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) =>
      typeof child === "string"
        ? [`${prefix}${key}`]
        : flatten(child as object, `${prefix}${key}.`),
    )
    .sort()
describe("billing translations", () => {
  for (const [locale, values] of Object.entries(billing)) {
    it(`${locale} has every key and interpolation`, () => {
      expect(flatten(values)).toEqual(flatten(billing.en))
      const visit = (
        translated: Record<string, unknown>,
        english: Record<string, unknown>,
      ) => {
        for (const [key, original] of Object.entries(english)) {
          if (typeof original === "string") {
            const text = translated[key] as string
            expect(text.trim().length).toBeGreaterThan(0)
            expect((text.match(/\{\{\w+\}\}/gu) ?? []).sort()).toEqual(
              (original.match(/\{\{\w+\}\}/gu) ?? []).sort(),
            )
          } else {
            visit(
              translated[key] as Record<string, unknown>,
              original as Record<string, unknown>,
            )
          }
        }
      }
      visit(values, billing.en)
    })
  }
})
