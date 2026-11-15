import { z } from "zod"
import { resolveCompositionSections } from "./assets"
import { parseCompositionDocument } from "./composition-document"
import { canonicalJson, sha256 } from "./digest"
import {
  assertBoundedJson,
  freeze,
  identifierSchema,
  previewPhaseSchema,
  previewRoleSchema,
} from "./primitives"
import {
  createShowLibraryRegistry,
  inspectCandidateCapabilities,
} from "./registry"

export const compositionInspectionRequestSchema = z
  .strictObject({
    role: previewRoleSchema,
    phase: previewPhaseSchema,
    scopeId: identifierSchema.optional(),
    questionType: z.enum(["single", "multi", "estimation"]),
    playMode: z.enum(["quiz", "survey"]),
    answerCount: z.number().int().min(2).max(64).nullable(),
  })
  .refine(
    (request) =>
      (request.questionType === "estimation") ===
      (request.answerCount === null),
    "show-library:request-answer-kind",
  )

/** Authoring inspection only. Authored-card validation remains the producer's job;
 * an inspected capability/record never supplies a renderer pin or media grant.
 */
export function inspectCompositionReferences(
  documentInput: unknown,
  registryInput: unknown,
  requestInput: unknown,
) {
  const document = parseCompositionDocument(documentInput)
  const registry = createShowLibraryRegistry(registryInput)
  assertBoundedJson(requestInput)
  const request = compositionInspectionRequestSchema.parse(requestInput)
  const issues: string[] = []
  if (
    registry.id !== document.composition.registry.id ||
    registry.version !== document.composition.registry.version
  )
    issues.push("registry-ref-mismatch")
  const sections = resolveCompositionSections(
    document.composition,
    request.role,
    request.scopeId,
  )
  const selected = sections.templates?.[request.phase]
  const template =
    selected &&
    registry.templates.find(
      (entry) => entry.id === selected.id && entry.version === selected.version,
    )
  if (selected && !template) issues.push("unknown-template")
  if (template) {
    if (template.phase !== request.phase) issues.push("template-phase-mismatch")
    if (!template.roles.includes(request.role))
      issues.push("template-role-mismatch")
    if (template.questionType && template.questionType !== request.questionType)
      issues.push("template-question-type-mismatch")
    if (template.playMode && template.playMode !== request.playMode)
      issues.push("template-play-mode-mismatch")
    for (const node of template.nodes) {
      const component = registry.components.find(
        (entry) =>
          entry.id === node.component.id &&
          entry.version === node.component.version,
      )!
      if (!inspectCandidateCapabilities(component, request).compatible)
        issues.push(`component-capability-mismatch:${node.nodeId}`)
    }
  }
  for (const [binding, ref] of Object.entries(sections.motion ?? {}))
    if (
      !registry.motions.some(
        (entry) => entry.id === ref.id && entry.version === ref.version,
      )
    )
      issues.push(`unknown-motion:${binding}`)
  // Assets/audio are intentionally not resolved against caller-supplied metadata.
  // A trusted storage owner must authorize actual current-slot refs separately.
  if (
    Object.keys(sections.assets ?? {}).length > 0 ||
    Object.values(sections.audio ?? {}).some((entry) => entry.mode === "asset")
  )
    issues.push("asset-authorization-not-evaluated")
  return freeze({
    schemaVersion: 1 as const,
    status: issues.length
      ? ("incompatible" as const)
      : selected
        ? ("candidate" as const)
        : ("inherit-native" as const),
    registry: { id: registry.id, version: registry.version },
    registrySha256: sha256(canonicalJson(registry)),
    requestedTemplate: selected ?? null,
    // Do not expose nodes from a mismatched registry/template to the renderer.
    template: issues.length ? null : (template ?? null),
    issues: [...new Set(issues)].sort(),
    executableAcceptance: false as const,
  })
}

export type CompositionInspectionRequest = z.infer<
  typeof compositionInspectionRequestSchema
>
export type CompositionReferenceInspection = ReturnType<
  typeof inspectCompositionReferences
>
