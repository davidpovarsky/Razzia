import { z } from "zod"
import {
  ANSWER_DISPLAYS,
  CUE_IDS,
  LEADERBOARD_MODES,
  REVEAL_AUDIENCES,
  REVEAL_EFFECTS,
  REVEAL_TRIGGERS,
} from "./constants"
import { isSafeMediaUrl, questionRevealSchema } from "./media"
import { studioDefaultsSchema } from "./studio-timeline-schema"
import { questionMediaValidator } from "@razzia/common/validators/quizz"
import { multiOptionsValidator } from "@razzia/common/validators/questions/choice"
import { estimationOptionsValidator } from "@razzia/common/validators/questions/estimation"

export const TADA_SHOW_FORMAT = "tada-show" as const
export const TADA_SHOW_VERSION = 1 as const

export const authoredAnswerSchema = z
  .strictObject({
    text: z.string().min(1, "errors:quizz.answerEmpty"),
    display: z.enum(ANSWER_DISPLAYS).default("text"),
    imageUrl: z.string().optional(),
    alt: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.display === "image" || data.display === "both") {
      if (!data.imageUrl || !isSafeMediaUrl(data.imageUrl)) {
        ctx.addIssue({
          code: "custom",
          path: ["imageUrl"],
          message: "errors:extensions.invalidMediaUrl",
        })
      }

      if (!data.alt || data.alt.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["alt"],
          message: "errors:extensions.altRequiredForImage",
        })
      }
    } else if (data.imageUrl && !isSafeMediaUrl(data.imageUrl)) {
      ctx.addIssue({
        code: "custom",
        path: ["imageUrl"],
        message: "errors:extensions.invalidMediaUrl",
      })
    }
  })

export type AuthoredAnswer = z.input<typeof authoredAnswerSchema>
export type AuthoredAnswerOutput = z.infer<typeof authoredAnswerSchema>

export const authoredQuizCardSchema = z
  .strictObject({
    key: z.string().min(1),
    kind: z.literal("quiz"),
    questionType: z.enum(["single", "multi", "estimation"]).default("single"),
    question: z.string().min(1, "errors:quizz.questionEmpty"),
    category: z.string().optional(),
    note: z.string().optional(),
    timeSeconds: z.number().int().min(-1).default(20),
    cooldownSeconds: z.number().int().min(3).max(15).default(3),
    maxPoints: z.number().int().min(0).default(1000),
    penalty: z.number().int().min(0).default(0),
    media: questionMediaValidator.optional(),
    answers: z.array(authoredAnswerSchema).min(2).max(4),
    correctAnswers: z.array(z.number().int().min(1).max(4)).min(1),
    options: z
      .union([multiOptionsValidator, estimationOptionsValidator])
      .optional(),
    reveal: questionRevealSchema.optional(),
    extraJson: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((card, ctx) => {
    for (const ansNum of card.correctAnswers) {
      if (ansNum > card.answers.length) {
        ctx.addIssue({
          code: "custom",
          path: ["correctAnswers"],
          message: `errors:quizz.solutionOutOfBounds:${ansNum}`,
        })
      }
    }
  })

export type AuthoredQuizCard = z.infer<typeof authoredQuizCardSchema>

export const authoredSurveyCardSchema = z.strictObject({
  key: z.string().min(1),
  kind: z.literal("survey"),
  questionType: z.enum(["single", "multi", "estimation"]).default("single"),
  question: z.string().min(1, "errors:quizz.questionEmpty"),
  category: z.string().optional(),
  note: z.string().optional(),
  timeSeconds: z.number().int().min(-1).default(20),
  cooldownSeconds: z.number().int().min(3).max(15).default(3),
  maxPoints: z.number().int().min(0).default(0),
  penalty: z.number().int().min(0).default(0),
  media: questionMediaValidator.optional(),
  answers: z.array(authoredAnswerSchema).min(2).max(4),
  correctAnswers: z.array(z.number().int()).max(0).optional(),
  options: z
    .union([multiOptionsValidator, estimationOptionsValidator])
    .optional(),
  reveal: questionRevealSchema.optional(),
  extraJson: z.record(z.string(), z.unknown()).optional(),
})

export type AuthoredSurveyCard = z.infer<typeof authoredSurveyCardSchema>

export const authoredTransitionCardSchema = z.strictObject({
  key: z.string().min(1),
  kind: z.literal("transition"),
  title: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  durationMs: z.number().int().min(500).max(60000).default(5000),
  advance: z.enum(["auto", "manual"]).default("auto"),
  extraJson: z.record(z.string(), z.unknown()).optional(),
})

export type AuthoredTransitionCard = z.infer<typeof authoredTransitionCardSchema>

export const authoredAnimationCardSchema = z.strictObject({
  key: z.string().min(1),
  kind: z.literal("animation"),
  preset: z.string().max(64).default("spotlight"),
  title: z.string().max(120).optional(),
  durationMs: z.number().int().min(500).max(60000).default(3000),
  advance: z.enum(["auto", "manual"]).default("auto"),
  extraJson: z.record(z.string(), z.unknown()).optional(),
})

export type AuthoredAnimationCard = z.infer<typeof authoredAnimationCardSchema>

export const authoredMediaCardSchema = z
  .strictObject({
    key: z.string().min(1),
    kind: z.literal("media"),
    mediaUrl: z.string().default(""),
    mediaType: z.enum(["image", "video"]).default("image"),
    title: z.string().max(120).optional(),
    durationMs: z.number().int().min(500).max(300000).default(5000),
    advance: z.enum(["auto", "manual"]).default("auto"),
    extraJson: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mediaUrl && !isSafeMediaUrl(data.mediaUrl)) {
      ctx.addIssue({
        code: "custom",
        path: ["mediaUrl"],
        message: "errors:extensions.invalidMediaUrl",
      })
    }
  })

export type AuthoredMediaCard = z.infer<typeof authoredMediaCardSchema>

export const authoredLeaderboardCardSchema = z.strictObject({
  key: z.string().min(1),
  kind: z.literal("leaderboard"),
  title: z.string().max(120).optional(),
  durationMs: z.number().int().min(500).max(60000).default(5000),
  advance: z.enum(["auto", "manual"]).default("auto"),
  extraJson: z.record(z.string(), z.unknown()).optional(),
})

export type AuthoredLeaderboardCard = z.infer<
  typeof authoredLeaderboardCardSchema
>

export const authoredInterimResultsCardSchema = z.strictObject({
  key: z.string().min(1),
  kind: z.literal("interimResults"),
  title: z.string().max(120).optional(),
  durationMs: z.number().int().min(500).max(60000).default(5000),
  advance: z.enum(["auto", "manual"]).default("auto"),
  extraJson: z.record(z.string(), z.unknown()).optional(),
})

export type AuthoredInterimResultsCard = z.infer<
  typeof authoredInterimResultsCardSchema
>

export const authoredCountdownCardSchema = z.strictObject({
  key: z.string().min(1),
  kind: z.literal("countdown"),
  durationSeconds: z.number().int().min(3).max(120).default(10),
  title: z.string().max(120).optional(),
  advance: z.enum(["auto", "manual"]).default("auto"),
  extraJson: z.record(z.string(), z.unknown()).optional(),
})

export type AuthoredCountdownCard = z.infer<typeof authoredCountdownCardSchema>

export const authoredOpeningCardSchema = z
  .strictObject({
    key: z.string().min(1),
    kind: z.literal("opening"),
    title: z.string().min(1).max(120),
    subtitle: z.string().max(200).optional(),
    mediaUrl: z.string().optional(),
    durationMs: z.number().int().min(500).max(60000).default(5000),
    advance: z.enum(["auto", "manual"]).default("auto"),
    extraJson: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mediaUrl && !isSafeMediaUrl(data.mediaUrl)) {
      ctx.addIssue({
        code: "custom",
        path: ["mediaUrl"],
        message: "errors:extensions.invalidMediaUrl",
      })
    }
  })

