import { describe, expect, it } from "vitest"
import manifest from "./razzia.manifest.json" with { type: "json" }
import { showThemeDefinitionSchema, showThemeText } from "./definition"

describe("Hebrew theme metadata compatibility", () => {
  it("resolves Hebrew labels for the built-in Razzia theme", () => {
    const parsed = showThemeDefinitionSchema.parse(manifest)
    expect(
      showThemeText(parsed, parsed.nameKey, "he-IL", () => "missing"),
    ).toBe("Razzia המקורי")
  })

  it("keeps an existing eight-locale manifest valid and preserves its fallback", () => {
    const legacy: Record<string, unknown> = structuredClone(
      manifest.localizations,
    )
    delete legacy.he
    const parsed = showThemeDefinitionSchema.parse({
      ...manifest,
      localizations: legacy,
    })
    expect(showThemeText(parsed, parsed.nameKey, "he", () => "missing")).toBe(
      manifest.localizations.en["themes.razziaOriginalName"],
    )
  })

  it("continues rejecting missing original locales or incomplete provided Hebrew labels", () => {
    const original: Record<string, unknown> = structuredClone(
      manifest.localizations,
    )
    delete original.en
    expect(
      showThemeDefinitionSchema.safeParse({
        ...manifest,
        localizations: original,
      }).success,
    ).toBe(false)
    expect(
      showThemeDefinitionSchema.safeParse({
        ...manifest,
        localizations: { ...manifest.localizations, he: {} },
      }).success,
    ).toBe(false)
  })
})
