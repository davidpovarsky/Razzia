import { z } from "zod"
import { tadaShowV1Schema } from "../show-authoring-schema"
import { demoClockSnapshotSchema } from "./preview-schemas"
import { compositionDocumentSchema } from "./composition-document"
import { libraryRegistrySchema } from "./schemas"
import { SHOW_THEME_AUDIO_EVENTS } from "../show-themes/selection"
import { applicationPackagePreviewSchema } from "./application-package-preview"

export const applicationAppearanceSchema = z.strictObject({
  registry: libraryRegistrySchema,
  document: compositionDocumentSchema,
})

export const applicationPreviewFrameSchema = z.strictObject({
  show: tadaShowV1Schema,
  chapterIndex: z.number().int().min(0).max(1023),
  clock: demoClockSnapshotSchema,
  role: z.enum(["manager", "player", "spectator"]),
  locale: z.enum(["en", "fr", "de", "es", "it", "ja", "tr", "vi", "he"]),
  reducedMotion: z.boolean(),
  soundEnabled: z.boolean().default(false),
  mediaRevealed: z.boolean().default(false),
  stagePhase: z.literal("lobby").optional(),
  audioAudition: z
    .strictObject({
      event: z.enum(SHOW_THEME_AUDIO_EVENTS),
      sequence: z.number().int().positive(),
      startedAt: z.number().positive(),
    })
    .optional(),
  appearance: applicationAppearanceSchema.optional(),
  appearanceRevision: z.number().int().nonnegative().default(0),
  scopeIds: z.record(z.string().max(160), z.uuid()).optional(),
  packageContext: applicationPackagePreviewSchema.optional(),
})

export type ApplicationPreviewFrame = z.infer<
  typeof applicationPreviewFrameSchema
>
