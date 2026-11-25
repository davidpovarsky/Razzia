// Payload-only inventory. Shape/content identity is not renderer acceptance.
import { z } from "zod"
import { previewContextSchema } from "../../core/show-library/preview-schemas.ts"
import { digest, opaqueId, revision } from "./schemas.ts"

export const fullShowChapterKindV3 = z.enum([
  "question",
  "answerCards",
  "voting",
  "voteLocked",
  "results",
  "transition",
  "animation",
  "media",
  "leaderboard",
  "interimResults",
  "answerRecap",
  "countdown",
  "opening",
  "closing",
])

const cardId = z.string().regex(/^preview-card-[a-f0-9]{64}$/u)
const chapterId = z.string().min(1).max(128)
const duration = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("known"),
    milliseconds: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
  z.strictObject({ kind: z.literal("manual") }),
  z.strictObject({ kind: z.literal("infinite") }),
  z.strictObject({ kind: z.literal("unknown") }),
])

export const fullShowSelectionInputV3Schema = z.strictObject({
  selectionVersion: z.literal(3),
  draftId: opaqueId,
  expectedRevision: revision,
  chapterId: chapterId.optional(),
  context: previewContextSchema,
})

export const fullShowInventoryV3Schema = z
  .strictObject({
    selectionVersion: z.literal(3),
    draftId: opaqueId,
    revision,
    authoredSha256: digest,
    title: z.string().min(1).max(160),
    context: previewContextSchema,
    selectedChapterId: chapterId,
    chapters: z
      .array(
        z.strictObject({
          id: chapterId,
          cardId,
          index: z.number().int().min(0).max(1023),
          kind: fullShowChapterKindV3,
          cardOrdinal: z.number().int().min(1).max(128),
          questionOrdinal: z.number().int().min(1).max(128).nullable(),
          duration,
        }),
      )
      .min(1)
      .max(1024),
  })
  .superRefine((plan, ctx) => {
    const ids = new Set<string>()
    plan.chapters.forEach((chapter, index) => {
      if (
        chapter.index !== index ||
        ids.has(chapter.id) ||
        chapter.id !== `${chapter.cardId}:${chapter.kind}`
      ) {
        ctx.addIssue({ code: "custom", message: "full-show:chapter-identity" })
      }

      ids.add(chapter.id)
    })

    if (!ids.has(plan.selectedChapterId)) {
      ctx.addIssue({ code: "custom", message: "full-show:selected-chapter" })
    }
  })

export type FullShowSelectionInputV3 = z.infer<
  typeof fullShowSelectionInputV3Schema
>

export type FullShowInventoryV3 = z.infer<typeof fullShowInventoryV3Schema>
