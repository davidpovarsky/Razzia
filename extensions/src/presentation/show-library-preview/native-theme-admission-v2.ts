import {
  nativePreviewThemeBindingV2Schema,
  type NativePreviewThemeBindingV2,
} from "../../core/show-library/native-preview-renderer-v2-schema"
import { SHOW_THEME_SLOTS } from "../../core/show-themes/selection"
import { showThemeRegistry } from "../../core/show-themes/registry"
import { resolveShowTheme } from "../../core/show-themes/resolve"

export interface BuiltNativeDefinitionV2 {
  id: string
  version: string
  rendererId: string
  definitionSha256: string
}

/**
 * The build supplies hashes computed from its actual parsed bundled manifests.
 * Caller-supplied definitions, variant prefixes and host readiness are insufficient.
 */

export function resolveBundledPreviewThemeV2(
  input: NativePreviewThemeBindingV2,
  builtDefinitions: readonly BuiltNativeDefinitionV2[],
) {
  const binding = nativePreviewThemeBindingV2Schema.parse(input)
  const definition = showThemeRegistry.get(
    binding.theme.id,
    binding.theme.version,
  )
  const exact = builtDefinitions.filter(
    (entry) =>
      entry.id === binding.theme.id && entry.version === binding.theme.version,
  )

  if (
    !definition ||
    exact.length !== 1 ||
    exact[0]?.definitionSha256 !== binding.definitionSha256 ||
    exact[0]?.rendererId !== definition.rendererId ||
    binding.rendererId !== definition.rendererId
  ) {
    throw new Error("show-preview:unbuilt-native-definition")
  }

  for (const slot of SHOW_THEME_SLOTS) {
    if (
      !definition.slots[slot].variants.some(
        (variant) => variant.id === binding.slots[slot].variantId,
      )
    ) {
      throw new Error("show-preview:unbuilt-native-variant")
    }
  }
  const theme = resolveShowTheme({
    role: binding.role,
    selection: { ...binding.theme, overrides: { slots: binding.slots } },
  })

  if (theme.diagnostics.length) {
    throw new Error("show-preview:native-theme-resolution")
  }

  return theme
}
