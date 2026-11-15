import { projectShowBindings, type PreviewProjectionBinding } from "../../core/show-library/projection"
import { assertBoundPreviewStageMetadata, type ValidatedPreviewStageMetadata } from "../../core/show-library/stage-metadata"
import type { PreviewFrame } from "./stage-scene-adapter"
import { validatePreviewFrame } from "./stage-scene-adapter"

/** Host-side only: the producer validates the binding before any public copy. */
export function projectedFrame(snapshot: unknown, context: unknown, binding: PreviewProjectionBinding, metadata: ValidatedPreviewStageMetadata, revision: number, seconds: number | null): PreviewFrame {
  const projection = projectShowBindings(snapshot, context, binding)
  const question = projection.question
  if (!question || question.id !== metadata.questionId ||
      projection.role === "player" || question.questionType === "estimation" ||
      !["question", "answerCards", "voting", "voteLocked", "results"].includes(projection.phase)) {
    throw new Error("show-preview:unsupported-projection")
  }
  assertBoundPreviewStageMetadata(binding.draft, binding.plan, question.id, metadata)
  // projectShowBindings has already checked binding.clock against the snapshot.
  // Results intentionally omit their clock from the public projection.
  const clock = projection.clock ?? (projection.phase === "results" ? binding.clock : undefined)
  if (!clock) throw new Error("show-preview:missing-clock")
  const frame: PreviewFrame = {
    phase: projection.phase as PreviewFrame["phase"], role: projection.role,
    epoch: clock.epoch, revision,
    question: { id: question.id, text: question.text, type: question.questionType, mode: question.playMode, ordinal: metadata.ordinal, totalQuestions: metadata.totalQuestions },
    choices: (projection.choices ?? []).map(({ id, label }) => ({ id, label })),
    ...(projection.phase === "results" && projection.results ? { results: projection.results.map(({ answerId, count, percent, correct }) => ({ answerId, count, percent, ...(correct === undefined ? {} : { correct }) })) } : {}),
    clock: { elapsedMs: clock.elapsedMs, deadlineMs: clock.deadlineMs, paused: clock.paused }, seconds,
  }
  validatePreviewFrame(frame)
  return frame
}
