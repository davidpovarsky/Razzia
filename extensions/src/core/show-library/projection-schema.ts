import { estimationOptionsValidator } from "@razzia/common/validators/questions/estimation"
import { z } from "zod"
import { assetReferenceSchema } from "./schemas"
import {
  identifierSchema,
  plainTextSchema,
  previewPhaseSchema,
} from "./primitives"
import { demoClockSnapshotSchema } from "./preview-schemas"

export const projectedChoiceSchema = z.strictObject({
  id: identifierSchema,
  label: plainTextSchema,
  asset: assetReferenceSchema.optional(),
})

const projectedEstimationSchema = estimationOptionsValidator
  .strict()
  .refine(
    (value) =>
      Number.isFinite(value.min) &&
      Number.isFinite(value.max) &&
      Number.isFinite(value.step) &&
      Number.isFinite(value.margin) &&
      value.min < value.max &&
      value.step > 0 &&
      value.margin >= 0,
  )
const questionSchema = z.strictObject({
  id: identifierSchema,
  text: plainTextSchema,
  questionType: z.enum(["single", "multi", "estimation"]),
  playMode: z.enum(["quiz", "survey"]),
  choices: z.array(projectedChoiceSchema).max(64),
  solutionAnswerIds: z.array(identifierSchema).max(64),
  estimation: projectedEstimationSchema.optional(),
  image: assetReferenceSchema.optional(),
})
const resultSchema = z.strictObject({
  answerId: identifierSchema,
  count: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
  correct: z.boolean().optional(),
  winner: z.boolean().optional(),
})
const leaderSchema = z.strictObject({
  label: plainTextSchema,
  score: z.number().finite(),
  rank: z.number().int().positive(),
})
const personalSchema = z.strictObject({
  correct: z.boolean(),
  points: z.number().finite(),
  rank: z.number().int().nonnegative(),
})

export const demoPresentationSnapshotSchema = z
  .strictObject({
    portVersion: z.literal(3),
    identityRuleVersion: z.literal(2),
    source: z.literal("deterministic-fixture"),
    phase: previewPhaseSchema,
    clock: demoClockSnapshotSchema,
    question: questionSchema.optional(),
    results: z.array(resultSchema).max(64).optional(),
    leaders: z.array(leaderSchema).max(100).optional(),
    personalResult: personalSchema.optional(),
    selectedAnswerIds: z.array(identifierSchema).max(64).optional(),
    responders: z.number().int().nonnegative().optional(),
    eligible: z.number().int().nonnegative().optional(),
    canAnswer: z.boolean().default(false),
    title: plainTextSchema.optional(),
  })
  .superRefine((s, ctx) => {
    const ids = new Set(s.question?.choices.map((c) => c.id) ?? [])

    if (ids.size !== (s.question?.choices.length ?? 0)) {
      ctx.addIssue({ code: "custom", message: "show-library:duplicate-choice" })
    }

    for (const id of [
      ...(s.question?.solutionAnswerIds ?? []),
      ...(s.selectedAnswerIds ?? []),
      ...(s.results?.map((r) => r.answerId) ?? []),
    ]) {
      if (!ids.has(id)) {
        ctx.addIssue({ code: "custom", message: "show-library:foreign-answer" })
      }
    }

    if (
      new Set(s.results?.map((r) => r.answerId)).size !==
      (s.results?.length ?? 0)
    ) {
      ctx.addIssue({ code: "custom", message: "show-library:duplicate-result" })
    }

    if (
      s.responders !== undefined &&
      s.eligible !== undefined &&
      s.responders > s.eligible
    ) {
      ctx.addIssue({
        code: "custom",
        message: "show-library:invalid-vote-progress",
      })
    }
  })

