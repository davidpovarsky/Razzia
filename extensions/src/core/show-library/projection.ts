import { assertBoundedJson, freeze, type PreviewPhase } from "./primitives"
import { previewContextSchema } from "./preview-schemas"
import {
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
): Readonly<ShowProjection> {
  assertBoundedJson(input)
  assertBoundedJson(contextInput)
  const snapshot = demoPresentationSnapshotSchema.parse(input),
    context = previewContextSchema.parse(contextInput)
  const { phase } = snapshot,
    question = snapshot.question
  const ownSelection =
    context.role === "player" && (phase === "voting" || phase === "voteLocked")
  return freeze(
    showProjectionSchema.parse({
      portVersion: 2,
      mode: "demo",
      synthetic: true,
      role: context.role,
      phase,
      join: "unavailable-demo",
      canAnswer:
        context.role === "player" &&
        phase === "voting" &&
        snapshot.canAnswer &&
        !snapshot.clock.paused,
      ...(question && questionPhases.includes(phase)
        ? {
            question: {
              id: question.id,
              text: question.text,
              questionType: question.questionType,
              playMode: question.playMode,
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
