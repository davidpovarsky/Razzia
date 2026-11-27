import classicManifest from "./classic.manifest.json" with { type: "json" }
import artwork from "./family-mixup-assets.json" with { type: "json" }
import { showThemeDefinitionSchema, SHOW_THEME_LOCALES } from "./definition"
import { ORIGINAL_SLOT_RENDERERS } from "./original-theme-families"
import { SHOW_THEME_SLOTS } from "./selection"

/** Approved bright family studio; the platform still owns timing, controls and sound. */
function makeFamilyMixupTheme() {
  const theme = showThemeDefinitionSchema.parse(classicManifest)
  theme.id = "family-mixup"
  theme.version = "1.0.0"
  theme.kind = "code-backed"
  theme.rendererId = "tadazz-original-stage"
  theme.nameKey = "familyMixup:name"
  theme.descriptionKey = "familyMixup:description"
  theme.provenance =
    "First-party Tadazz family studio, implemented from the owner's approved 16:9 mockups. Native React text, voting, scores and controls. Existing Tadazz music and audio policies retained."
  const names = [
    "Family Mix-Up",
    "Grand jeu en famille",
    "Familienspaß",
    "Diversión en familia",
    "Sfida in famiglia",
    "ファミリー・ミックスアップ",
    "Aile Eğlencesi",
    "Vui cùng gia đình",
    "משחק משפחתי",
  ]
  const descriptions = [
    "A bright television studio in cream, cobalt and orange, with clean typography and playful family energy.",
    "Un studio lumineux crème, bleu cobalt et orange, pour jouer en famille.",
    "Ein helles Fernsehstudio in Creme, Kobaltblau und Orange für die ganze Familie.",
    "Un estudio luminoso en crema, azul cobalto y naranja para toda la familia.",
    "Uno studio luminoso crema, cobalto e arancione per tutta la famiglia.",
    "クリーム、コバルト、オレンジの明るいスタジオで家族みんなで楽しもう。",
    "Krem, kobalt ve turuncu renklerle tüm aile için aydınlık bir stüdyo.",
    "Sân khấu tươi sáng màu kem, xanh cobalt và cam cho cả gia đình.",
    "אולפן שעשועון בהיר בגוני קרם, כחול וכתום, עם טיפוגרפיה נקייה והומור לכל המשפחה.",
  ]
  const defaults = [
    "Default",
    "Par défaut",
    "Standard",
    "Predeterminado",
    "Predefinito",
    "標準",
    "Varsayılan",
    "Mặc định",
    "ברירת מחדל",
  ]
  const silent = [
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
  theme.localizations = showThemeDefinitionSchema.shape.localizations.parse(
    Object.fromEntries(
      SHOW_THEME_LOCALES.map((locale, index) => [
        locale,
        {
          [theme.nameKey]: names[index],
          [theme.descriptionKey]: descriptions[index],
          "extensions:themes.default": defaults[index],
          "extensions:themes.silent": silent[index],
        },
      ]),
    ),
  )
  theme.tokens = {
    ...theme.tokens,
    background: "#f6efe3",
    foreground: "#163a9b",
    accent: "#f58b2b",
    fontId: "rubik",
    imageSizing: "square-contain",
    effects: "original-theme-v1",
    contrast: "dark-on-light-with-selected-outline",
    palette: {
      night: "#f6efe3",
      purple: "#b5a1df",
      violet: "#7a62bf",
      pink: "#f58b2b",
      blue: "#3159d0",
      royal: "#2349c4",
      lime: "#ffd368",
      gold: "#f7b34b",
      cream: "#fffaf1",
      ink: "#173269",
    },
  }
  theme.capabilities.maxAnswers = 5
  theme.assets.push(
    ...artwork.map((asset) => ({
      ...asset,
      kind: asset.kind === "video" ? ("video" as const) : ("image" as const),
      rights: "owner-authorized" as const,
      preload:
        asset.preload === "critical"
          ? ("critical" as const)
          : ("slot" as const),
    })),
  )
  theme.posterAssetId = "family-mixup.poster"
  theme.adapterAssets = {
    questionBackdrop: "family-mixup.stage-bright",
    showBackdrop: "family-mixup.stage-bright",
    brandLogo: "classic-logo",
  }
  SHOW_THEME_SLOTS.forEach((slotId, index) => {
    const slot = theme.slots[slotId]
    slot.defaultVariantId = `family-mixup.${slotId}.default`
    slot.variants = [
      {
        id: slot.defaultVariantId,
        labelKey: "extensions:themes.default",
        rendererId: ORIGINAL_SLOT_RENDERERS[index],
        backgroundAssetId: "family-mixup.stage-bright",
        logoAssetId: "classic-logo",
        animationId: `family-mixup.${slotId}`,
        ...(slotId === "opening"
          ? {
              mediaAssetId: "classic-opening-video",
              overlayAssetId: "classic-opening-lottie",
            }
          : {}),
      },
    ]
  })
  // Reuse Tadazz's licensed first-party cues/music and its single playback owner.
  // Only variant identity changes; timing, volume, roles, loops and restart policy do not.
  for (const event of Object.values(theme.audioEvents)) {
    event.defaultVariantId = event.defaultVariantId.replace(
      /^tadazz-classic\./u,
      "family-mixup.",
    )
    for (const variant of event.variants) {
      variant.id = variant.id.replace(/^tadazz-classic\./u, "family-mixup.")
    }
  }
  for (const cue of Object.values(theme.choreographyCues)) {
    cue.variantId = cue.variantId.replace(/^tadazz-classic\./u, "family-mixup.")
  }
  return showThemeDefinitionSchema.parse(theme)
}

export const familyMixupTheme = makeFamilyMixupTheme()
