import { z } from "zod"
import {
  cardAudioOverridesSchema,
  cardBackgroundOverrideSchema,
  cardStageAnimationsSchema,
  showMediaCatalogItemSchema,
} from "./card-appearance"
import {
  ANSWER_DISPLAYS,
  CUE_IDS,
  LEADERBOARD_MODES,
  REVEAL_AUDIENCES,
  REVEAL_EFFECTS,
  REVEAL_TRIGGERS,
} from "./constants"
import {
  interludeSchema,
  isSafeMediaUrl,
  questionRevealSchema,
  type Interlude,
} from "./media"
import {
  sceneAudioSchema,
  studioDefaultsSchema,
} from "./studio-timeline-schema"
import {
  audioExtrasSchema,
  questionEntranceSchema,
  teamsExtrasSchema,
  type QuestionEntrance,
} from "./quiz-extras"
import { rosterExtrasSchema } from "./phone-roster"
import { questionMediaValidator } from "@razzia/common/validators/quizz"
import { multiOptionsValidator } from "@razzia/common/validators/questions/choice"
import { estimationOptionsValidator } from "@razzia/common/validators/questions/estimation"
import { MAX_ANSWERS } from "@razzia/common/constants"

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
    answers: z.array(authoredAnswerSchema).min(2).max(MAX_ANSWERS),
    correctAnswers: z.array(z.number().int().min(1).max(MAX_ANSWERS)).min(1),
    options: z
      .union([multiOptionsValidator, estimationOptionsValidator])
      .optional(),
    reveal: questionRevealSchema.optional(),
    interlude: interludeSchema.optional(),
    questionEntrance: questionEntranceSchema.optional(),
    background: cardBackgroundOverrideSchema.optional(),
    audioCues: cardAudioOverridesSchema.optional(),
    stageAnimations: cardStageAnimationsSchema.optional(),
    extraJson: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((card, ctx) => {
    if (card.media?.url && !isSafeMediaUrl(card.media.url)) {
      ctx.addIssue({
        code: "custom",
        path: ["media", "url"],
        message: "errors:extensions.invalidMediaUrl",
      })
    }
    if (card.extraJson && Object.keys(card.extraJson).length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraJson"],
        message: "errors:extensions.unsupportedExtraJson",
      })
    }
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

export const authoredSurveyCardSchema = z
  .strictObject({
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
    answers: z.array(authoredAnswerSchema).min(2).max(MAX_ANSWERS),
    correctAnswers: z.array(z.number().int()).max(0).optional(),
    options: z
      .union([multiOptionsValidator, estimationOptionsValidator])
      .optional(),
    reveal: questionRevealSchema.optional(),
    interlude: interludeSchema.optional(),
    questionEntrance: questionEntranceSchema.optional(),
    background: cardBackgroundOverrideSchema.optional(),
    audioCues: cardAudioOverridesSchema.optional(),
    stageAnimations: cardStageAnimationsSchema.optional(),
    extraJson: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((card, ctx) => {
    if (card.media?.url && !isSafeMediaUrl(card.media.url)) {
      ctx.addIssue({
        code: "custom",
        path: ["media", "url"],
        message: "errors:extensions.invalidMediaUrl",
      })
    }
    if (card.extraJson && Object.keys(card.extraJson).length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraJson"],
        message: "errors:extensions.unsupportedExtraJson",
      })
    }
  })

export type AuthoredSurveyCard = z.infer<typeof authoredSurveyCardSchema>

export const authoredTransitionCardSchema = z
  .strictObject({
    key: z.string().min(1),
    kind: z.literal("transition"),
    title: z.string().max(120).optional(),
    description: z.string().max(500).optional(),
    durationMs: z.number().int().min(500).max(60000).default(5000),
    advance: z.enum(["auto", "manual"]).default("auto"),
    background: cardBackgroundOverrideSchema.optional(),
    audio: sceneAudioSchema.optional(),
    stageAnimations: cardStageAnimationsSchema.optional(),
    extraJson: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((card, ctx) => {
    if (card.extraJson && Object.keys(card.extraJson).length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraJson"],
        message: "errors:extensions.unsupportedExtraJson",
      })
    }
  })

export type AuthoredTransitionCard = z.infer<typeof authoredTransitionCardSchema>

