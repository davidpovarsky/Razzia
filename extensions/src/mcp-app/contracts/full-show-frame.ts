// V3 current-frame boundary: no authored source, private notes or future cards.
import { z } from "zod"
import { nativePreviewFrameV1Schema } from "../../core/show-library/native-preview-frame-schema.ts"
import {
  fullShowInventoryV3Schema,
  fullShowSelectionInputV3Schema,
} from "./full-show-selection.ts"
import {
  SHOW_THEME_SLOTS,
  SHOW_THEME_AUDIO_EVENTS,
} from "../../core/show-themes/selection.ts"
import { nativePreviewVisualSettingsV2Schema } from "../../core/show-library/native-preview-renderer-v2-schema.ts"
import { digest } from "./schemas.ts"
import {
  ORIGINAL_THEME_IDS,
  isOriginalThemeId,
} from "../../core/show-themes/original-theme-families.ts"

export const FULL_SHOW_RESOURCE_V3 = "ui://tadazz/full-show/v3.html"

export const FULL_SHOW_META_V3 = "tadazz/full-show-v3"

export const fullShowToolInputV3Schema = fullShowSelectionInputV3Schema.extend({
  contractVersion: z.literal("0.1.0"),
})

const publicId = z.string().regex(/^preview-scene-[a-f0-9]{64}$/u)
const text = z.string().max(1000)
const url = z
  .url()
  .max(2048)
  .refine((value) => {
    const parsed = new URL(value)

    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    )
  })

export const fullShowSceneV3Schema = z.strictObject({
  id: publicId,
  kind: z.enum([
    "opening",
    "closing",
    "transition",
    "animation",
    "media",
    "leaderboard",
    "interimResults",
    "answerRecap",
    "countdown",
  ]),
  title: text.optional(),
  subtitle: text.optional(),
  description: text.optional(),
  durationMs: z.number().int().min(500).max(300000).optional(),
  durationSeconds: z.number().int().min(3).max(120).optional(),
  advance: z.enum(["auto", "manual", "onMediaEnd"]),
  preset: z.string().max(64).optional(),
  mediaUrl: url.optional(),
  mediaType: z.enum(["image", "video", "audio"]).optional(),
  mediaFit: z.enum(["contain", "cover"]).optional(),
  stageLayout: z.enum(["card", "cinema"]).optional(),
  logoPosition: z.enum(["top", "center", "bottom", "hidden"]).optional(),
  textOverlay: z.boolean().optional(),
  endBehavior: z.enum(["holdFrame", "advanceNext", "fadeToTitle"]).optional(),
  mode: z.enum(["mostSelected", "correctAnswer"]).optional(),
  maxItemsPerPage: z.number().int().min(1).max(8).optional(),
  showCounts: z.boolean().optional(),
  showPercentages: z.boolean().optional(),
})

const audioSelection = z.strictObject({
  variantId: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-zA-Z0-9._-]+$/u)
    .optional(),
  mediaUrl: url.optional(),
  muted: z.boolean().optional(),
  volume: z.number().min(0).max(1).optional(),
})

export const fullShowPresentationV3Schema = z.strictObject({
  background: z
    .strictObject({
      url,
      fit: z.enum(["contain", "cover"]),
    })
    .optional(),
  answerVisuals: z
    .array(
      z.strictObject({
        answerId: z.string().min(1).max(256),
        display: z.enum(["image", "both"]),
        url,
        alt: z.string().min(1).max(500),
      }),
    )
    .max(5)
    .default([]),
})

export const fullShowThemeV3Schema = z
  .strictObject({
    id: z.enum(["tadazz-classic", "razzia-original", ...ORIGINAL_THEME_IDS]),
    version: z.literal("1.0.0"),
    definitionSha256: digest,
    audio: z
      .partialRecord(z.enum(SHOW_THEME_AUDIO_EVENTS), audioSelection)
      .default({}),
    rendererId: z.enum([
      "tadazz-classic-stage",
      "razzia-native-stage",
      "tadazz-original-stage",
    ]),
    slots: z.record(
      z.enum(SHOW_THEME_SLOTS),
      z.strictObject({
        variantId: z
          .string()
          .min(1)
          .max(160)
          .regex(/^[a-zA-Z0-9._-]+$/u),
      }),
    ),
  })
  .superRefine((theme, ctx) => {
    const legacyRenderer =
      theme.id === "tadazz-classic"
        ? "tadazz-classic-stage"
        : "razzia-native-stage"
    const renderer = isOriginalThemeId(theme.id)
      ? "tadazz-original-stage"
      : legacyRenderer

    if (
      theme.rendererId !== renderer ||
      Object.values(theme.slots).some(
        (slot) => !slot.variantId.startsWith(`${theme.id}.`),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "full-show:theme-family-mismatch",
      })
    }
  })

const content = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("question"),
    frame: nativePreviewFrameV1Schema,
    visualSettings: nativePreviewVisualSettingsV2Schema,
  }),
  z.strictObject({ kind: z.literal("scene"), scene: fullShowSceneV3Schema }),
])

export const fullShowFrameV3Schema = z
  .strictObject({
    frameVersion: z.literal(3),
    inventory: fullShowInventoryV3Schema,
    rendererBuildId: digest,
    theme: fullShowThemeV3Schema,
    content,
    presentation: fullShowPresentationV3Schema.default({ answerVisuals: [] }),
  })
  .superRefine((value, ctx) => {
    const chapter = value.inventory.chapters.find(
      (c) => c.id === value.inventory.selectedChapterId,
    )
    const item = value.content
    const visuals = value.presentation.answerVisuals

    if (
      visuals.length &&
      (item.kind !== "question" ||
        item.frame.phase === "question" ||
        new Set(visuals.map((v) => v.answerId)).size !== visuals.length ||
        visuals.some(
          (v) => !item.frame.choices.some((c) => c.id === v.answerId),
        ))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "full-show:answer-visual-association",
      })
    }

    if (
      !chapter ||
      (item.kind === "question"
        ? item.frame.phase !== chapter.kind ||
          item.frame.revision !== value.inventory.revision ||
          item.frame.role !== value.inventory.context.role ||
          item.frame.question.ordinal !== chapter.questionOrdinal
        : item.scene.kind !== chapter.kind) ||
      value.inventory.context.role === "player"
    ) {
      ctx.addIssue({ code: "custom", message: "full-show:frame-association" })
    }
  })

export type FullShowFrameV3 = z.infer<typeof fullShowFrameV3Schema>

export type FullShowToolInputV3 = z.infer<typeof fullShowToolInputV3Schema>