export const showProjectionSchema = z
  .strictObject({
    portVersion: z.literal(3),
    identityRuleVersion: z.literal(2),
    mode: z.literal("demo"),
    synthetic: z.literal(true),
    role: z.enum(["manager", "player", "spectator"]),
    phase: previewPhaseSchema,
    join: z.literal("unavailable-demo"),
    canAnswer: z.boolean(),
    answerReadiness: z.enum([
      "missing-binding",
      "missing-question",
      "inactive",
      "unavailable",
      "ready",
    ]),
    question: z
      .strictObject({
        id: identifierSchema,
        text: plainTextSchema,
        questionType: z.enum(["single", "multi", "estimation"]),
        playMode: z.enum(["quiz", "survey"]),
        estimation: projectedEstimationSchema.optional(),
        image: assetReferenceSchema.optional(),
      })
      .optional(),
    choices: z.array(projectedChoiceSchema).max(64).optional(),
    results: z.array(resultSchema).max(64).optional(),
    leaders: z.array(leaderSchema).max(100).optional(),
    personalResult: personalSchema.optional(),
    selectedAnswerIds: z.array(identifierSchema).max(64).optional(),
    clock: demoClockSnapshotSchema.optional(),
    voteProgress: z
      .strictObject({
        responders: z.number().int().nonnegative(),
        eligible: z.number().int().nonnegative(),
      })
      .optional(),
    title: plainTextSchema.optional(),
  })
  .superRefine((v, ctx) => {
    const deny = (message: string) =>
      ctx.addIssue({ code: "custom", message: `show-library:${message}` })

    // The producer currently emits no resource-ready references. Schema branding
    // cannot turn caller asset metadata into a trusted visual/resource grant.
    if (v.question?.image || v.choices?.some((choice) => choice.asset)) {
      deny("visual-assets-unavailable")
    }

    if (v.canAnswer !== (v.answerReadiness === "ready")) {
      deny("readiness-mismatch")
    }

    if (v.results && v.phase !== "results") {
      deny("results-before-reveal")
    }

    if (
      v.personalResult &&
      (v.role !== "player" || v.phase !== "personalResult")
    ) {
      deny("foreign-personal-result")
    }

    if (
      v.selectedAnswerIds &&
      (v.role !== "player" || !["voting", "voteLocked"].includes(v.phase))
    ) {
      deny("foreign-selection")
    }

    if (
      v.choices &&
      !["answerCards", "voting", "voteLocked", "results"].includes(v.phase)
    ) {
      deny("choices-before-reveal")
    }

    if (
      v.question &&
      !["question", "answerCards", "voting", "voteLocked", "results"].includes(
        v.phase,
      )
    ) {
      deny("question-outside-phase")
    }

    if (v.leaders && !["leaderboard", "closing"].includes(v.phase)) {
      deny("leaders-outside-phase")
    }

    if (
      v.clock &&
      ![
        "question",
        "answerCards",
        "voting",
        "voteLocked",
        "interlude",
      ].includes(v.phase)
    ) {
      deny("clock-outside-phase")
    }

    if (
      v.voteProgress &&
      (v.role === "player" ||
        !["voting", "voteLocked", "results"].includes(v.phase))
    ) {
      deny("vote-progress-role-phase")
    }

    if (
      v.canAnswer &&
      (v.role !== "player" ||
        v.phase !== "voting" ||
        !v.clock ||
        v.clock.paused ||
        !v.question ||
        v.answerReadiness !== "ready" ||
        (v.question.questionType === "estimation"
          ? !v.question.estimation || (v.choices?.length ?? 0) !== 0
          : (v.choices?.length ?? 0) < 2) ||
        (v.clock.deadlineMs !== null &&
          v.clock.elapsedMs >= v.clock.deadlineMs))
    ) {
      deny("cannot-answer")
    }
  })
  .brand<"ShowProjection">()

export type DemoPresentationSnapshot = z.infer<
  typeof demoPresentationSnapshotSchema
>

export type ShowProjection = z.infer<typeof showProjectionSchema>
