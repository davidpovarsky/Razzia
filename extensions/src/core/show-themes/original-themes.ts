import classicManifest from "./classic.manifest.json" with { type: "json" }
import artwork from "./original-theme-assets.json" with { type: "json" }
import audio from "./original-audio-assets.json" with { type: "json" }
import {
  showThemeDefinitionSchema,
  SHOW_THEME_LOCALES,
  type ShowThemeDefinition,
} from "./definition"
import {
  ORIGINAL_SLOT_RENDERERS,
  ORIGINAL_THEME_STYLES,
  type OriginalThemeStyle,
} from "./original-theme-families"
import { SHOW_THEME_SLOTS, type ShowThemeAudioEvent } from "./selection"

const defaultLabels = [
  "Show sound",
  "Son du spectacle",
  "Showklang",
  "Sonido del espectáculo",
  "Suono dello spettacolo",
  "ショーのサウンド",
  "Gösteri sesi",
  "Âm thanh chương trình",
  "צלילי המופע",
]
const silentLabels = [
  "Silent",
  "Silencieux",
  "Stumm",
  "Silencio",
  "Silenzioso",
  "無音",
  "Sessiz",
  "Im lặng",
  "ללא קול",
]
const visualLabels = [
  "Original design",
  "Création originale",
  "Eigenständiges Design",
  "Diseño original",
  "Design originale",
  "オリジナルデザイン",
  "Özgün tasarım",
  "Thiết kế nguyên bản",
  "עיצוב מקורי",
]

const eventSound: Record<ShowThemeAudioEvent, string | null> = {
  opening: null,
  lobby: null,
  showQuestion: "transition",
  answersMusic: "voting-bed",
  answerSelected: null,
  answerSubmitted: "confirm",
  timerWarning: "tick",
  timerExpired: "timer-end",
  voteLocked: "lock",
  revealResults: "reveal",
  leaderboard: "leaderboard",
  zzTransition: null,
  podium1: "podium",
  podium2: "leaderboard",
  podium3: "reveal",
  closing: "closing",
}

