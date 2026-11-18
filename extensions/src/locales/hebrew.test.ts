import { describe, expect, it } from "vitest"
import { EXTENSION_LOCALES, getExtensionResources } from "./index"

const flatten = (value: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      typeof child === "string"
        ? [[key, child]]
        : Object.entries(flatten(child as Record<string, unknown>)).map(
            ([nested, text]) => [`${key}.${nested}`, text],
          ),
    ),
  )
const placeholders = (text: string) =>
  [...text.matchAll(/\{\{\s*([^}]+)\s*\}\}/gu)].map((match) => match[1]).sort()

describe("Hebrew translation integrity", () => {
  const reference = flatten(getExtensionResources().en.extensions)
  const hebrew = flatten(getExtensionResources().he.extensions)

  it("covers extension, package and billing labels without missing strings", () => {
    expect(Object.keys(hebrew).sort()).toEqual(Object.keys(reference).sort())
    for (const [key, value] of Object.entries(hebrew)) {
      expect(value.trim(), key).not.toBe("")
      expect(placeholders(value), key).toEqual(placeholders(reference[key]))
    }
  })

  it("provides Hebrew editor labels rather than copied English", () => {
    expect(EXTENSION_LOCALES.he.visuals.displayText).toBe("טקסט בלבד")
    expect(EXTENSION_LOCALES.he.editorPreview.title).toBe("תצוגה מקדימה חיה")
    expect(EXTENSION_LOCALES.he.studio.tabs.settings).toBe("הגדרות")
  })
})
