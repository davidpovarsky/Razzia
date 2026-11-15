import {
  assetDescriptorSchema,
  sectionOverridesSchema,
  themeCompositionSchema,
  type ThemeComposition,
} from "./schemas"
import {
  assertBoundedJson,
  freeze,
  identifierSchema,
  previewRoleSchema,
  type PreviewRole,
} from "./primitives"
import { z } from "zod"

type Sections = z.infer<typeof sectionOverridesSchema>
const merge = (left: Sections, right: Sections): Sections => ({
  ...(left.assets || right.assets
    ? { assets: { ...left.assets, ...right.assets } }
    : {}),
  ...(left.audio || right.audio
    ? { audio: { ...left.audio, ...right.audio } }
    : {}),
  ...(left.motion || right.motion
    ? { motion: { ...left.motion, ...right.motion } }
    : {}),
  ...(left.templates || right.templates
    ? { templates: { ...left.templates, ...right.templates } }
    : {}),
})

/** Pure override resolution only; storage rights and actual media delivery remain external. */
export function resolveCompositionSections(
  input: unknown,
  role: PreviewRole,
  scopeId?: string,
): Readonly<Sections> {
  assertBoundedJson(input)
  role = previewRoleSchema.parse(role)
  const composition = themeCompositionSchema.parse(input)
  const scope = composition.scopes.find(
    (s) =>
      s.scopeId === scopeId &&
      s.theme.id === composition.baseTheme.id &&
      s.theme.version === composition.baseTheme.version,
  )
  return freeze(
    [
      composition.roles[role],
      scope?.sections,
      scope?.roles[role],
    ].reduce<Sections>(
      (acc, value) => (value ? merge(acc, value) : acc),
      composition.sections,
    ),
  )
}

export function resetCompositionSection(
  input: unknown,
  section: keyof Sections,
): ThemeComposition {
  assertBoundedJson(input)
  const composition = themeCompositionSchema.parse(input)
  delete composition.sections[section]
  return composition
}

export function checkAssetReference(
  input: unknown,
  contextInput: unknown,
): { allowed: boolean; reason: string } {
  assertBoundedJson(input)
  assertBoundedJson(contextInput)
  const context = z
    .strictObject({
      tenantId: identifierSchema.optional(),
      operation: z.enum(["read", "export", "delete"]),
    })
    .parse(contextInput)
  const asset = assetDescriptorSchema.parse(input)
  if (
    asset.owner.scope === "tenant" &&
    (!context.tenantId || context.tenantId !== asset.owner.tenantId)
  )
    return { allowed: false, reason: "foreign-or-missing-tenant" }
  if (context.operation === "export" && !asset.exportPermitted)
    return { allowed: false, reason: "export-rights" }
  if (context.operation === "delete" && asset.referenceCount !== 0)
    return { allowed: false, reason: "referenced-asset" }
  return {
    allowed: true,
    reason: "metadata-policy-only-requires-trusted-storage-authorization",
  }
}
