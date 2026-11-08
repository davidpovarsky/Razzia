import { TADAZZ_PRODUCT_LOGO_URL } from "../product-branding"
import type { ShowThemeDefinition } from "./definition"
import { ShowThemeRegistry, showThemeRegistry } from "./registry"
import {
  SHOW_THEME_AUDIO_EVENTS,
  SHOW_THEME_SLOTS,
  createDefaultShowTheme,
  showThemeSelectionSchema,
  scopedThemeOverridesSchema,
  type ShowThemeRole,
  type ShowThemeSelection,
  type ThemeOverrides,
} from "./selection"

export interface ThemeDiagnostic {
  code:
    | "unknown-theme"
    | "invalid-selection"
    | "incompatible-scope"
    | "invalid-variant"
    | "disallowed-media"
  slot?: string
}

export interface ResolvedShowTheme {
  role: ShowThemeRole
  scopeOverrides: ThemeOverrides
  audioSelections: NonNullable<ThemeOverrides["audio"]>
  definition: ShowThemeDefinition
  requested: ShowThemeSelection
  diagnostics: ThemeDiagnostic[]
  slots: Record<
    (typeof SHOW_THEME_SLOTS)[number],
    ShowThemeDefinition["slots"]["question"]["variants"][number] & {
      mediaUrl?: string
      fit?: "cover" | "contain"
    }
  >
  audio: Record<
    (typeof SHOW_THEME_AUDIO_EVENTS)[number],
    ShowThemeDefinition["audioEvents"]["opening"]["variants"][number] & {
      url?: string
    }
  >
}

const isCustomMedia = (url: string) =>
  url.startsWith("/media/") || url.startsWith("https://")
function mergeSelections<T extends { variantId?: string; mediaUrl?: string }>(
  ...sources: Array<T | undefined>
): T {
  let result = {} as T
  for (const source of sources) {
    if (!source) {
      continue
    }
    // Choosing a new source replaces the earlier source's volume/fit/mute too.

    if (source.variantId !== undefined || source.mediaUrl !== undefined) {
      result = {} as T
    }

    Object.assign(result, source)
  }

  return result
}

