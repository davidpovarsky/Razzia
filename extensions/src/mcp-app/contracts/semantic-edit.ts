import { z } from "zod"
import { exactRefSchema } from "../../core/show-library/primitives.ts"
import {
  baseInput,
  digest,
  draftData,
  locale,
  opaqueId,
  revision,
} from "./schemas.ts"

export const SEMANTIC_EDIT_VERSION = 1 as const

export const semanticAssetPurposeSchema = z.enum([
  "background",
  "answer-image",
  "audio",
])

export const semanticAssetRefSchema = z.strictObject({
  assetId: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-zA-Z0-9._-]+$/u),
  sha256: digest,
  theme: exactRefSchema,
})

const publicQuestionId = z.string().regex(/^preview-question-[a-f0-9]{64}$/u)

export const semanticQuestionRefSchema = z.strictObject({
  questionNumber: z.number().int().min(1).max(25),
  publicQuestionId,
})

const picture = z.strictObject({
  answerNumber: z.number().int().min(1).max(5),
  asset: semanticAssetRefSchema,
  alt: z.string().trim().min(1).max(500),
  display: z.enum(["image", "both"]),
})

export const semanticPatchSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("set-title"),
    title: z.string().min(1).max(160),
  }),
  z.strictObject({
    kind: z.literal("set-question-text"),
    publicQuestionId,
    text: z.string().min(1).max(1000),
  }),
  z.strictObject({
    kind: z.literal("set-voting-volume"),
    volume: z.number().min(0).max(1),
  }),
  z.strictObject({
    kind: z.literal("select-theme"),
    theme: exactRefSchema,
  }),
  z.strictObject({
    kind: z.literal("set-background"),
    asset: semanticAssetRefSchema,
  }),
  z.strictObject({
    kind: z.literal("set-voting-music"),
    asset: semanticAssetRefSchema,
  }),
  z.strictObject({
    kind: z.literal("set-answer-pictures"),
    publicQuestionId,
    pictures: z
      .array(picture)
      .min(1)
      .max(5)
      .refine(
        (items) =>
          new Set(items.map((item) => item.answerNumber)).size === items.length,
      ),
  }),
])

const mutationInput = {
  ...baseInput,
  draftId: opaqueId,
  expectedRevision: revision,
  idempotencyKey: opaqueId,
}

export const semanticPatchInputSchema = z.strictObject({
  ...mutationInput,
  patch: semanticPatchSchema,
})

export const semanticUndoInputSchema = z.strictObject({
  ...mutationInput,
  undoOperationId: opaqueId,
})

export const semanticStateInputSchema = z.strictObject({
  ...baseInput,
  draftId: opaqueId,
  expectedRevision: revision.optional(),
})

export const semanticAssetsInputSchema = z.strictObject({
  ...baseInput,
  draftId: opaqueId,
  expectedRevision: revision,
  purpose: semanticAssetPurposeSchema,
  locale: locale.default("en"),
})

export const semanticMutationResultSchema = draftData
  .extend({
    undoOperationId: opaqueId.optional(),
  })
  .strict()

export const semanticAssetChoiceSchema = z.strictObject({
  ref: semanticAssetRefSchema,
  publicUrl: z
    .url()
    .max(2048)
    .refine((value) => {
      const url = new URL(value)

      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      )
    }),
  mime: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  alt: z.string().max(500).optional(),
})

export const semanticAssetsResultSchema = z.strictObject({
  draftId: opaqueId,
  revision,
  purpose: semanticAssetPurposeSchema,
  assets: z.array(semanticAssetChoiceSchema).max(64),
})

export type SemanticPatch = z.infer<typeof semanticPatchSchema>

export type SemanticPatchInput = z.infer<typeof semanticPatchInputSchema>

export type SemanticUndoInput = z.infer<typeof semanticUndoInputSchema>

export type SemanticStateInput = z.infer<typeof semanticStateInputSchema>

export type SemanticAssetsInput = z.infer<typeof semanticAssetsInputSchema>

export type SemanticMutationResult = z.infer<
  typeof semanticMutationResultSchema
>

export type SemanticAssetsResult = z.infer<typeof semanticAssetsResultSchema>

export type SemanticAssetRef = z.infer<typeof semanticAssetRefSchema>

export type SemanticAssetPurpose = z.infer<typeof semanticAssetPurposeSchema>

export type SemanticAssetOperation =
  "store" | "preview" | "json-reference-export" | "export"

export type SemanticLocale = z.infer<typeof locale>

export interface SemanticAssetContext {
  readonly theme: z.infer<typeof exactRefSchema>
  readonly purpose: SemanticAssetPurpose
  readonly operation: SemanticAssetOperation
}

export interface ResolvedSemanticAsset {
  readonly ref: SemanticAssetRef
  readonly publicUrl: string
}

export type SemanticAssetChoice = z.infer<typeof semanticAssetChoiceSchema>

/** Deployment-owned public built-in catalog. Metadata alone grants no rights. */
export interface SemanticAssetResolver {
  resolveAsset(
    ref: SemanticAssetRef,
    context: SemanticAssetContext,
  ): ResolvedSemanticAsset | undefined
  resolveStoredUrl(
    url: string,
    context: SemanticAssetContext,
  ): ResolvedSemanticAsset | undefined
  listAssets(
    context: SemanticAssetContext,
    locale: SemanticLocale,
  ): readonly SemanticAssetChoice[]
}

/** Explicit host opt-in. This never admits presentation fields in raw model JSON. */
export interface SemanticAuthoringPolicy {
  readonly assets?: SemanticAssetResolver
}
