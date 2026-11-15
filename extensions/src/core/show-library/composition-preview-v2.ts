// HOST ONLY: normalizer/identity/plan/composition data must never enter a payload.
import { z } from "zod"
import {
  compositionDocumentV2Digest,
  parseCompositionDocumentV2,
  type CompositionDocumentV2,
} from "./composition-document-v2"
import { canonicalJson } from "./digest"
import {
  derivePreviewIdentityMap,
  normalizePreviewDraft,
  type ValidatedPreviewDraft,
} from "./identity"
import {
  assertBoundPreviewPlan,
  getPreviewDigestContent,
  resolvePreviewPlan,
} from "./preview-resolve"
import type { PreviewPlan } from "./preview-schemas"
import { assertBoundedJson, freeze, identifierSchema } from "./primitives"

const scopeBindingsSchema = z
  .array(
    z.strictObject({
      scopeId: identifierSchema,
      authoredCardKey: z.string().min(1).max(160),
    }),
  )
  .max(128)
const revisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const compositionPreviewBrand: unique symbol = Symbol(
  "show-library.composition-preview-v2",
)

export interface ValidatedCompositionPreviewV2 {
  readonly [compositionPreviewBrand]: true
  readonly draft: ValidatedPreviewDraft
  readonly plan: Readonly<PreviewPlan>
  readonly document: Readonly<CompositionDocumentV2>
  readonly draftRevision: number
  readonly scopeBindings: Readonly<z.infer<typeof scopeBindingsSchema>>
}

const prepared = new WeakSet<object>()

export function assertCompositionPreviewV2(
  value: ValidatedCompositionPreviewV2,
): void {
  if (!prepared.has(value)) {
    throw new Error("show-library:unprepared-composition-preview")
  }

  assertBoundPreviewPlan(value.draft, value.plan)
}

/** Explicit preview-only copy. Original authored JSON/document/storage are untouched. */
export function prepareCompositionPreviewV2(
  previewDraftInput: unknown,
  documentInput: unknown,
  options: { draftRevision: number; scopeBindings?: unknown },
): ValidatedCompositionPreviewV2 {
  const base = normalizePreviewDraft(previewDraftInput)
  const document = parseCompositionDocumentV2(documentInput)
  const draftRevision = revisionSchema.parse(options.draftRevision)
  const scopeBindingsInput = options.scopeBindings ?? []
  assertBoundedJson(scopeBindingsInput)
  const scopeBindings = scopeBindingsSchema
    .parse(scopeBindingsInput)
    .sort((a, b) => {
      if (a.scopeId === b.scopeId) {
        return 0
      }

      return a.scopeId < b.scopeId ? -1 : 1
    })
  const declared = new Set([
    ...document.scopes.map((scope) => scope.scopeId),
    ...document.composition.scopes.map((scope) => scope.scopeId),
  ])
  const cardKeys = new Set(base.show.cards.map((card) => card.key))

  if (
    new Set(scopeBindings.map((entry) => entry.scopeId)).size !==
      scopeBindings.length ||
    new Set(scopeBindings.map((entry) => entry.authoredCardKey)).size !==
      scopeBindings.length ||
    scopeBindings.length !== declared.size ||
    scopeBindings.some(
      (entry) =>
        !declared.has(entry.scopeId) || !cardKeys.has(entry.authoredCardKey),
    )
  ) {
    throw new Error("show-library:invalid-preview-scope-association")
  }

  const raw = JSON.parse(base.normalizedAuthoredShowJson) as Record<
    string,
    unknown
  >
  raw.defaults = { ...base.show.defaults, showTheme: document.selection }
  raw.cards = base.show.cards.map((card) => {
    const association = scopeBindings.find(
      (entry) => entry.authoredCardKey === card.key,
    )
    const scope =
      association &&
      document.scopes.find((entry) => entry.scopeId === association.scopeId)

    return { ...card, ...(scope ? { themeOverrides: scope.selection } : {}) }
  })
  const authoredShowJson = JSON.stringify(raw)
  const draft = normalizePreviewDraft({
    ...base.input,
    authoredShowJson,
    identityMap: derivePreviewIdentityMap(authoredShowJson),
  })

  if (
    canonicalJson(base.input.identityMap) !==
    canonicalJson(draft.input.identityMap)
  ) {
    throw new Error("show-library:composition-preview-identity-changed")
  }

  const result: ValidatedCompositionPreviewV2 = freeze({
    [compositionPreviewBrand]: true as const,
    draft,
    plan: resolvePreviewPlan(draft),
    document,
    draftRevision,
    scopeBindings,
  })
  prepared.add(result)

  return result
}

/** Content for F's sole canonical MCP digest path, never a second MCP digest. */
export function getCompositionPreviewDigestContentV2(
  value: ValidatedCompositionPreviewV2,
) {
  assertCompositionPreviewV2(value)

  return freeze({
    format: "tadazz-composition-preview-content" as const,
    schemaVersion: 2 as const,
    preview: getPreviewDigestContent(value.draft, value.plan),
    compositionDocument: value.document,
    compositionDocumentSha256: compositionDocumentV2Digest(value.document),
    draftRevision: value.draftRevision,
    scopeBindings: value.scopeBindings,
  })
}
