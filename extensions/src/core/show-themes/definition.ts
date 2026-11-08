import { z } from "zod"
import {
  SHOW_THEME_AUDIO_EVENTS,
  SHOW_THEME_ROLES,
  SHOW_THEME_SLOTS,
  themeAssetUrlSchema,
  themeIdSchema,
  themeVersionSchema,
} from "./selection"

export const TRUSTED_THEME_RENDERERS = ["tadazz-classic-stage"] as const

export const TRUSTED_SLOT_RENDERERS = [
  "classic-shell",
  "classic-opening",
  "classic-lobby",
  "classic-question",
  "classic-cards",
  "classic-voting",
  "classic-timer",
  "classic-lock",
  "classic-results",
  "classic-leaderboard",
  "classic-rank",
  "classic-zz",
  "classic-interlude",
  "classic-closing",
  "classic-personal-result",
] as const

const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9._-]+$/u)
const variant = z.strictObject({
  id,
  labelKey: z.string().min(1).max(160),
  rendererId: z.enum(TRUSTED_SLOT_RENDERERS),
  backgroundAssetId: id.optional(),
  logoAssetId: id.optional(),
  mediaAssetId: id.optional(),
  overlayAssetId: id.optional(),
  animationId: id.optional(),
})
const slot = z.strictObject({
  defaultVariantId: id,
  variants: z.array(variant).min(1).max(32),
  customMedia: z.enum(["none", "background", "foreground"]).default("none"),
})
const audioVariant = z.strictObject({
  id,
  labelKey: z.string().min(1).max(160),
  assetId: id.optional(),
  silent: z.boolean(),
  volume: z.number().min(0).max(1),
  loop: z.boolean(),
  priority: z.number().int().min(0).max(100),
  fadeMs: z.number().int().min(0).max(5000),
  restart: z.enum(["epoch", "event", "continuous"]),
  roles: z.array(z.enum(SHOW_THEME_ROLES)).min(1).max(3),
})
const audioEvent = z.strictObject({
  defaultVariantId: id,
  variants: z.array(audioVariant).min(1).max(32),
  customMedia: z.boolean(),
})
const asset = z.strictObject({
  id,
  url: themeAssetUrlSchema,
  kind: z.enum(["image", "video", "lottie", "audio"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  bytes: z.number().int().positive().max(100_000_000),
  provenance: z.string().min(1).max(1000),
  rights: z.enum(["repository-existing", "licensed", "owner-authorized"]),
  preload: z.enum(["critical", "slot"]),
})
const color = z
  .string()
  .regex(/^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/u)

export const showThemeDefinitionSchema = z
  .strictObject({
    manifestVersion: z.literal(1),
    id: themeIdSchema,
    version: themeVersionSchema,
    nameKey: z.string().min(1).max(160),
    descriptionKey: z.string().min(1).max(160),
    category: z.literal("show"),
    kind: z.enum(["declarative", "code-backed"]),
    rendererApiVersion: z.literal(1),
    rendererId: z.enum(TRUSTED_THEME_RENDERERS),
    posterAssetId: id,
    provenance: z.string().min(1).max(1000),
    adapterAssets: z.strictObject({
      questionBackdrop: id,
      showBackdrop: id,
      brandLogo: id,
    }),
    capabilities: z.strictObject({
      playModes: z.array(z.enum(["quiz", "survey"])).min(1),
      questionTypes: z.array(z.enum(["single", "multi", "estimation"])).min(1),
      roles: z.array(z.enum(SHOW_THEME_ROLES)).min(1).max(3),
      minAnswers: z.number().int().min(2),
      maxAnswers: z.number().int().min(5).max(64),
      reducedMotion: z.literal("same-theme-static"),
      animationPresets: z.array(id).min(1).max(32),
    }),
    tokens: z.strictObject({
      background: color,
      foreground: color,
      accent: color,
      fontId: z.enum(["rubik", "goldy-canonical"]),
      stageAspect: z.literal("16:9"),
      imageSizing: z.enum(["square-contain", "square-cover"]),
      palette: z.strictObject({
        night: color,
        purple: color,
        violet: color,
        pink: color,
        blue: color,
        royal: color,
        lime: color,
        gold: color,
        cream: color,
        ink: color,
      }),
      effects: z.literal("goldy-canonical-v4"),
      contrast: z.literal("light-on-dark-with-selected-outline"),
    }),
    slots: z.record(z.enum(SHOW_THEME_SLOTS), slot),
    audioEvents: z.record(z.enum(SHOW_THEME_AUDIO_EVENTS), audioEvent),
    choreographyCues: z
      .record(
        id,
        z.strictObject({
          event: z.enum(SHOW_THEME_AUDIO_EVENTS),
          variantId: id,
        }),
      )
      .refine((value) => Object.keys(value).length <= 64),
    assets: z.array(asset).min(1).max(256),
  })
  .superRefine((theme, ctx) => {
    const assetIds = new Set(theme.assets.map((a) => a.id))
    const variantIds = new Set<string>()
    for (const item of theme.assets) {
      const extension = new URL(item.url, "https://theme.invalid").pathname
        .split(".")
        .at(-1)
        ?.toLowerCase()
      const allowed = {
        image: ["png", "jpg", "jpeg", "webp", "gif", "avif"],
        video: ["mp4", "webm"],
        audio: ["mp3", "wav", "ogg", "m4a"],
        lottie: ["json", "lottie"],
      }

      if (!extension || !allowed[item.kind].includes(extension)) {
        ctx.addIssue({
          code: "custom",
          message: "Asset kind does not match extension",
          path: ["assets", item.id],
        })
      }
    }
    for (const [name, cue] of Object.entries(theme.choreographyCues)) {
      if (
        !theme.audioEvents[cue.event].variants.some(
          (choice) => choice.id === cue.variantId,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Choreography cue references an unapproved event variant",
          path: ["choreographyCues", name],
        })
      }
    }

    if (assetIds.size !== theme.assets.length) {
      ctx.addIssue({
        code: "custom",
        message: "Duplicate asset ID",
        path: ["assets"],
      })
    }

    if (!assetIds.has(theme.posterAssetId)) {
      ctx.addIssue({
        code: "custom",
        message: "Missing poster asset",
        path: ["posterAssetId"],
      })
    }

    for (const ref of Object.values(theme.adapterAssets)) {
      if (!assetIds.has(ref)) {
        ctx.addIssue({
          code: "custom",
          message: "Missing adapter asset",
          path: ["adapterAssets"],
        })
      }
    }
    const groups: Array<
      [
        string,
        Record<
          string,
          {
            defaultVariantId: string
            variants: Array<
              z.infer<typeof variant> | z.infer<typeof audioVariant>
            >
          }
        >,
      ]
    > = [
      ["slots", theme.slots],
      ["audioEvents", theme.audioEvents],
    ]
    for (const [group, entries] of groups) {
      for (const [key, entry] of Object.entries(entries)) {
        if (!entry.variants.some((v) => v.id === entry.defaultVariantId)) {
          ctx.addIssue({
            code: "custom",
            message: "Missing default variant",
            path: [group, key],
          })
        }

        for (const choice of entry.variants) {
          if (
            !choice.id.startsWith(`${theme.id}.`) ||
            variantIds.has(choice.id)
          ) {
            ctx.addIssue({
              code: "custom",
              message: "Duplicate or cross-theme variant",
              path: [group, key],
            })
          }

          variantIds.add(choice.id)
          const refs =
            "rendererId" in choice
              ? [
                  choice.backgroundAssetId,
                  choice.logoAssetId,
                  choice.mediaAssetId,
                  choice.overlayAssetId,
                ]
              : [choice.assetId]

          if (refs.some((ref) => ref !== undefined && !assetIds.has(ref))) {
            ctx.addIssue({
              code: "custom",
              message: "Missing asset reference",
              path: [group, key],
            })
          }

          if (
            "silent" in choice &&
            choice.silent === (choice.assetId !== undefined)
          ) {
            ctx.addIssue({
              code: "custom",
              message: "Audio must be silent or reference one asset",
              path: [group, key],
            })
          }

          if (
            "silent" in choice &&
            choice.assetId &&
            theme.assets.find((item) => item.id === choice.assetId)?.kind !==
              "audio"
          ) {
            ctx.addIssue({
              code: "custom",
              message: "Audio variant must reference audio",
              path: [group, key],
            })
          }
        }
      }
    }
  })

export type ShowThemeDefinition = z.infer<typeof showThemeDefinitionSchema>

export type ThemeAsset = ShowThemeDefinition["assets"][number]