function makeOriginalTheme(style: OriginalThemeStyle): ShowThemeDefinition {
  const theme = showThemeDefinitionSchema.parse(classicManifest)
  const rename = (value: string) =>
    value.replace(/^tadazz-classic\./u, `${style.id}.`)
  theme.id = style.id
  theme.version = "1.0.0"
  theme.kind = "code-backed"
  theme.rendererId = "tadazz-original-stage"
  theme.nameKey = `originals:${style.id}.name`
  theme.descriptionKey = `originals:${style.id}.description`
  theme.provenance =
    "Original first-party Tadazz React composition, vector artwork and instrumental synthesis authored for the approved eight-theme collection, 22 November 2026. Shared game state, timing, controls and audio playback remain platform-owned."
  theme.localizations = showThemeDefinitionSchema.shape.localizations.parse(
    Object.fromEntries(
      SHOW_THEME_LOCALES.map((locale, index) => [
        locale,
        {
          [theme.nameKey]: style.names[index],
          [theme.descriptionKey]: style.descriptions[index],
          "originals:default": defaultLabels[index],
          "originals:silent": silentLabels[index],
          "originals:design": visualLabels[index],
        },
      ]),
    ),
  )
  theme.tokens = {
    ...theme.tokens,
    background: style.background,
    foreground: style.foreground,
    accent: style.accent,
    fontId: "rubik",
    imageSizing: "square-contain",
    effects: "original-theme-v1",
    palette: {
      night: style.background,
      purple: style.panel,
      violet: style.panel,
      pink: style.secondary,
      blue: style.secondary,
      royal: style.panel,
      lime: style.accent,
      gold: style.accent,
      cream: style.foreground,
      ink: style.background,
    },
  }
  theme.capabilities.maxAnswers = 5
  // The platform ident is shared. New family artwork never replaces the host's
  // intro/transport chrome; all theme media are owned, finite and hash-bound.
  theme.assets = theme.assets.filter((asset) =>
    [
      "classic-logo",
      "classic-opening-video",
      "classic-opening-lottie",
    ].includes(asset.id),
  )
  theme.assets.push(
    ...artwork
      .filter((asset) => asset.family === style.id)
      .map((asset) => ({
        id: `${style.id}.${asset.name}`,
        url: asset.url,
        kind: "image" as const,
        sha256: asset.sha256,
        bytes: asset.bytes,
        rights: "owner-authorized" as const,
        provenance:
          "Original vector geometry authored for this Tadazz family. Reproducible SVG sources and offline Linux rasterization: extensions/qa/original-themes/generate-artwork.ts; no external artwork or fonts downloaded.",
        preload:
          asset.name === "backdrop" ? ("critical" as const) : ("slot" as const),
      })),
  )
  theme.assets.push(
    ...audio
      .filter((asset) => asset.family === style.id)
      .map((asset) => ({
        id: `${style.id}.sound.${asset.name}`,
        url: asset.url,
        kind: "audio" as const,
        sha256: asset.sha256,
        bytes: asset.bytes,
        rights: "owner-authorized" as const,
        provenance:
          "Original deterministic instrumental synthesis; no samples, speech or third-party recordings. Source: extensions/qa/original-themes/generate-audio.py. Generated on the authorized Linux worker; not a claim of human listening approval.",
        preload: "slot" as const,
      })),
  )
  theme.posterAssetId = `${style.id}.poster`
  theme.adapterAssets = {
    questionBackdrop: `${style.id}.backdrop`,
    showBackdrop: `${style.id}.backdrop`,
    brandLogo: "classic-logo",
  }
  for (const [index, slotId] of SHOW_THEME_SLOTS.entries()) {
    const slot = theme.slots[slotId]
    slot.defaultVariantId = `${style.id}.${slotId}.default`
    slot.variants = [
      {
        id: slot.defaultVariantId,
        labelKey: "originals:design",
        rendererId: ORIGINAL_SLOT_RENDERERS[index],
        backgroundAssetId: `${style.id}.backdrop`,
        animationId: `${style.id}.${slotId}`,
        ...(slotId === "opening"
          ? {
              logoAssetId: "classic-logo",
              mediaAssetId: "classic-opening-video",
              overlayAssetId: "classic-opening-lottie",
            }
          : {}),
      },
    ]
  }
  for (const [eventId, event] of Object.entries(theme.audioEvents)) {
    const id = eventId as ShowThemeAudioEvent
    event.defaultVariantId = rename(event.defaultVariantId)
    for (const variant of event.variants) {
      const suffix = variant.id.split(".").at(-1)
      variant.id = rename(variant.id)
      variant.labelKey = variant.silent
        ? "originals:silent"
        : "originals:default"

      if (id === "opening") {
        // Shared platform intro, including its single sound owner.
        if (variant.silent) {
          delete variant.inheritPlatform
        } else {
          variant.inheritPlatform = true
        }

        delete variant.assetId

        continue
      }

      delete variant.inheritPlatform
      let sound = eventSound[id]

      if (id === "lobby" && suffix === "accent") {
        sound = "confirm"
      }

      if (id === "timerWarning" && suffix === "urgent") {
        sound = "urgent"
      }

      if (id === "timerWarning" && suffix === "final") {
        sound = "final"
      }

      if (id === "revealResults") {
        if (suffix === "accent") {
          sound = "reveal"
        }

        if (["music", "fallback", "story-mixer"].includes(suffix ?? "")) {
          sound = "voting-bed"
        }
      }

      if (variant.silent || !sound) {
        variant.silent = true
        variant.labelKey = "originals:silent"
        delete variant.assetId
      } else {
        variant.assetId = `${style.id}.sound.${sound}`
        variant.silent = false
        const cueVolume = id === "timerWarning" ? 0.36 : 0.6
        variant.volume = sound === "voting-bed" ? 0.28 : cueVolume
        // No new scheduler: the existing event/epoch/continuous policies stay.
      }
    }
  }
  for (const cue of Object.values(theme.choreographyCues)) {
    cue.variantId = rename(cue.variantId)
  }

  return showThemeDefinitionSchema.parse(theme)
}

export const bundledOriginalThemes = Object.freeze(
  ORIGINAL_THEME_STYLES.map(makeOriginalTheme),
)
