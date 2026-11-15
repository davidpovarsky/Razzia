// Runtime payload leaf: Zod only. Never import producer, digest or compiled catalog here.
import { z } from "zod"

/** Public current-question display data; parsing proves shape, not producer association. */
export const previewStageMetadataSchema = z
  .strictObject({
    portVersion: z.literal(3),
    identityRuleVersion: z.literal(2),
    questionId: z.string().regex(/^preview-question-[a-f0-9]{64}$/u),
    ordinal: z.number().int().min(1).max(128),
    totalQuestions: z.number().int().min(1).max(128),
  })
  .refine(
    (value) => value.ordinal <= value.totalQuestions,
    "show-library:stage-metadata-range",
  )
  .readonly()

export type PreviewStageMetadata = z.infer<typeof previewStageMetadataSchema>
