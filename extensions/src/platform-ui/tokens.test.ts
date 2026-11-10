import { describe, expect, it } from "vitest"
import {
  PLATFORM_CONTEXTS,
  SEMANTIC_TOKENS,
  LIGHT_SEMANTIC_TOKENS,
  platformVariables,
  platformTokenCss,
  type PlatformContext,
} from "./tokens"

function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../gu)!
    .map((pair) => parseInt(pair, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}
function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe("platform token boundaries and readable semantic pairs", () => {
  for (const context of [
    ...PLATFORM_CONTEXTS,
    "platform.light-preview",
  ] as const) {
    it(`${context} meets text, action and focus contrast`, () => {
      const tokens =
        context === "platform.light-preview"
          ? LIGHT_SEMANTIC_TOKENS
          : SEMANTIC_TOKENS[context]
      for (const surface of [
        tokens.background,
        tokens.surface,
        tokens.elevated,
      ]) {
        expect(contrast(tokens.text, surface)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(tokens.mutedText, surface)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(tokens.focus, surface)).toBeGreaterThanOrEqual(3)
        for (const status of [
          tokens.danger,
          tokens.success,
          tokens.warning,
          tokens.info,
        ])
          expect(contrast(status, surface)).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(tokens.actionText, tokens.action)).toBeGreaterThanOrEqual(
        4.5,
      )
      expect(contrast(tokens.dangerText, tokens.danger)).toBeGreaterThanOrEqual(
        4.5,
      )
    })
  }
  it("rejects accidental editor/show scope application", () => {
    for (const context of ["editor.current", "show.theme", "body"])
      expect(() => platformVariables(context as PlatformContext)).toThrow()
    expect(platformTokenCss).not.toMatch(
      /(?:^|\})\s*(?:body|:root|button|\*)\s*\{/u,
    )
    expect(platformTokenCss).not.toContain("--show-theme-")
    expect(platformTokenCss).not.toContain("--color-primary")
  })
  it("resolves a scoped override without mutating source tokens or another context", () => {
    const changed = platformVariables("platform.studio", { action: "#abcdef" })
    expect(changed["--tds-action"]).toBe("#abcdef")
    expect(platformVariables("platform.host")["--tds-action"]).toBe(
      SEMANTIC_TOKENS["platform.host"].action,
    )
    expect(SEMANTIC_TOKENS["platform.studio"].action).not.toBe("#abcdef")
    expect(Object.keys(changed).every((key) => key.startsWith("--tds-"))).toBe(
      true,
    )
  })
})
