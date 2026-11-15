import { z } from "zod"
import { SHOW_THEME_AUDIO_EVENTS } from "../show-themes/selection"
import {
  digestSchema,
  exactRefSchema,
  identifierSchema,
  localizedKeySchema,
  portSchema,
  previewPhaseSchema,
  previewRoleSchema,
} from "./primitives"

export const bindingIdSchema = z.enum([
  "question",
  "choices",
  "choice-results",
  "vote-progress",
  "clock",
  "leaderboard",
  "join",
  "phone-instructions",
  "personal-result",
  "story",
  "recap",
  "tie",
  "show-brand",
  "scene-text",
  "selected-choices",
  "estimation",
])
export const capabilitiesSchema = z
  .strictObject({
    questionTypes: z.array(z.enum(["single", "multi", "estimation"])).max(3),
    playModes: z.array(z.enum(["quiz", "survey"])).max(2),
    minAnswers: z.number().int().min(2).max(64),
    maxAnswers: z.number().int().min(2).max(64),
    roles: z.array(previewRoleSchema).min(1).max(3),
    phases: z.array(previewPhaseSchema).min(1).max(11),
  })
  .refine((v) => v.minAnswers <= v.maxAnswers, "show-library:answer-range")
export const propsSchema = z.strictObject({
  labelKey: localizedKeySchema.optional(),
  titleKey: localizedKeySchema.optional(),
  fit: z.enum(["contain", "cover"]).optional(),
  showNumber: z.boolean().optional(),
  alignment: z.enum(["start", "center", "end"]).optional(),
})
export const componentDefinitionSchema = z
  .strictObject({
    ...exactRefSchema.shape,
    adapterId: identifierSchema,
    availability: z.literal("candidate"),
    propsProfile: z.literal("bounded-view-v1"),
    capabilities: capabilitiesSchema,
    allowedPorts: z.array(portSchema).min(1).max(18),
    childPorts: z
      .array(
        z.strictObject({
          id: portSchema,
          allowedComponents: z.array(exactRefSchema).max(128),
          maxChildren: z.number().int().min(0).max(32),
        }),
      )
      .max(18),
    bindings: z.array(bindingIdSchema).max(16),
    motions: z.array(exactRefSchema).max(32),
    fallback: z.enum(["whole-template", "safe-hold"]),
    reducedMotion: z.literal("same-theme-static"),
    a11yLabelKey: localizedKeySchema,
    provenance: z.string().min(1).max(1000),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.childPorts.map((p) => p.id)).size !== v.childPorts.length)
      ctx.addIssue({ code: "custom", message: "show-library:duplicate-port" })
  })
