// Payload leaf: Zod + existing metadata leaf only. No producer/authority/IO imports.
import { z } from "zod"
import { previewStageMetadataSchema } from "./stage-metadata-schema"

const safeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const text = z.string().max(10000)
const choice = z.strictObject({ id: z.string().min(1).max(256), label: text })
const result = z.strictObject({
  answerId: z.string().min(1).max(256),
  count: safeInteger,
  percent: z.number().min(0).max(100),
  correct: z.boolean().optional(),
})

/** Exact current dd3 read-only native-stage frame shape. Shape is not authority. */
export const nativePreviewFrameV1Schema = z
  .strictObject({
    phase: z.enum([
      "question",
      "answerCards",
      "voting",
      "voteLocked",
      "results",
    ]),
    role: z.enum(["manager", "spectator"]),
    epoch: safeInteger,
    revision: safeInteger,
    question: z.strictObject({
      id: z.string().min(1).max(256),
      text,
      type: z.enum(["single", "multi"]),
      mode: z.enum(["quiz", "survey"]),
      ordinal: z.number().int().min(1).max(128),
      totalQuestions: z.number().int().min(1).max(128),
    }),
    choices: z.array(choice).max(5),
    results: z.array(result).max(5).optional(),
    clock: z.strictObject({
      elapsedMs: z.number().min(0),
      deadlineMs: z.number().nullable(),
      paused: z.boolean(),
    }),
    seconds: z.number().positive().max(86400).nullable(),
  })
  .superRefine((frame, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: "custom", message: `show-preview:${message}` })

    if (
      !previewStageMetadataSchema.safeParse({
        portVersion: 3,
        identityRuleVersion: 2,
        questionId: frame.question.id,
        ordinal: frame.question.ordinal,
        totalQuestions: frame.question.totalQuestions,
      }).success
    ) {
      fail("invalid-stage-metadata")
    }

    if (
      frame.phase === "question"
        ? frame.choices.length !== 0
        : frame.choices.length < 2
    ) {
      fail("unsupported-cardinality")
    }

    const ids = new Set(frame.choices.map((entry) => entry.id))

    if (ids.size !== frame.choices.length) {
      fail("duplicate-choice")
    }

    if (frame.phase !== "results" && frame.results !== undefined) {
      fail("early-results")
    }

    if (frame.phase === "results") {
      if (!frame.results || frame.results.length !== ids.size) {
        fail("missing-results")
      }

      const seen = new Set<string>()
      for (const entry of frame.results ?? []) {
        if (!ids.has(entry.answerId) || seen.has(entry.answerId)) {
          fail("invalid-results")
        }

        seen.add(entry.answerId)
      }
    }
  })

export const nativePreviewRendererInputV1Schema = z.strictObject({
  frame: nativePreviewFrameV1Schema,
  locale: z.enum(["en", "fr", "de", "es", "it", "ja", "tr", "vi", "he"]),
  reducedMotion: z.boolean(),
})

export type NativePreviewFrameV1 = z.infer<typeof nativePreviewFrameV1Schema>

export type NativePreviewRendererInputV1 = z.infer<
  typeof nativePreviewRendererInputV1Schema
>

export type NativePreviewCandidateMountV1 = (
  element: HTMLElement,
  onUnavailable: () => void,
) => { update(input: NativePreviewRendererInputV1): void; dispose(): void }
