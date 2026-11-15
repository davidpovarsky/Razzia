import { getPreviewIdentityId, type ValidatedPreviewDraft } from "./identity"
import { assertBoundPreviewPlan } from "./preview-resolve"
import type { PreviewPlan } from "./preview-schemas"
import {
  previewStageMetadataSchema,
  type PreviewStageMetadata,
} from "./stage-metadata-schema"

declare const validatedStageMetadata: unique symbol
export type ValidatedPreviewStageMetadata = PreviewStageMetadata & {
  readonly [validatedStageMetadata]: true
}
const bindings = new WeakMap<
  object,
  {
    readonly draft: ValidatedPreviewDraft
    readonly plan: Readonly<PreviewPlan>
    readonly questionId: string
  }
>()

/** Trusted controller chooses its current question; this does not create a cursor or grant readiness. */
export function derivePreviewStageMetadata(
  draft: ValidatedPreviewDraft,
  plan: Readonly<PreviewPlan>,
  currentQuestionId: string,
): ValidatedPreviewStageMetadata {
  assertBoundPreviewPlan(draft, plan)
  const questions = draft.show.cards.filter(
    (card) => card.kind === "quiz" || card.kind === "survey",
  )
  const index = questions.findIndex(
    (card) =>
      getPreviewIdentityId(draft.input.identityMap, "questions", card.key) ===
      currentQuestionId,
  )
  if (index < 0) throw new Error("show-library:unknown-stage-question")
  const metadata = previewStageMetadataSchema.parse({
    portVersion: 3,
    identityRuleVersion: 2,
    questionId: currentQuestionId,
    ordinal: index + 1,
    totalQuestions: questions.length,
  }) as ValidatedPreviewStageMetadata
  bindings.set(
    metadata,
    Object.freeze({ draft, plan, questionId: currentQuestionId }),
  )
  return metadata
}

/** Call at the trusted host boundary before handing only public fields to the renderer. */
export function assertBoundPreviewStageMetadata(
  draft: ValidatedPreviewDraft,
  plan: Readonly<PreviewPlan>,
  currentQuestionId: string,
  metadata: ValidatedPreviewStageMetadata,
): void {
  assertBoundPreviewPlan(draft, plan)
  const binding = bindings.get(metadata)
  if (
    !binding ||
    binding.draft !== draft ||
    binding.plan !== plan ||
    binding.questionId !== currentQuestionId
  )
    throw new Error("show-library:unbound-stage-metadata")
}
