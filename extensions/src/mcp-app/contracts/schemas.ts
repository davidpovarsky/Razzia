import { z } from "zod"

export const CONTRACT_VERSION = "0.1.0" as const
export const PREVIEW_RESOURCE = "ui://tadazz/quiz-preview/v1.html"
export const LIMITS = Object.freeze({
  request: 65_536,
  authored: 32_768,
  structured: 49_152,
  preview: 262_144,
  response: 327_680,
  text: 2_048,
})
export const opaqueId = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/u)
export const revision = z.number().int().min(1).max(2_147_483_647)
export const locale = z.enum(["en", "fr", "de", "es", "it", "ja", "tr", "vi"])
export const digest = z.string().regex(/^[a-f0-9]{64}$/u)
const text = (max: number) => z.string().min(1).max(max)
export const authoredJson = z.string().min(2).max(LIMITS.authored)
export const baseInput = { contractVersion: z.literal(CONTRACT_VERSION) }
export const diagnostics = z
  .array(
    z.strictObject({
      code: text(80),
      path: z.string().max(240),
      messageKey: text(160),
      severity: z.enum(["warning", "error"]),
    }),
  )
  .max(20)
export const summarySchema = z.strictObject({
  title: text(160),
  cardCount: z.number().int().min(1).max(50),
  questionCount: z.number().int().min(1).max(25),
  themeId: text(64),
  themeVersion: text(32),
  diagnostics,
})
export const errorCode = z.enum([
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "REVISION_CONFLICT",
  "CONSENT_REQUIRED",
  "CONSENT_DECLINED",
  "SCOPE_REQUIRED",
  "ACCOUNT_UNAVAILABLE",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "PREVIEW_UNAVAILABLE",
  "EXPORT_UNAVAILABLE",
  "DEPENDENCY_UNAVAILABLE",
  "REQUEST_KEY_REUSED",
  "INTERNAL",
])
export type ErrorCode = z.infer<typeof errorCode>
export const errorSchema = z.strictObject({
  code: errorCode,
  messageKey: text(160),
  retryable: z.boolean(),
  currentRevision: revision.optional(),
  consentRequestId: opaqueId.optional(),
  consentUrl: z.string().url().max(2048).optional(),
})
export function outputSchema(data: z.ZodType) {
  return z.union([
    z.strictObject({
      contractVersion: z.literal(CONTRACT_VERSION),
      ok: z.literal(true),
      correlationId: opaqueId,
      data,
    }),
    z.strictObject({
      contractVersion: z.literal(CONTRACT_VERSION),
      ok: z.literal(false),
      correlationId: opaqueId,
      error: errorSchema,
    }),
  ])
}
export const draftData = z.strictObject({
  draftId: opaqueId,
  revision,
  summary: summarySchema,
})
export const previewData = z.strictObject({
  draftId: opaqueId,
  revision,
  previewVersion: z.literal(1),
  summary: summarySchema,
  rendererStatus: z.enum(["ready", "unavailable", "unsupportedTheme"]),
  projectionDigest: digest,
  sbRegistryVersion: z.string().max(64).nullable(),
})
export const previewMetaSchema = z.strictObject({
  version: z.literal(1),
  draftId: opaqueId,
  revision,
  projectionDigest: digest,
  mode: z.literal("demo"),
  authoredShowJson: authoredJson,
  sbRegistryVersion: z.string().max(64).nullable(),
  assetManifest: z
    .array(
      z.strictObject({
        assetId: text(160),
        sha256: digest,
        url: z
          .string()
          .url()
          .regex(/^https:\/\//u)
          .max(2048),
      }),
    )
    .max(64),
})
export type DraftSummary = z.infer<typeof summarySchema>
export type PreviewData = z.infer<typeof previewData>
export type PreviewMeta = z.infer<typeof previewMetaSchema>
export type ToolFailure = z.infer<typeof errorSchema>
export const jsonObject = z.record(z.string(), z.unknown())
