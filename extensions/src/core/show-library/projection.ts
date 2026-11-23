import { canonicalJson } from "./digest"
import { assertBoundPreviewPlan } from "./preview-resolve"
import { getCompiledPreviewManifest } from "./manifest"
import { getPreviewIdentityId, type ValidatedPreviewDraft } from "./identity"

/**
 * Trusted controller evidence, never serialized or forwarded to visual components.
 * Context role is a demo selector, not authentication. The caller owns clock progression.
 */

export interface PreviewProjectionBinding {
  readonly draft: ValidatedPreviewDraft
  readonly plan: Readonly<PreviewPlan>
  readonly currentQuestionId: string
  readonly phase: PreviewPhase
  readonly clock: Readonly<DemoClockSnapshot>
}

function answerReadiness(
  snapshot: DemoPresentationSnapshot,
  context: PreviewContext,
  binding?: PreviewProjectionBinding,
) {
  if (!binding) {
    return "missing-binding" as const
  }

  const { draft, plan } = binding
  assertBoundPreviewPlan(draft, plan)

  if (canonicalJson(context) !== canonicalJson(draft.input.context)) {
    throw new Error("show-library:projection-context-mismatch")
  }

  if (
    binding.phase !== snapshot.phase ||
    canonicalJson(binding.clock) !== canonicalJson(snapshot.clock)
  ) {
    throw new Error("show-library:projection-clock-phase-mismatch")
  }

  const q = snapshot.question

  if (!q) {
    return "missing-question" as const
  }

  if (q.id !== binding.currentQuestionId) {
    throw new Error("show-library:projection-question-mismatch")
  }

  const card = draft.show.cards.find(
    (candidateCard) =>
      (candidateCard.kind === "quiz" || candidateCard.kind === "survey") &&
      getPreviewIdentityId(
        draft.input.identityMap,
        "questions",
        candidateCard.key,
      ) === q.id,
  )

  if (!card || (card.kind !== "quiz" && card.kind !== "survey")) {
    throw new Error("show-library:projection-question-mismatch")
  }

  if (
    q.questionType !== card.questionType ||
    q.playMode !== card.kind ||
    q.text !== card.question
  ) {
    throw new Error("show-library:projection-question-type-mismatch")
  }

  if (q.questionType === "estimation") {
    if (
      !q.estimation ||
      canonicalJson(q.estimation) !== canonicalJson(card.options) ||
      q.choices.length !== 0
    ) {
      throw new Error("show-library:projection-estimation-mismatch")
    }
  } else {
    if (
      q.estimation ||
      q.choices.length !== card.answers.length ||
      q.choices.some(
        (c, i) =>
          c.id !== `${q.id}.choice.${i + 1}` ||
          c.label !== card.answers[i].text,
      )
    ) {
      throw new Error("show-library:projection-choice-mismatch")
    }
  }

  if (
    context.role !== "player" ||
    snapshot.phase !== "voting" ||
    !snapshot.canAnswer ||
    snapshot.clock.paused ||
    (snapshot.clock.deadlineMs !== null &&
      snapshot.clock.elapsedMs >= snapshot.clock.deadlineMs)
  ) {
    return "inactive" as const
  }

  const support = plan.capabilities.questions.find(
    (item) => item.questionId === q.id,
  )

  if (
    !support ||
    support.questionType !== q.questionType ||
    support.playMode !== q.playMode ||
    support.answerCount !==
      (q.questionType === "estimation" ? null : q.choices.length)
  ) {
    throw new Error("show-library:projection-capability-mismatch")
  }

  const { resolution } = plan

  if (
    resolution.kind === "unavailable" ||
    support.support === "unavailable" ||
    !plan.capabilities.localSelection ||
    !plan.capabilities.supportedRoles.includes(context.role)
  ) {
    return "unavailable" as const
  }

  if (
    !getCompiledPreviewManifest().pins.some(
      (pin) => canonicalJson(pin) === canonicalJson(resolution.pin),
    )
  ) {
    return "unavailable" as const
  }

  return "ready" as const
}

