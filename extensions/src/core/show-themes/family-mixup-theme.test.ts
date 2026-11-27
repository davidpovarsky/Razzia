import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { familyMixupTheme } from "./family-mixup-theme"
import { showThemeRegistry } from "./registry"
import { resolveShowTheme } from "./resolve"
import { SHOW_THEME_AUDIO_EVENTS, SHOW_THEME_ROLES } from "./selection"
import { SHOW_THEME_LOCALES } from "./definition"
import classic from "./classic.manifest.json" with { type: "json" }

describe("approved Family Mix-Up studio", () => {
  it("registers the bright native theme for all roles and locales", () => {
    expect(showThemeRegistry.get("family-mixup", "1.0.0")).toBeDefined()
    expect(familyMixupTheme.tokens.contrast).toBe(
      "dark-on-light-with-selected-outline",
    )
    expect(familyMixupTheme.tokens.fontId).toBe("rubik")
    for (const locale of SHOW_THEME_LOCALES) {
      expect(
        familyMixupTheme.localizations?.[locale]?.[familyMixupTheme.nameKey],
      ).toBeTruthy()
    }
    for (const role of SHOW_THEME_ROLES) {
      const resolved = resolveShowTheme({
        selection: { id: "family-mixup", version: "1.0.0", overrides: {} },
        role,
      })
      expect(resolved.definition.id).toBe("family-mixup")
      expect(resolved.diagnostics).toEqual([])
    }
  })
  it("retains Tadazz music and all shared playback policies without a second audio owner", () => {
    for (const event of SHOW_THEME_AUDIO_EVENTS) {
      const actual = structuredClone(familyMixupTheme.audioEvents[event])
      actual.defaultVariantId = actual.defaultVariantId.replace(
        /^family-mixup\./u,
        "tadazz-classic.",
      )
      actual.variants.forEach((variant) => {
        variant.id = variant.id.replace(/^family-mixup\./u, "tadazz-classic.")
      })
      expect(actual, event).toEqual(classic.audioEvents[event])
    }
  })
  it("pins every new studio, illustration and video to the actual deployed bytes", () => {
    const assets = familyMixupTheme.assets.filter((asset) =>
      asset.id.startsWith("family-mixup."),
    )
    expect(assets.length).toBeGreaterThan(40)
    expect(assets.filter((asset) => asset.kind === "video")).toHaveLength(9)
    for (const asset of assets) {
      const bytes = readFileSync(
        resolve(
          import.meta.dirname,
          "../../../../packages/web/public",
          asset.url.slice(1),
        ),
      )
      expect(bytes.length, asset.url).toBe(asset.bytes)
      expect(createHash("sha256").update(bytes).digest("hex"), asset.url).toBe(
        asset.sha256,
      )
    }
  })
})