/** No side effects, network, game state or locale dependence. Unknown IDs remain in requested. */
export function resolveShowTheme(input: {
  selection?: unknown
  scope?: unknown
  role: ShowThemeRole
  registry?: ShowThemeRegistry
}): ResolvedShowTheme {
  const registry = input.registry ?? showThemeRegistry
  const parsed = showThemeSelectionSchema.safeParse(
    input.selection ?? createDefaultShowTheme(),
  )
  const requested = parsed.success ? parsed.data : createDefaultShowTheme()
  const diagnostics: ThemeDiagnostic[] = parsed.success
    ? []
    : [{ code: "invalid-selection" }]
  const installed = registry.get(requested.id, requested.version)
  const definition = installed ?? registry.classic()

  if (!installed) {
    diagnostics.push({ code: "unknown-theme" })
  }

  const scoped = scopedThemeOverridesSchema.safeParse(input.scope)
  const activeScope = scoped.success
    ? [scoped.data, ...(scoped.data.history ?? [])].find(
        (item) =>
          item.themeId === requested.id &&
          item.themeVersion === requested.version,
      )
    : undefined
  const scopeMatches = Boolean(activeScope && installed)

  if (input.scope !== undefined && !scopeMatches) {
    diagnostics.push({ code: "incompatible-scope" })
  }

  const show = installed ? requested.overrides : {}
  const scope: ThemeOverrides =
    scopeMatches && activeScope ? activeScope.overrides : {}
  const assetUrl = (assetId: string | undefined) =>
    definition.assets.find((asset) => asset.id === assetId)?.url
  const slots = Object.fromEntries(
    SHOW_THEME_SLOTS.map((slot) => {
      const spec = definition.slots[slot]
      const choice = mergeSelections(
        show.slots?.[slot],
        show.roles?.[input.role]?.slots?.[slot],
        scope.slots?.[slot],
        scope.roles?.[input.role]?.slots?.[slot],
      )
      const selected = spec.variants.find(
        (variant) => variant.id === choice.variantId,
      )
      const fallback =
        spec.variants.find((variant) => variant.id === spec.defaultVariantId) ??
        spec.variants[0]

      if (choice.variantId && !selected) {
        diagnostics.push({ code: "invalid-variant", slot })
      }

      let { mediaUrl } = choice

      if (
        mediaUrl &&
        (spec.customMedia === "none" || !isCustomMedia(mediaUrl))
      ) {
        diagnostics.push({ code: "disallowed-media", slot })
        mediaUrl = undefined
      }

      return [
        slot,
        {
          ...(selected ?? fallback),
          ...(mediaUrl ? { mediaUrl, fit: choice.fit ?? "cover" } : {}),
        },
      ]
    }),
  ) as ResolvedShowTheme["slots"]
  const audioSelections: NonNullable<ThemeOverrides["audio"]> = {}
  const audio = Object.fromEntries(
    SHOW_THEME_AUDIO_EVENTS.map((event) => {
      const spec = definition.audioEvents[event]
      const choice = mergeSelections(
        show.audio?.[event],
        show.roles?.[input.role]?.audio?.[event],
        scope.audio?.[event],
        scope.roles?.[input.role]?.audio?.[event],
      )
      audioSelections[event] = choice
      const selected = spec.variants.find(
        (variant) => variant.id === choice.variantId,
      )
      const fallback =
        spec.variants.find((variant) => variant.id === spec.defaultVariantId) ??
        spec.variants[0]

      if (choice.variantId && !selected) {
        diagnostics.push({ code: "invalid-variant", slot: event })
      }

      const variant = selected ?? fallback
      const permittedMedia =
        choice.mediaUrl && spec.customMedia && isCustomMedia(choice.mediaUrl)

      if (choice.mediaUrl && !permittedMedia) {
        diagnostics.push({ code: "disallowed-media", slot: event })
      }

      const silent =
        choice.muted === true ||
        !variant.roles.includes(input.role) ||
        (variant.silent && !permittedMedia)
      const url = permittedMedia ? choice.mediaUrl : assetUrl(variant.assetId)

      return [
        event,
        {
          ...variant,
          silent,
          volume: choice.volume ?? variant.volume,
          url: silent ? undefined : url,
        },
      ]
    }),
  ) as ResolvedShowTheme["audio"]

  return {
    definition,
    requested,
    diagnostics,
    slots,
    audio,
    role: input.role,
    audioSelections,
    scopeOverrides: scope,
  }
}

export function themeSlotAsset(
  theme: ResolvedShowTheme,
  slot: (typeof SHOW_THEME_SLOTS)[number],
  kind: "backgroundAssetId" | "logoAssetId" | "mediaAssetId" | "overlayAssetId",
): string | undefined {
  if (kind === "logoAssetId") {
    return TADAZZ_PRODUCT_LOGO_URL
  }

  const selection = theme.slots[slot]

  if (kind === "backgroundAssetId" && selection.mediaUrl) {
    return selection.mediaUrl
  }

  return theme.definition.assets.find((asset) => asset.id === selection[kind])
    ?.url
}

/** Scope resets remove only theme overrides; metadata and other scopes survive. */
export function resetThemeScope(
  selection: ShowThemeSelection,
): ShowThemeSelection {
  return { ...selection, overrides: {}, legacyPolicy: "theme-defaults" }
}

/** Theme changes require the editor to keep or discard incompatible scopes explicitly. */
export function planThemeChange(
  current: ShowThemeSelection,
  next: ShowThemeSelection,
) {
  return {
    next,
    previous: structuredClone(current),
    requiresConfirmation:
      current.id !== next.id && Object.keys(current.overrides).length > 0,
  }
}
