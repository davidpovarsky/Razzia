// Trusted host producer; this module must never be bundled into renderer payloads.
import { getPreviewIdentityId } from "./identity"
import {
  nativePreviewFrameV1Schema,
  type NativePreviewFrameV1,
} from "./native-preview-frame-schema"
import { freeze } from "./primitives"
import {
  projectShowBindings,
  type PreviewProjectionBinding,
} from "./projection"
import {
  assertBoundPreviewStageMetadata,
  type ValidatedPreviewStageMetadata,
} from "./stage-metadata"

/** Current-card-only adapter to E's actual native-stage ABI. It does not mount a
 * renderer, resolve assets, create outcomes, allocate a clock or enable readiness.
 * Revision is supplied by the trusted authoring host; seconds come from the card.
 */
export function produceNativePreviewFrameV1(
  snapshot: unknown,
  context: unknown,
  binding: PreviewProjectionBinding,
  metadata: ValidatedPreviewStageMetadata,
  revision: number,
): Readonly<NativePreviewFrameV1> {
  const projection = projectShowBindings(snapshot, context, binding)
  const question = projection.question
  if (
    !question ||
    projection.role === "player" ||
    question.questionType === "estimation" ||
    !["question", "answerCards", "voting", "voteLocked", "results"].includes(
      projection.phase,
    )
  )
    throw new Error("show-preview:unsupported-projection")
  assertBoundPreviewStageMetadata(
    binding.draft,
    binding.plan,
    question.id,
    metadata,
  )
  // The projector already checked current-card identity, kind, labels and clock.
  const clock =
    projection.clock ??
    (projection.phase === "results" ? binding.clock : undefined)
  if (!clock) throw new Error("show-preview:missing-clock")
  const card = binding.draft.show.cards.find(
    (entry) =>
      (entry.kind === "quiz" || entry.kind === "survey") &&
      getPreviewIdentityId(
        binding.draft.input.identityMap,
        "questions",
        entry.key,
      ) === question.id,
  )
  if (!card || (card.kind !== "quiz" && card.kind !== "survey"))
    throw new Error("show-preview:missing-authored-card")
  return freeze(
    nativePreviewFrameV1Schema.parse({
      phase: projection.phase,
      role: projection.role,
      epoch: clock.epoch,
      revision,
      question: {
        id: question.id,
        text: question.text,
        type: question.questionType,
        mode: question.playMode,
        ordinal: metadata.ordinal,
        totalQuestions: metadata.totalQuestions,
      },
      choices: projection.choices ?? [],
      ...(projection.phase === "results" && projection.results
        ? {
            results: projection.results.map(
              ({ answerId, count, percent, correct }) => ({
                answerId,
                count,
                percent,
                ...(correct === undefined ? {} : { correct }),
              }),
            ),
          }
        : {}),
      clock: {
        elapsedMs: clock.elapsedMs,
        deadlineMs: clock.deadlineMs,
        paused: clock.paused,
      },
      seconds: card.timeSeconds === -1 ? null : card.timeSeconds,
    }),
  )
}