export type AuthoredOpeningCard = z.infer<typeof authoredOpeningCardSchema>

export const authoredClosingCardSchema = z
  .strictObject({
    key: z.string().min(1),
    kind: z.literal("closing"),
    title: z.string().min(1).max(120),
    subtitle: z.string().max(200).optional(),
    mediaUrl: z.string().optional(),
    durationMs: z.number().int().min(500).max(60000).default(5000),
    advance: z.enum(["auto", "manual"]).default("auto"),
    extraJson: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mediaUrl && !isSafeMediaUrl(data.mediaUrl)) {
      ctx.addIssue({
        code: "custom",
        path: ["mediaUrl"],
        message: "errors:extensions.invalidMediaUrl",
      })
    }
  })

export type AuthoredClosingCard = z.infer<typeof authoredClosingCardSchema>

export const authoredCardSchema = z.discriminatedUnion("kind", [
  authoredQuizCardSchema,
  authoredSurveyCardSchema,
  authoredTransitionCardSchema,
  authoredAnimationCardSchema,
  authoredMediaCardSchema,
  authoredLeaderboardCardSchema,
  authoredInterimResultsCardSchema,
  authoredCountdownCardSchema,
  authoredOpeningCardSchema,
  authoredClosingCardSchema,
])

export type AuthoredCard = z.input<typeof authoredCardSchema>
export type AuthoredCardOutput = z.infer<typeof authoredCardSchema>

export const authoredSettingSchema = z.strictObject({
  scope: z.enum([
    "show",
    "question",
    "scene",
    "leaderboard",
    "audio",
    "team",
    "roster",
  ]),
  targetKey: z.string().min(1),
  property: z.string().min(1),
  valueJson: z.unknown(),
})

export type AuthoredSetting = z.infer<typeof authoredSettingSchema>

export const tadaShowV1Schema = z
  .strictObject({
    format: z.literal(TADA_SHOW_FORMAT),
    version: z.literal(TADA_SHOW_VERSION),
    title: z.string().min(1, "errors:quizz.subjectEmpty"),
    note: z.string().optional(),
    baseGameMode: z.enum(["quiz", "survey"]).default("quiz"),
    defaults: studioDefaultsSchema.partial().optional(),
    cards: z.array(authoredCardSchema).min(1, "errors:quizz.noQuestions"),
    settings: z.array(authoredSettingSchema).default([]),
  })
  .superRefine((show, ctx) => {
    const cardKeys = new Set<string>()
    let questionCount = 0

    for (let i = 0; i < show.cards.length; i += 1) {
      const card = show.cards[i]

      if (cardKeys.has(card.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["cards", i, "key"],
          message: `errors:extensions.duplicateCardKey:${card.key}`,
        })
      }

      cardKeys.add(card.key)

      if (card.kind === "quiz" || card.kind === "survey") {
        questionCount += 1
      }
    }

    if (questionCount === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["cards"],
        message: "errors:quizz.noQuestions",
      })
    }
  })

export type TadaShowV1 = z.input<typeof tadaShowV1Schema>
export type TadaShowV1Output = z.infer<typeof tadaShowV1Schema>

export const isTadaShowV1 = (data: unknown): data is TadaShowV1 =>
  tadaShowV1Schema.safeParse(data).success
