import { z } from "zod"
import {
  ANSWER_DISPLAYS,
  INTERLUDE_ADVANCES,
  INTERLUDE_KINDS,
  REVEAL_AUDIENCES,
  REVEAL_EFFECTS,
  REVEAL_TRIGGERS,
} from "./constants"

/**
 * Validates that a media reference is safe:
 * 1. Root-relative starting with `/media/` (and no directory traversal `..` or backslashes)
 * 2. Or an explicit allowed HTTPS URL.
 * Rejects javascript:, data:, file:, vbscript:, ftp:, plain http:, protocol-relative (//),
 * whitespace/control characters, backslashes, and encoded path traversal (%2e).
 */
export const isSafeMediaUrl = (url: unknown): url is string => {
  if (typeof url !== "string") {
    return false
  }

  const trimmed = url.trim()

  if (!trimmed) {
    return false
  }

  // Reject protocol-relative URLs (starts with //)
  if (trimmed.startsWith("//")) {
    return false
  }

  // Reject backslashes or encoded path traversal (%2e)
  if (trimmed.includes("\\") || /%2e/i.test(trimmed)) {
    return false
  }

  // Reject whitespace or control characters inside URL
  if (/[\s\0\r\n\t]/u.test(trimmed)) {
    return false
  }

  // Root-relative /media/ or /sounds/ path
  if (trimmed.startsWith("/media/") || trimmed.startsWith("/sounds/")) {
    // Must not contain directory traversal
    return !trimmed.includes("..")
  }

  // Absolute URL: strictly https: scheme only
  try {
    const parsed = new URL(trimmed)

    if (parsed.protocol !== "https:") {
      return false
    }

    if (!parsed.hostname || parsed.hostname.length === 0) {
      return false
    }

    return true
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

/**
 * Validates that all media references in a quiz bundle (base quiz questions,
 * answer visuals, interludes, scenes, audio cues) are strictly safe URLs.
 */
export function validateBundleMedia(bundle: {
  quizz: unknown
  extras: unknown
}): { ok: boolean; path?: string } {
  const quizz = bundle.quizz as Record<string, unknown> | null | undefined
  if (quizz && Array.isArray(quizz.questions)) {
    for (let qIdx = 0; qIdx < quizz.questions.length; qIdx += 1) {
      const q = quizz.questions[qIdx] as Record<string, unknown>
      if (q && typeof q === "object") {
        const media = q.media as { url?: unknown } | undefined
        if (
          media &&
          typeof media.url === "string" &&
          !isSafeMediaUrl(media.url)
        ) {
          return { ok: false, path: `quizz.questions[${qIdx}].media.url` }
        }
      }
    }
  }

  const extras = bundle.extras as Record<string, unknown> | null | undefined
  if (extras && typeof extras === "object") {
    // 1. perQuestion answerVisuals & interludes
    if (extras.perQuestion && typeof extras.perQuestion === "object") {
      for (const [qId, item] of Object.entries(
        extras.perQuestion as Record<string, Record<string, unknown>>,
      )) {
        if (item && Array.isArray(item.answerVisuals)) {
          for (let vIdx = 0; vIdx < item.answerVisuals.length; vIdx += 1) {
            const v = item.answerVisuals[vIdx]
            if (v && typeof v.url === "string" && !isSafeMediaUrl(v.url)) {
              return {
                ok: false,
                path: `extras.perQuestion[${qId}].answerVisuals[${vIdx}].url`,
              }
            }
          }
        }
        if (
          item &&
          item.interlude &&
          typeof (item.interlude as Record<string, unknown>).url === "string"
        ) {
          const interludeUrl = (item.interlude as Record<string, unknown>)
            .url as string
          if (!isSafeMediaUrl(interludeUrl)) {
            return {
              ok: false,
              path: `extras.perQuestion[${qId}].interlude.url`,
            }
          }
        }
        if (
          item &&
          item.background &&
          typeof (item.background as Record<string, unknown>).url === "string"
        ) {
          const bgUrl = (item.background as Record<string, unknown>)
            .url as string
          if (!isSafeMediaUrl(bgUrl)) {
            return {
              ok: false,
              path: `extras.perQuestion[${qId}].background.url`,
            }
          }
        }
        if (
          item &&
          item.audioCues &&
          typeof item.audioCues === "object"
        ) {
          for (const [cueKey, cueVal] of Object.entries(
            item.audioCues as Record<string, { url?: unknown }>,
          )) {
            if (
              cueVal &&
              typeof cueVal.url === "string" &&
              cueVal.url &&
              !isSafeMediaUrl(cueVal.url)
            ) {
              return {
                ok: false,
                path: `extras.perQuestion[${qId}].audioCues.${cueKey}.url`,
              }
            }
          }
        }
      }
    }

    // 2. scenes
    if (extras.scenes && typeof extras.scenes === "object") {
      for (const [sId, scene] of Object.entries(
        extras.scenes as Record<string, Record<string, unknown>>,
      )) {
        if (
          scene &&
          typeof scene.mediaUrl === "string" &&
          scene.mediaUrl &&
          !isSafeMediaUrl(scene.mediaUrl)
        ) {
          return { ok: false, path: `extras.scenes[${sId}].mediaUrl` }
        }
        if (
          scene &&
          scene.background &&
          typeof (scene.background as Record<string, unknown>).url === "string"
        ) {
          const bgUrl = (scene.background as Record<string, unknown>)
            .url as string
          if (!isSafeMediaUrl(bgUrl)) {
            return { ok: false, path: `extras.scenes[${sId}].background.url` }
          }
        }
        if (
          scene &&
          scene.audio &&
          typeof (scene.audio as Record<string, unknown>).url === "string"
        ) {
          const audioUrl = (scene.audio as Record<string, unknown>)
            .url as string
          if (audioUrl && !isSafeMediaUrl(audioUrl)) {
            return { ok: false, path: `extras.scenes[${sId}].audio.url` }
          }
        }
      }
    }

    // 3. audio cues
    if (extras.audio && typeof extras.audio === "object") {
      const cues = (
        extras.audio as { cues?: Record<string, { url?: unknown }> }
      ).cues
      if (cues && typeof cues === "object") {
        for (const [cueId, cue] of Object.entries(cues)) {
          if (
            cue &&
            typeof cue.url === "string" &&
            cue.url &&
            !isSafeMediaUrl(cue.url)
          ) {
            return { ok: false, path: `extras.audio.cues[${cueId}].url` }
          }
        }
      }
    }
  }

  return { ok: true }
}
