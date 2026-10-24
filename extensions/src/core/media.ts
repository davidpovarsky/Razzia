import { z } from "zod"
import {
  ANSWER_DISPLAYS,
  INTERLUDE_ADVANCES,
  INTERLUDE_KINDS,
  REVEAL_AUDIENCES,
  REVEAL_EFFECTS,
  REVEAL_TRIGGERS,
} from "./constants"

const UNSAFE_PROTOCOL_PATTERN = /^(javascript|data|file|vbscript):/i

/**
 * Validates that a media reference is safe:
 * 1. Root-relative starting with `/media/` (and no directory traversal `..`)
 * 2. Or an explicit allowed HTTPS URL.
 * Rejects javascript:, data:, file:, vbscript: and relative paths outside /media/.
 */
export const isSafeMediaUrl = (url: unknown): url is string => {
  if (typeof url !== "string") {
    return false
  }

  const trimmed = url.trim()

  if (!trimmed) {
    return false
  }

  if (UNSAFE_PROTOCOL_PATTERN.test(trimmed)) {
    return false
  }

  if (trimmed.startsWith("/media/")) {
    return !trimmed.includes("..")
  }

  try {
    const parsed = new URL(trimmed)

    return parsed.protocol === "https:"
  } catch {
    return false
  }
}

export const safeMediaUrlSchema = z
  .string()
  .refine(isSafeMediaUrl, "errors:extensions.invalidMediaUrl")

export const answerVisualSchema = z
  .strictObject({
    answerIndex: z.number().int().min(0),
    display: z.enum(ANSWER_DISPLAYS),
    url: z.string().optional(),
    alt: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.display === "image" || data.display === "both") {
      if (!data.url || !isSafeMediaUrl(data.url)) {
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message: "errors:extensions.invalidMediaUrl",
        })
      }

      if (data.alt.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["alt"],
          message: "errors:extensions.altRequiredForImage",
        })
      }
    } else if (data.url && !isSafeMediaUrl(data.url)) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "errors:extensions.invalidMediaUrl",
      })
    }
  })

export type AnswerVisual = z.infer<typeof answerVisualSchema>

export const questionRevealSchema = z.strictObject({
  effect: z.enum(REVEAL_EFFECTS),
  durationMs: z.number().int().min(250).max(15000),
  trigger: z.enum(REVEAL_TRIGGERS),
  audience: z.enum(REVEAL_AUDIENCES),
})

export type QuestionReveal = z.infer<typeof questionRevealSchema>

export const interludeSchema = z
  .strictObject({
    kind: z.enum(INTERLUDE_KINDS),
    title: z.string().optional(),
    url: z.string().optional(),
    durationMs: z.number().int().min(1000).max(30000),
    advance: z.enum(INTERLUDE_ADVANCES),
    audioCue: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.url && !isSafeMediaUrl(data.url)) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "errors:extensions.invalidMediaUrl",
      })
    }
  })

export type Interlude = z.infer<typeof interludeSchema>