import { assertBoundedJson, freeze, type PreviewPhase } from "./primitives"
import {
  type PreviewPlan,
  type PreviewContext,
  type DemoClockSnapshot,
  previewContextSchema,
} from "./preview-schemas"
import {
  type DemoPresentationSnapshot,
  demoPresentationSnapshotSchema,
  showProjectionSchema,
  type ShowProjection,
} from "./projection-schema"

const questionPhases: readonly PreviewPhase[] = [
  "question",
  "answerCards",
  "voting",
  "voteLocked",
  "results",
]
const choicePhases: readonly PreviewPhase[] = [
  "answerCards",
  "voting",
  "voteLocked",
  "results",
]
const clockPhases: readonly PreviewPhase[] = [
  "question",
  "answerCards",
  "voting",
  "voteLocked",
  "interlude",
]

/** Demo-only projection. Full drafts, live contexts and future-question fields are invalid input. */
export function projectShowBindings(
  input: unknown,
  contextInput: unknown,
  binding?: PreviewProjectionBinding,
): Readonly<ShowProjection> {
  assertBoundedJson(input)
  assertBoundedJson(contextInput)
  const snapshot = demoPresentationSnapshotSchema.parse(input),
    context = previewContextSchema.parse(contextInput)
  const { phase } = snapshot,
    { question } = snapshot

  // No compiled visual-asset binding is implemented or accepted in this port.
  // Reject caller references even for genuine drafts/plans and declared assets.
  // A future resource path must derive current authored slots against a verified
  // immutable compiled manifest and asset policy before resolving any resource;
  // adding renderer pins alone must never lift this gate.
  if (question?.image || question?.choices.some((choice) => choice.asset)) {
    throw new Error("show-library:visual-assets-unavailable")
  }

  const readiness = answerReadiness(snapshot, context, binding)
  const ownSelection =
    context.role === "player" && (phase === "voting" || phase === "voteLocked")

  return freeze(
    showProjectionSchema.parse({
      portVersion: 3,
      identityRuleVersion: 2 as const,
      mode: "demo",
      synthetic: true,
      role: context.role,
      phase,
      join: "unavailable-demo",
      canAnswer: readiness === "ready",
      answerReadiness: readiness,
      ...(question && questionPhases.includes(phase)
        ? {
            question: {
              id: question.id,
              text: question.text,
              questionType: question.questionType,
              playMode: question.playMode,
              ...(question.estimation
                ? { estimation: question.estimation }
                : {}),
              ...(question.image ? { image: question.image } : {}),
            },
          }
        : {}),
      ...(question && choicePhases.includes(phase)
        ? { choices: question.choices }
        : {}),
      ...(phase === "results" && snapshot.results
        ? { results: snapshot.results }
        : {}),
      ...((phase === "leaderboard" || phase === "closing") && snapshot.leaders
        ? { leaders: snapshot.leaders }
        : {}),
      ...(phase === "personalResult" &&
      context.role === "player" &&
      snapshot.personalResult
        ? { personalResult: snapshot.personalResult }
        : {}),
      ...(ownSelection && snapshot.selectedAnswerIds
        ? { selectedAnswerIds: snapshot.selectedAnswerIds }
        : {}),
      ...(clockPhases.includes(phase) ? { clock: snapshot.clock } : {}),
      ...((phase === "voting" ||
        phase === "voteLocked" ||
        phase === "results") &&
      context.role !== "player" &&
      snapshot.responders !== undefined &&
      snapshot.eligible !== undefined
        ? {
            voteProgress: {
              responders: snapshot.responders,
              eligible: snapshot.eligible,
            },
          }
        : {}),
      ...(snapshot.title ? { title: snapshot.title } : {}),
    }),
  )
}
