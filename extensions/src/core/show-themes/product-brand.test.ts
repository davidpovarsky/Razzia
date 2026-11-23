import {
  type ShowThemeDefinition,
  showThemeDefinitionSchema,
} from "./definition"
import { expect, it } from "vitest"
import { createShowThemeRegistry, showThemeRegistry } from "./registry"
import { resolveShowTheme, themeSlotAsset } from "./resolve"
import { TADAZZ_PRODUCT_LOGO_URL } from "../product-branding"
it("retains the product logo even when a valid installed family advertises another logo", () => {
  const input = JSON.parse(
    JSON.stringify(showThemeRegistry.classic()).replaceAll(
      "tadazz-classic.",
      "custom-brand.",
    ),
  ) as ShowThemeDefinition
  input.id = "custom-brand"
  input.kind = "declarative"
  input.assets.find(
    (asset: { id: string }) => asset.id === "classic-logo",
  )!.url = "/media/alternate-event-logo.png"
  const registry = createShowThemeRegistry([input])
  const theme = resolveShowTheme({
    role: "manager",
    registry,
    selection: {
      id: "custom-brand",
      version: "1.0.0",
      overrides: {},
    },
  })
  expect(theme.diagnostics).toEqual([])
  expect(themeSlotAsset(theme, "opening", "logoAssetId")).toBe(
    TADAZZ_PRODUCT_LOGO_URL,
  )
})
it("bundles a code-backed Razzia family without replacing Classic or permitting a customer to register native code", () => {
  expect(showThemeRegistry.get("razzia-original", "1.0.0")?.rendererId).toBe(
    "razzia-native-stage",
  )
  expect(showThemeRegistry.classic().id).toBe("tadazz-classic")
  const native = showThemeRegistry.get("razzia-original", "1.0.0")
  expect(
    showThemeDefinitionSchema.safeParse({
      ...native,
      kind: "declarative",
    }).success,
  ).toBe(false)
})