export type ShowComponentDefinition = z.infer<typeof componentDefinitionSchema>
export const motionDefinitionSchema = z.strictObject({
  ...exactRefSchema.shape,
  kind: z.enum(["element", "screen", "transition"]),
  availability: z.literal("candidate"),
  ports: z.array(portSchema).min(1).max(18),
  components: z.array(exactRefSchema).max(128),
  durationMs: z.number().int().min(0).max(10000),
  staggerMs: z.number().int().min(0).max(300),
  seek: z.literal("unavailable"),
  reducedMotion: z.literal("same-theme-static"),
})
export const layoutSchema = z.strictObject({
  preset: z.enum(["flow", "grid", "safe-overlay"]),
  alignment: z.enum(["start", "center", "end"]),
  gap: z.enum(["none", "small", "medium", "large"]),
  lane: z.enum(["background", "content", "decoration"]),
})
export const compositionNodeSchema = z.strictObject({
  nodeId: identifierSchema,
  component: exactRefSchema,
  port: portSchema,
  props: propsSchema,
  bindings: z.record(identifierSchema, bindingIdSchema),
  layout: layoutSchema,
  motions: z.array(exactRefSchema).max(8),
  children: z.partialRecord(portSchema, z.array(identifierSchema).max(32)),
})
export const screenTemplateSchema = z.strictObject({
  ...exactRefSchema.shape,
  availability: z.literal("candidate"),
  phase: previewPhaseSchema,
  roles: z.array(previewRoleSchema).min(1).max(3),
  rootNodeId: identifierSchema,
  questionType: z.enum(["single", "multi", "estimation"]).optional(),
  playMode: z.enum(["quiz", "survey"]).optional(),
  nodes: z.array(compositionNodeSchema).min(1).max(128),
  requiredSystemCapabilities: z
    .array(
      z.enum([
        "real-join-and-lock",
        "phone-if-enabled",
        "current-question",
        "complete-answer-set",
        "valid-estimation-options",
        "server-clock",
        "authorized-reveal",
        "public-leaderboard",
        "own-player-result",
      ]),
    )
    .max(8),
  layouts: z
    .array(z.enum(["stage-16-9", "safe-4-3", "narrow-player"]))
    .min(3)
    .max(3),
  fallback: z.enum(["whole-template", "safe-hold"]),
})
export const libraryRegistrySchema = z.strictObject({
  schemaVersion: z.literal(1),
  ...exactRefSchema.shape,
  components: z.array(componentDefinitionSchema).max(128),
  templates: z.array(screenTemplateSchema).max(128),
  motions: z.array(motionDefinitionSchema).max(64),
})
export const assetReferenceSchema = z.strictObject({
  assetId: identifierSchema,
  sha256: digestSchema,
})
export const assetDescriptorSchema = z.strictObject({
  ...assetReferenceSchema.shape,
  version: exactRefSchema.shape.version,
  kind: z.enum(["image", "video", "lottie", "audio"]),
  bytes: z.number().int().positive().max(100000000),
  rights: z.enum(["repository-existing", "licensed", "owner-authorized"]),
  provenance: z.string().min(1).max(1000),
  owner: z.discriminatedUnion("scope", [
    z.strictObject({ scope: z.literal("repository") }),
    z.strictObject({ scope: z.literal("tenant"), tenantId: identifierSchema }),
  ]),
  exportPermitted: z.boolean(),
  referenceCount: z.number().int().nonnegative(),
})
export const sectionOverridesSchema = z.strictObject({
  assets: z.record(identifierSchema, assetReferenceSchema).optional(),
  audio: z
    .partialRecord(
      z.enum(SHOW_THEME_AUDIO_EVENTS),
      z.discriminatedUnion("mode", [
        z.strictObject({ mode: z.literal("inherit") }),
        z.strictObject({ mode: z.literal("mute") }),
        z.strictObject({
          mode: z.literal("asset"),
          asset: assetReferenceSchema,
          volume: z.number().min(0).max(1),
          loop: z.boolean(),
          fadeMs: z.number().int().min(0).max(5000),
        }),
      ]),
    )
    .optional(),
  templates: z.partialRecord(previewPhaseSchema, exactRefSchema).optional(),
  motion: z.record(identifierSchema, exactRefSchema).optional(),
})
export const themeCompositionSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    ...exactRefSchema.shape,
    baseTheme: exactRefSchema,
    registry: exactRefSchema,
    sections: sectionOverridesSchema,
    roles: z.partialRecord(previewRoleSchema, sectionOverridesSchema),
    scopes: z
      .array(
        z.strictObject({
          scopeId: identifierSchema,
          theme: exactRefSchema,
          sections: sectionOverridesSchema,
          roles: z.partialRecord(previewRoleSchema, sectionOverridesSchema),
        }),
      )
      .max(128),
  })
  .superRefine((composition, ctx) => {
    const seen = new Set<string>()
    for (const scope of composition.scopes) {
      const key = `${scope.scopeId}/${scope.theme.id}@${scope.theme.version}`
      if (seen.has(key))
        ctx.addIssue({
          code: "custom",
          message: "show-library:duplicate-scope",
        })
      seen.add(key)
    }
  })
export type ThemeComposition = z.infer<typeof themeCompositionSchema>