export const authoredAnimationCardSchema = z
  .strictObject({
    key: z.string().min(1),
    kind: z.literal("animation"),
    preset: z.string().max(64).default("spotlight"),
    title: z.string().max(120).optional(),
    durationMs: z.number().int().min(500).max(60000).default(3000),
    advance: z.enum(["auto", "manual"]).default("auto"),
    background: cardBackgroundOverrideSchema.optional(),
    audio: sceneAudioSchema.optional(),
    stageAnimations: cardStageAnimationsSchema.optional(),
    extraJson: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((card, ctx) => {
    if (card.extraJson && Object.keys(card.extraJson).length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraJson"],
        message: "errors:extensions.unsupportedExtraJson",
      })
    }
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
    background: cardBackgroundOverrideSchema.optional(),
    audio: sceneAudioSchema.optional(),
    stageAnimations: cardStageAnimationsSchema.optional(),
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
    if (data.extraJson && Object.keys(data.extraJson).length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraJson"],
        message: "errors:extensions.unsupportedExtraJson",
      })
    }
  })

export type AuthoredMediaCard = z.infer<typeof authoredMediaCardSchema>

export const authoredLeaderboardCardSchema = z
  .strictObject({
    key: z.string().min(1),
    kind: z.literal("leaderboard"),
    title: z.string().max(120).optional(),
    durationMs: z.number().int().min(500).max(60000).default(5000),
    advance: z.enum(["auto", "manual"]).default("auto"),
    background: cardBackgroundOverrideSchema.optional(),
    audio: sceneAudioSchema.optional(),
    stageAnimations: cardStageAnimationsSchema.optional(),
    extraJson: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((card, ctx) => {
    if (card.extraJson && Object.keys(card.extraJson).length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraJson"],
        message: "errors:extensions.unsupportedExtraJson",
      })
    }
  })

export type AuthoredLeaderboardCard = z.infer<
  typeof authoredLeaderboardCardSchema
>

export const authoredInterimResultsCardSchema = z
  .strictObject({
    key: z.string().min(1),
    kind: z.literal("interimResults"),
    title: z.string().max(120).optional(),
    durationMs: z.number().int().min(500).max(60000).default(5000),
    advance: z.enum(["auto", "manual"]).default("auto"),
    background: cardBackgroundOverrideSchema.optional(),
    audio: sceneAudioSchema.optional(),
    stageAnimations: cardStageAnimationsSchema.optional(),
    extraJson: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((card, ctx) => {
    if (card.extraJson && Object.keys(card.extraJson).length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraJson"],
        message: "errors:extensions.unsupportedExtraJson",
      })
    }
  })

export type AuthoredInterimResultsCard = z.infer<
  typeof authoredInterimResultsCardSchema
>

