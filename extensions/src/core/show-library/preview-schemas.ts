import { compareIdentityKeys } from "./identity-rule"
import { z } from "zod"
import { assetReferenceSchema } from "./schemas"
import {
  digestSchema,
  exactRefSchema,
  identifierSchema,
  previewRoleSchema,
  diagnosticSchema,
} from "./primitives"

export const previewContextSchema = z.strictObject({
  mode: z.literal("demo"),
  role: previewRoleSchema,
  locale: z.enum(["en", "fr", "de", "es", "it", "ja", "tr", "vi", "he"]),
  reducedMotion: z.boolean(),
  join: z.literal("unavailable-demo"),
  actions: z.literal("synthetic-only"),
})

export const previewIdentityEntrySchema = z.strictObject({
  authoredKey: z.string().min(1).max(160),
  previewId: identifierSchema,
})

const identityEntries = z
  .array(previewIdentityEntrySchema)
  .max(128)
  .superRefine((entries, ctx) => {
    const keys = new Set<string>(),
      ids = new Set<string>()
    entries.forEach((entry, index) => {
      if (keys.has(entry.authoredKey) || ids.has(entry.previewId)) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:duplicate-identity",
        })
      }

      if (
        index > 0 &&
        compareIdentityKeys(
          entries[index - 1].authoredKey,
          entry.authoredKey,
        ) >= 0
      ) {
        ctx.addIssue({ code: "custom", message: "show-library:identity-order" })
      }

      keys.add(entry.authoredKey)
      ids.add(entry.previewId)
    })
  })

export const previewIdentityMapSchema = z.strictObject({
  identityRuleVersion: z.literal(2),
  cards: identityEntries,
  questions: identityEntries,
  scenes: identityEntries,
})

export const previewDraftInputSchema = z.strictObject({
  portVersion: z.literal(3),
  identityRuleVersion: z.literal(2),
  authoredShowJson: z.string().min(2).max(262144),
  identityMap: previewIdentityMapSchema,
  assets: z.array(assetReferenceSchema).max(256),
  context: previewContextSchema,
})

export const compiledPreviewPinSchema = z.strictObject({
  portVersion: z.literal(3),
  identityRuleVersion: z.literal(2),
  registry: exactRefSchema,
  registrySha256: digestSchema,
  renderer: exactRefSchema,
  rendererBuildSha256: digestSchema,
})

export const compiledPreviewManifestSchema = z
  .strictObject({
    portVersion: z.literal(3),
    identityRuleVersion: z.literal(2),
    pins: z.array(compiledPreviewPinSchema).max(128),
  })
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>(),
      registries = new Map<string, string>()
    for (const pin of manifest.pins) {
      const registry = `${pin.registry.id}@${pin.registry.version}`,
        renderer = `${pin.renderer.id}@${pin.renderer.version}`

      if (seen.has(`${registry}/${renderer}`)) {
        ctx.addIssue({ code: "custom", message: "show-library:duplicate-pin" })
      }

      if (
        registries.has(registry) &&
        registries.get(registry) !== pin.registrySha256
      ) {
        ctx.addIssue({
          code: "custom",
          message: "show-library:immutable-registry-digest",
        })
      }

      registries.set(registry, pin.registrySha256)
      seen.add(`${registry}/${renderer}`)
    }
  })

const questionSupportSchema = z.strictObject({
  questionId: identifierSchema,
  questionType: z.enum(["single", "multi", "estimation"]),
  playMode: z.enum(["quiz", "survey"]),
  answerCount: z.number().int().min(0).max(64).nullable(),
  support: z.enum(["exact", "fallback", "unavailable"]),
})

export const previewCapabilitiesSchema = z.strictObject({
  localSelection: z.boolean(),
  reveal: z.boolean(),
  results: z.boolean(),
  leaderboard: z.boolean(),
  seek: z.enum(["deterministic", "silent-reconstruct", "unavailable"]),
  supportedRoles: z.array(previewRoleSchema).max(3),
  questions: z.array(questionSupportSchema).max(128),
})

const resolutionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("exact"),
    requested: exactRefSchema,
    effective: exactRefSchema,
    pin: compiledPreviewPinSchema,
  }),
  z.strictObject({
    kind: z.literal("fallback"),
    requested: exactRefSchema,
    effective: exactRefSchema,
    pin: compiledPreviewPinSchema,
  }),
  z.strictObject({
    kind: z.literal("unavailable"),
    requested: exactRefSchema,
    effective: z.null(),
    pin: z.null(),
  }),
])

export const previewPlanSchema = z.strictObject({
  portVersion: z.literal(3),
  identityRuleVersion: z.literal(2),
  resolution: resolutionSchema,
  capabilities: previewCapabilitiesSchema,
  diagnostics: z.array(diagnosticSchema).max(20),
})

export const demoClockSnapshotSchema = z.strictObject({
  epoch: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  elapsedMs: z.number().min(0).max(86400000),
  deadlineMs: z.number().finite().nullable(),
  paused: z.boolean(),
})

export const demoIntentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("play") }),
  z.strictObject({ type: z.literal("pause") }),
  z.strictObject({ type: z.literal("replay") }),
  z.strictObject({ type: z.literal("next") }),
  z.strictObject({ type: z.literal("reveal") }),
  z.strictObject({
    type: z.literal("seek"),
    elapsedMs: z.number().min(0).max(86400000),
  }),
  z.strictObject({
    type: z.literal("select"),
    questionId: identifierSchema,
    answerIds: z.array(identifierSchema).max(64),
  }),
  z.strictObject({
    type: z.literal("submit-estimation"),
    questionId: identifierSchema,
    value: z.number().finite(),
  }),
])

export type PreviewContext = z.infer<typeof previewContextSchema>

export type PreviewIdentityMap = z.infer<typeof previewIdentityMapSchema>

export type PreviewAssetRef = z.infer<typeof assetReferenceSchema>

export type PreviewDraftInput = z.infer<typeof previewDraftInputSchema>

export type CompiledPreviewPin = z.infer<typeof compiledPreviewPinSchema>

export type CompiledPreviewManifest = z.infer<
  typeof compiledPreviewManifestSchema
>

export type PreviewPlan = z.infer<typeof previewPlanSchema>

export type PreviewResolution = PreviewPlan["resolution"]

export type PreviewCapabilities = z.infer<typeof previewCapabilitiesSchema>

export type DemoClockSnapshot = z.infer<typeof demoClockSnapshotSchema>

export type DemoIntent = z.infer<typeof demoIntentSchema>
