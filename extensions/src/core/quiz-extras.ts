import { z } from "zod"
import {
  cardAudioOverridesSchema,
  cardBackgroundOverrideSchema,
  cardStageAnimationsSchema,
  questionDecorationSchema,
  showMediaCatalogItemSchema,
} from "./card-appearance"
import {
  CUE_IDS,
  type CueId,
  DEFAULT_REVISION,
  LEADERBOARD_MODES,
  QUESTION_ENTRANCE_PRESETS,
  type QuestionEntrancePreset,
  SCHEMA_VERSION,
} from "./constants"
import {
  answerVisualSchema,
  interludeSchema,
  isSafeMediaUrl,
  questionRevealSchema,
} from "./media"
import {
  createDefaultRosterExtras,
  rosterExtrasSchema,
  type RosterExtras,
} from "./phone-roster"

export const leaderboardExtrasSchema = z
  .strictObject({
    mode: z.enum(LEADERBOARD_MODES),
    everyN: z.number().int().min(1).max(100).optional(),
    afterQuestionIds: z.array(z.uuid()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "everyN") {
      if (data.everyN === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["everyN"],
          message: "errors:extensions.everyNRequired",
        })
      }
    }
  })

export type LeaderboardExtras = z.infer<typeof leaderboardExtrasSchema>

export const teamDefinitionSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1).max(32),
  color: z.string().min(1),
})

export type TeamDefinition = z.infer<typeof teamDefinitionSchema>

export const teamsExtrasSchema = z
  .strictObject({
    enabled: z.boolean(),
    teams: z.array(teamDefinitionSchema),
    autoAssign: z.literal("roundRobin"),
  })
  .superRefine((data, ctx) => {
    const ids = data.teams.map((t) => t.id)

    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["teams"],
        message: "errors:extensions.duplicateTeamIds",
      })
    }

    if (data.enabled && (data.teams.length < 2 || data.teams.length > 12)) {
      ctx.addIssue({
        code: "custom",
        path: ["teams"],
        message: "errors:extensions.invalidTeamCount",
      })
    }
  })

export type TeamsExtras = z.infer<typeof teamsExtrasSchema>

export const audioCueSettingSchema = z
  .strictObject({
    source: z.enum(["default", "media"]),
    url: z.string().optional(),
    volume: z.number().min(0).max(1),
    enabled: z.boolean(),
    loop: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.source === "media") {
      if (!data.url || !isSafeMediaUrl(data.url)) {
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message: "errors:extensions.invalidMediaUrl",
        })
      }
    } else if (data.url && !isSafeMediaUrl(data.url)) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "errors:extensions.invalidMediaUrl",
      })
    }
  })

export type AudioCueSetting = z.infer<typeof audioCueSettingSchema>

const cuesSchemaMap = CUE_IDS.reduce(
  (acc, cueId) => {
    acc[cueId] = audioCueSettingSchema

    return acc
  },
  {} as Record<CueId, typeof audioCueSettingSchema>,
)

export const audioExtrasSchema = z.strictObject({
  cues: z.strictObject(cuesSchemaMap),
})

export type AudioExtras = z.infer<typeof audioExtrasSchema>

export const questionEntranceSchema = z.strictObject({
  preset: z.enum(QUESTION_ENTRANCE_PRESETS),
  durationMs: z.number().int().min(250).max(2500).default(800),
})

export type QuestionEntrance = z.infer<typeof questionEntranceSchema>

export const perQuestionItemSchema = z
  .strictObject({
    answerVisuals: z.array(answerVisualSchema).optional(),
    reveal: questionRevealSchema.optional(),
    interlude: interludeSchema.optional(),
    questionEntrance: questionEntranceSchema.optional(),
    background: cardBackgroundOverrideSchema.optional(),
    audioCues: cardAudioOverridesSchema.optional(),
    stageAnimations: cardStageAnimationsSchema.optional(),
    questionDecoration: questionDecorationSchema.optional(),
  })
  .superRefine((item, ctx) => {
    if (item.answerVisuals) {
      const indices = item.answerVisuals.map((v) => v.answerIndex)

      if (new Set(indices).size !== indices.length) {
        ctx.addIssue({
          code: "custom",
          path: ["answerVisuals"],
          message: "errors:extensions.duplicateAnswerIndex",
        })
      }
    }
  })

export type PerQuestionItem = z.infer<typeof perQuestionItemSchema>

export const perQuestionExtrasSchema = z.record(z.uuid(), perQuestionItemSchema)

export type PerQuestionExtras = z.infer<typeof perQuestionExtrasSchema>

export const quizExtrasV1Schema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    revision: z.number().int().positive(),
    quizId: z.string().min(1),
    baseDigest: z.string().length(64),
    questionIds: z.array(z.uuid()),
    leaderboard: leaderboardExtrasSchema,
    teams: teamsExtrasSchema,
    audio: audioExtrasSchema,
    perQuestion: perQuestionExtrasSchema,
    roster: rosterExtrasSchema.optional(),
    mediaCatalog: z.array(showMediaCatalogItemSchema).max(500).optional(),
  })
  .superRefine((extras, ctx) => {
    // 1. questionIds must be unique
    const qIdSet = new Set(extras.questionIds)

    if (qIdSet.size !== extras.questionIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["questionIds"],
        message: "errors:extensions.duplicateQuestionIds",
      })
    }

    // 2. perQuestion keys must all be in questionIds
    for (const qId of Object.keys(extras.perQuestion)) {
      if (!qIdSet.has(qId)) {
        ctx.addIssue({
          code: "custom",
          path: ["perQuestion", qId],
          message: `errors:extensions.orphanQuestionExtra:${qId}`,
        })
      }
    }

    // 3. leaderboard.afterQuestionIds (if present) must be in questionIds
    if (extras.leaderboard.afterQuestionIds) {
      for (let i = 0; i < extras.leaderboard.afterQuestionIds.length; i += 1) {
        const qId = extras.leaderboard.afterQuestionIds[i]

        if (!qIdSet.has(qId)) {
          ctx.addIssue({
            code: "custom",
            path: ["leaderboard", "afterQuestionIds", i],
            message: `errors:extensions.orphanLeaderboardQuestionId:${qId}`,
          })
        }
      }
    }
  })

export type QuizExtrasV1 = z.infer<typeof quizExtrasV1Schema>

/**
 * Creates default AudioExtras with all 9 cues configured.
 */
export const createDefaultAudioExtras = (): AudioExtras => {
  const cues = {} as Record<CueId, AudioCueSetting>

  for (const cueId of CUE_IDS) {
    cues[cueId] = {
      source: "default",
      volume: 0.8,
      enabled: true,
      loop: cueId === "answersMusic",
    }
  }

  return { cues }
}

/**
 * Creates default QuizExtrasV1 for a given quiz ID, question UUIDs and base digest.
 */
export const createDefaultQuizExtras = (
  quizId: string,
  questionIds: string[],
  baseDigest: string,
): QuizExtrasV1 => ({
  schemaVersion: SCHEMA_VERSION,
  revision: DEFAULT_REVISION,
  quizId,
  baseDigest,
  questionIds,
  leaderboard: {
    mode: "upstream",
  },
  teams: {
    enabled: false,
    teams: [],
    autoAssign: "roundRobin",
  },
  audio: createDefaultAudioExtras(),
  perQuestion: {},
  roster: createDefaultRosterExtras(),
})

export { createDefaultRosterExtras, rosterExtrasSchema, type RosterExtras }
