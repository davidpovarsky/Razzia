// Synthetic host-only V2 producer. Never imported by the renderer payload.
import { z } from "zod"
import {
  authoredFixture,
  previewInputFixture,
} from "../../src/core/show-library/preview-fixtures"
import { withNativePresentationV2 } from "../../src/core/show-library/composition-document-v2"
import { prepareCompositionPreviewV2 } from "../../src/core/show-library/composition-preview-v2"
import {
  assertCompositionNativePreviewInputV2,
  produceCompositionNativePreviewInputV2,
} from "../../src/core/show-library/native-preview-renderer-v2"
import { localizedFixtureText } from "./localized-fixture"

export const qaNativeV2Query = z.strictObject({
  theme: z
    .enum(["tadazz-classic", "razzia-original"])
    .default("tadazz-classic"),
  locale: z
    .enum(["en", "fr", "de", "es", "it", "ja", "tr", "vi", "he"])
    .default("en"),
  role: z.enum(["manager", "spectator"]).default("spectator"),
  phase: z
    .enum(["question", "answerCards", "voting", "voteLocked", "results"])
    .default("results"),
  question: z.enum(["0", "1"]).default("0"),
  count: z.enum(["2", "3", "4", "5"]).default("5"),
  mode: z.enum(["quiz", "survey"]).default("quiz"),
  paused: z.enum(["true", "false"]).default("true"),
  effect: z.enum(["none", "fade"]).default("none"),
})

export function qaNativeV2Input(query: unknown) {
  const input = qaNativeV2Query.parse(query)
  const raw = authoredFixture(Number(input.count), 5)
  const text = localizedFixtureText[input.locale]
  const show = {
    ...raw,
    baseGameMode: input.mode,
    cards: raw.cards.map(({ correctAnswers, ...card }, ordinal) => ({
      ...card,
      kind: input.mode,
      ...(input.mode === "quiz" ? { correctAnswers } : {}),
      question: `${text.question} ${ordinal + 1}`,
      answers: card.answers.map((answer, index) => ({
        ...answer,
        text: text.choices[index],
      })),
    })),
  }
  const fixture = previewInputFixture(show)
  const document = withNativePresentationV2(
    {
      format: "tadazz-show-composition",
      schemaVersion: 1,
      selection: { id: input.theme, version: "1.0.0", overrides: {} },
      composition: {
        schemaVersion: 1,
        id: "native-v2-qa",
        version: "1.0.0",
        baseTheme: { id: input.theme, version: "1.0.0" },
        registry: { id: "candidate-registry", version: "1.0.0" },
        sections: {},
        roles: {},
        scopes: [],
      },
      scopes: [],
    },
    {
      format: "tadazz-native-presentation-settings",
      schemaVersion: 1,
      defaults:
        input.effect === "fade"
          ? {
              stageAnimations: {
                questionEntrance: {
                  preset: "fade",
                  durationMs: 800,
                  timing: "simultaneous",
                  staggerMs: 90,
                },
              },
              questionDecoration: { enabled: true, preset: "pulse-bar" },
            }
          : {},
      roles:
        input.effect === "fade"
          ? {
              spectator: {
                stageAnimations: {
                  answerEntrance: {
                    preset: "slide-up",
                    durationMs: 800,
                    timing: "sequential",
                    staggerMs: 90,
                  },
                },
              },
            }
          : {},
      cards: [],
    },
  )
  const prepared = prepareCompositionPreviewV2(
    {
      ...fixture,
      context: { ...fixture.context, role: input.role, locale: input.locale },
    },
    document,
    { draftRevision: 1 },
  )
  const card = prepared.draft.show.cards.at(Number(input.question))

  if (!card || (card.kind !== "quiz" && card.kind !== "survey")) {
    throw new Error("qa:unexpected-card")
  }

  const questionId = prepared.draft.input.identityMap.questions.find(
    (entry) => entry.authoredKey === card.key,
  )?.previewId

  if (!questionId) {
    throw new Error("qa:missing-identity")
  }

  const choices = card.answers.map((answer, index) => ({
    id: `${questionId}.choice.${index + 1}`,
    label: answer.text,
  }))
  const firstChoice = choices.at(0)

  if (!firstChoice) {
    throw new Error("qa:missing-choice")
  }

  const clock = {
    epoch: 1,
    sequence: 1,
    elapsedMs: input.phase === "results" ? 20000 : 5000,
    deadlineMs: 20000,
    paused: input.paused === "true",
  }
  const binding = {
    draft: prepared.draft,
    plan: prepared.plan,
    currentQuestionId: questionId,
    phase: input.phase,
    clock,
  }
  const snapshot = {
    portVersion: 3,
    identityRuleVersion: 2,
    source: "deterministic-fixture",
    phase: input.phase,
    clock,
    question: {
      id: questionId,
      text: card.question,
      questionType: card.questionType,
      playMode: card.kind,
      choices,
      solutionAnswerIds: card.kind === "quiz" ? [firstChoice.id] : [],
    },
    ...(input.phase === "results"
      ? {
          results: choices.map((choice, index) => ({
            answerId: choice.id,
            count: 0,
            percent: 0,
            ...(card.kind === "quiz" ? { correct: index === 0 } : {}),
          })),
        }
      : {}),
    canAnswer: false,
    responders: 0,
    eligible: 0,
  }
  const candidate = produceCompositionNativePreviewInputV2(
    prepared,
    snapshot,
    binding,
  )

  if (candidate.kind !== "candidate") {
    throw new Error(`qa:v2-unavailable:${candidate.diagnostics.join(",")}`)
  }

  assertCompositionNativePreviewInputV2(prepared, binding, candidate.input)

  return candidate.input
}