export const authoredCountdownCardSchema = z
  .strictObject({
    key: z.string().min(1),
    kind: z.literal("countdown"),
    durationSeconds: z.number().int().min(3).max(120).default(10),
    title: z.string().max(120).optional(),
    advance: z.enum(["auto", "manual"]).default("auto"),
    background: cardBackgroundOverrideSchema.optional(),
    audio: sceneAudioSchema.optional(),
    stageAnimations: cardStageAnimationsSchema.optional(),
    extraJson: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((card, ctx) => {
    if (card.extraJson && Object.keys(card.extraJson).length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraJson"],
        message: "errors:extensions.unsupportedExtraJson",
      })
    }
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
    background: cardBackgroundOverrideSchema.optional(),
    audio: sceneAudioSchema.optional(),
    stageAnimations: cardStageAnimationsSchema.optional(),
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
    if (data.extraJson && Object.keys(data.extraJson).length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraJson"],
        message: "errors:extensions.unsupportedExtraJson",
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
    background: cardBackgroundOverrideSchema.optional(),
    audio: sceneAudioSchema.optional(),
    stageAnimations: cardStageAnimationsSchema.optional(),
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
    if (data.extraJson && Object.keys(data.extraJson).length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraJson"],
        message: "errors:extensions.unsupportedExtraJson",
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

export const authoredSettingSchema = z
  .strictObject({
    scope: z.string().min(1),
    targetKey: z.string(),
    property: z.string().min(1),
    valueJson: z.unknown(),
  })
  .superRefine((setting, ctx) => {
    if (setting.targetKey !== "show") {
      ctx.addIssue({
        code: "custom",
        path: ["targetKey"],
        message: `errors:extensions.unsupportedSettingTargetKey:${setting.scope}.${setting.targetKey}`,
      })
    }
    if (setting.scope === "leaderboard") {
      if (setting.property === "mode") {
        const parsed = z.enum(LEADERBOARD_MODES).safeParse(setting.valueJson)
        if (!parsed.success) {
          ctx.addIssue({
            code: "custom",
            path: ["valueJson"],
            message: "errors:extensions.invalidSettingValue:leaderboard.mode",
          })
        }
      } else if (setting.property === "everyN") {
        const parsed = z
          .number()
          .int()
          .min(1)
          .max(100)
          .safeParse(setting.valueJson)
        if (!parsed.success) {
          ctx.addIssue({
            code: "custom",
            path: ["valueJson"],
            message: "errors:extensions.invalidSettingValue:leaderboard.everyN",
          })
        }
      } else if (setting.property === "afterQuestionIds") {
        const parsed = z.array(z.string().min(1)).safeParse(setting.valueJson)
        if (!parsed.success) {
          ctx.addIssue({
            code: "custom",
            path: ["valueJson"],
            message:
              "errors:extensions.invalidSettingValue:leaderboard.afterQuestionIds",
          })
        }
      } else {
        ctx.addIssue({
          code: "custom",
          path: ["property"],
          message: `errors:extensions.unsupportedSettingProperty:${setting.scope}.${setting.property}`,
        })
      }
    } else if (setting.scope === "team") {
      if (setting.property === "config") {
        const parsed = teamsExtrasSchema.safeParse(setting.valueJson)
        if (!parsed.success) {
          ctx.addIssue({
            code: "custom",
            path: ["valueJson"],
            message: "errors:extensions.invalidSettingValue:team.config",
          })
        }
      } else {
        ctx.addIssue({
          code: "custom",
          path: ["property"],
          message: `errors:extensions.unsupportedSettingProperty:${setting.scope}.${setting.property}`,
        })
      }
    } else if (setting.scope === "audio") {
      if (setting.property === "cues") {
        const parsed = audioExtrasSchema.shape.cues.partial().safeParse(setting.valueJson)
        if (!parsed.success) {
          ctx.addIssue({
            code: "custom",
            path: ["valueJson"],
            message: "errors:extensions.invalidSettingValue:audio.cues",
          })
        }
      } else {
        ctx.addIssue({
          code: "custom",
          path: ["property"],
          message: `errors:extensions.unsupportedSettingProperty:${setting.scope}.${setting.property}`,
        })
      }
    } else if (setting.scope === "roster") {
      if (setting.property === "config") {
        const parsed = rosterExtrasSchema.safeParse(setting.valueJson)
        if (!parsed.success) {
          ctx.addIssue({
            code: "custom",
            path: ["valueJson"],
            message: "errors:extensions.invalidSettingValue:roster.config",
          })
        }
      } else {
        ctx.addIssue({
          code: "custom",
          path: ["property"],
          message: `errors:extensions.unsupportedSettingProperty:${setting.scope}.${setting.property}`,
        })
      }
    } else if (setting.scope === "media") {
      if (setting.property === "catalog") {
        const parsed = z
          .array(showMediaCatalogItemSchema)
          .max(500)
          .safeParse(setting.valueJson)
        if (!parsed.success) {
          ctx.addIssue({
            code: "custom",
            path: ["valueJson"],
            message: "errors:extensions.invalidSettingValue:media.catalog",
          })
        }
      } else {
        ctx.addIssue({
          code: "custom",
          path: ["property"],
          message: `errors:extensions.unsupportedSettingProperty:${setting.scope}.${setting.property}`,
        })
      }
    } else {
      ctx.addIssue({
        code: "custom",
        path: ["scope"],
        message: `errors:extensions.unsupportedSettingScope:${setting.scope}`,
      })
    }
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
    const questionKeys = new Set<string>()
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
        questionKeys.add(card.key)
      }
    }

    if (questionCount === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["cards"],
        message: "errors:quizz.noQuestions",
      })
    }

    // Validate settings uniqueness and leaderboard references
    const seenSettings = new Set<string>()
    for (let sIdx = 0; sIdx < show.settings.length; sIdx += 1) {
      const s = show.settings[sIdx]
      const settingId = `${s.scope}::${s.property}::${s.targetKey}`
      if (seenSettings.has(settingId)) {
        ctx.addIssue({
          code: "custom",
          path: ["settings", sIdx],
          message: `errors:extensions.duplicateSetting:${s.scope}.${s.property}`,
        })
      }
      seenSettings.add(settingId)

      if (
        s.scope === "leaderboard" &&
        s.property === "afterQuestionIds" &&
        Array.isArray(s.valueJson)
      ) {
        for (let kIdx = 0; kIdx < s.valueJson.length; kIdx += 1) {
          const k = String(s.valueJson[kIdx])
          if (!questionKeys.has(k)) {
            ctx.addIssue({
              code: "custom",
              path: ["settings", sIdx, "valueJson", kIdx],
              message: `errors:extensions.unknownQuestionKeyRef:${k}`,
            })
          }
        }
      }
    }
  })

export type TadaShowV1 = z.input<typeof tadaShowV1Schema>
export type TadaShowV1Output = z.infer<typeof tadaShowV1Schema>

export const isTadaShowV1 = (data: unknown): data is TadaShowV1 =>
  tadaShowV1Schema.safeParse(data).success
