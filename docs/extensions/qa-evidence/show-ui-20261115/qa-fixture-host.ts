// QA-only host; never included in the renderer payload or application routes.
import { authoredFixture, previewInputFixture } from "../../../../extensions/src/core/show-library/preview-fixtures"
import { normalizePreviewDraft } from "../../../../extensions/src/core/show-library/identity"
import { resolvePreviewPlan } from "../../../../extensions/src/core/show-library/preview-resolve"
import { derivePreviewStageMetadata } from "../../../../extensions/src/core/show-library/stage-metadata"
import { projectedFrame } from "../../../../extensions/src/presentation/show-library-preview/projected-frame"
import type { PreviewLocale } from "../../../../extensions/src/presentation/show-library-preview/i18n"

type Phase = "question" | "answerCards" | "voting" | "voteLocked" | "results"
type Role = "manager" | "spectator"

/** Generate only named synthetic, current-card frames through genuine bindings. */
export function qaFrame(input: { role: Role; locale: PreviewLocale; phase: Phase; question: 0 | 1; paused: boolean; elapsedMs: number }) {
  const fixture = previewInputFixture(authoredFixture(5, 5))
  const draft = normalizePreviewDraft({ ...fixture, context: { ...fixture.context, role: input.role, locale: input.locale } })
  const plan = resolvePreviewPlan(draft)
  if (plan.resolution.kind !== "unavailable") throw new Error("qa:expected-unavailable-plan")
  const card = draft.show.cards[input.question]
  if (!card || card.kind !== "quiz" || card.questionType !== "single") throw new Error("qa:unexpected-fixture")
  const questionId = draft.input.identityMap.questions.find((item) => item.authoredKey === card.key)?.previewId
  if (!questionId) throw new Error("qa:missing-question")
  // This is the existing producer test-vector protocol, not a saved/native ID or allocator.
  const choices = card.answers.map((answer, index) => ({ id: `${questionId}.choice.${index + 1}`, label: answer.text }))
  const clock = { epoch: 1, sequence: 1, elapsedMs: input.elapsedMs, deadlineMs: 20000, paused: input.paused }
  const binding = { draft, plan, currentQuestionId: questionId, phase: input.phase, clock }
  const metadata = derivePreviewStageMetadata(draft, plan, questionId)
  const snapshot = {
    portVersion: 3, identityRuleVersion: 2, source: "deterministic-fixture", phase: input.phase, clock,
    question: { id: questionId, text: card.question, questionType: card.questionType, playMode: card.kind, choices, solutionAnswerIds: [choices[0].id] },
    ...(input.phase === "results" ? { results: choices.map((choice, index) => ({ answerId: choice.id, count: 0, percent: 0, correct: index === 0 })) } : {}),
    canAnswer: false, responders: 0, eligible: 0,
  }
  return projectedFrame(snapshot, draft.input.context, binding, metadata, 1, 20)
}
