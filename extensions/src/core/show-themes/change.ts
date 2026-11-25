import type { ShowThemeDefinition } from "./definition"
import {
  SHOW_THEME_AUDIO_EVENTS,
  SHOW_THEME_ROLES,
  isSafeThemeAssetUrl,
  type ShowThemeAudioEvent,
  type ShowThemeSelection,
  type ThemeOverrides,
} from "./selection"

type AudioSelection = NonNullable<ThemeOverrides["audio"]>[ShowThemeAudioEvent]

function portableAudio({
  choice,
  event,
  previous,
  next,
}: {
  choice: NonNullable<AudioSelection>
  event: ShowThemeAudioEvent
  previous: ShowThemeDefinition
  next: ShowThemeDefinition
}): AudioSelection {
  const sourceVariant = previous.audioEvents[event].variants.find(
    (variant) => variant.id === choice.variantId,
  )
  const url =
    choice.mediaUrl ??
    previous.assets.find((asset) => asset.id === sourceVariant?.assetId)?.url
  const settings = {
    ...(choice.muted !== undefined ? { muted: choice.muted } : {}),
    ...(choice.volume !== undefined ? { volume: choice.volume } : {}),
  }

  if (!choice.variantId && !choice.mediaUrl) {
    return settings
  }

  if (sourceVariant?.silent && !choice.mediaUrl) {
    const silent = next.audioEvents[event].variants.find(
      (variant) => variant.silent,
    )

    return silent
      ? { variantId: silent.id, ...settings }
      : { ...settings, muted: true }
  }

  if (!url || !isSafeThemeAssetUrl(url)) {
    return undefined
  }

  // Variant identifiers belong to their theme. Match the actual recording,
  // never an identically named foreign variant with different media.
  const matching = next.audioEvents[event].variants.find((variant) =>
    next.assets.some(
      (asset) => asset.id === variant.assetId && asset.url === url,
    ),
  )

  if (matching) {
    return { variantId: matching.id, ...settings }
  }

  if (
    next.audioEvents[event].customMedia &&
    (url.startsWith("/media/") || url.startsWith("https://"))
  ) {
    return { mediaUrl: url, ...settings }
  }

  return undefined
}

/**
 * Change presentation while retaining the game's compatible soundtrack.
 * Canonical questions, timers and saved audio (including excerpt offsets) stay
 * in their original fields. Incompatible theme settings remain in the editor's
 * existing theme history; they are never reinterpreted by another renderer.
 */
export function preserveCompatibleThemeAudio({
  current,
  next,
  previousDefinition,
  nextDefinition,
}: {
  current: ShowThemeSelection
  next: ShowThemeSelection
  previousDefinition: ShowThemeDefinition
  nextDefinition: ShowThemeDefinition
}): ShowThemeSelection {
  const selection = structuredClone(next)
  selection.legacyPolicy ??= "preserve-saved"

  const copyAudio = (
    source: ThemeOverrides["audio"],
    target: ThemeOverrides["audio"],
  ): ThemeOverrides["audio"] => {
    const merged = { ...target }

    for (const event of SHOW_THEME_AUDIO_EVENTS) {
      const choice = source?.[event]

      // A previously saved choice for the destination theme takes precedence.
      if (!choice || target?.[event]) {
        continue
      }

      const compatible = portableAudio({
        choice,
        event,
        previous: previousDefinition,
        next: nextDefinition,
      })

      if (compatible) {
        merged[event] = compatible
      }
    }

    return Object.keys(merged).length ? merged : undefined
  }

  const audio = copyAudio(current.overrides.audio, selection.overrides.audio)

  if (audio) {
    selection.overrides.audio = audio
  }

  for (const role of SHOW_THEME_ROLES) {
    if (!nextDefinition.capabilities.roles.includes(role)) {
      continue
    }

    const roleAudio = copyAudio(
      current.overrides.roles?.[role]?.audio,
      selection.overrides.roles?.[role]?.audio,
    )

    if (roleAudio) {
      selection.overrides.roles ??= {}
      selection.overrides.roles[role] = {
        ...selection.overrides.roles[role],
        audio: roleAudio,
      }
    }
  }

  return selection
}
