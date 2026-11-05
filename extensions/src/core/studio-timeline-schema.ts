import { z } from "zod"
import {
  cardAudioModeSchema,
  cardBackgroundOverrideSchema,
  cardStageAnimationsSchema,
  questionDecorationSchema,
  showMediaCatalogItemSchema,
} from "./card-appearance"
import { cinematicOverlayAnimationsArraySchema } from "./cinematic-overlays"
import { tadazzShowBackgroundSchema } from "./tadazz-appearance"
import {
  audioExtrasSchema,
  createDefaultAudioExtras,
  leaderboardExtrasSchema,
  perQuestionExtrasSchema,
  teamsExtrasSchema,
} from "./quiz-extras"
import { createDefaultRosterExtras, rosterExtrasSchema } from "./phone-roster"
import { isSafeMediaUrl, safeMediaUrlSchema } from "./media"

export const TIMELINE_ITEM_KINDS = [
  "quiz",
  "survey",
  "transition",
  "animation",
  "media",
  "leaderboard",
  "interimResults",
  "answerRecap",
  "countdown",
  "opening",
  "closing",
] as const

export type TimelineItemKind = (typeof TIMELINE_ITEM_KINDS)[number]

export const SCENE_ADVANCE_MODES = ["auto", "manual", "onMediaEnd"] as const
export type SceneAdvanceMode = (typeof SCENE_ADVANCE_MODES)[number]

export const ANSWER_RECAP_MODES = ["mostSelected", "correctAnswer"] as const
export type AnswerRecapMode = (typeof ANSWER_RECAP_MODES)[number]

export const timelineQuestionItemSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal("question"),
  questionId: z.uuid(),
})

export type TimelineQuestionItem = z.infer<typeof timelineQuestionItemSchema>

export const timelineItemKindNonQuestionSchema = z.enum([
  "transition",
  "animation",
  "media",
  "leaderboard",
  "interimResults",
  "answerRecap",
  "countdown",
  "opening",
  "closing",
])

export type TimelineItemKindNonQuestion = z.infer<
  typeof timelineItemKindNonQuestionSchema
>

export const timelineItemSchema = z.discriminatedUnion("kind", [
  timelineQuestionItemSchema,
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("transition"),
    sceneId: z.uuid(),
  }),
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("animation"),
    sceneId: z.uuid(),
  }),
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("media"),
    sceneId: z.uuid(),
  }),
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("leaderboard"),
    sceneId: z.uuid(),
  }),
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("interimResults"),
    sceneId: z.uuid(),
  }),
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("answerRecap"),
    sceneId: z.uuid(),
  }),
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("countdown"),
    sceneId: z.uuid(),
  }),
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("opening"),
    sceneId: z.uuid(),
  }),
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("closing"),
    sceneId: z.uuid(),
  }),
])

export type TimelineItem = z.infer<typeof timelineItemSchema>

// ── Scene Config Schemas ──────────────────────────────────────────────────

export const sceneAudioSchema = z.strictObject({
  mode: cardAudioModeSchema.default("inherit"),
  url: safeMediaUrlSchema.optional(),
  volume: z.number().min(0).max(1).default(0.8),
  loop: z.boolean().default(false),
})

export type SceneAudio = z.infer<typeof sceneAudioSchema>

const sceneAppearanceFields = {
  background: cardBackgroundOverrideSchema.optional(),
  audio: sceneAudioSchema.optional(),
  stageAnimations: cardStageAnimationsSchema.optional(),
}

export const transitionSceneSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal("transition"),
  title: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  durationMs: z.number().int().min(500).max(60000).default(5000),
  advance: z.enum(SCENE_ADVANCE_MODES).default("auto"),
  ...sceneAppearanceFields,
})

export const animationSceneSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal("animation"),
  preset: z.string().max(64).default("spotlight"),
  title: z.string().max(120).optional(),
  durationMs: z.number().int().min(500).max(60000).default(3000),
  advance: z.enum(SCENE_ADVANCE_MODES).default("auto"),
  lottieUrl: safeMediaUrlSchema.optional(),
  lottieFit: z.enum(["contain", "cover"]).default("contain").optional(),
  lottieLoop: z.boolean().default(true).optional(),
  lottieSpeed: z.number().min(0.25).max(3).default(1).optional(),
  ...sceneAppearanceFields,
})

export const mediaSceneSchema = z
  .strictObject({
    id: z.uuid(),
    kind: z.literal("media"),
    mediaUrl: z.string().default(""),
    mediaType: z.enum(["image", "video", "audio"]).default("image"),
    title: z.string().max(120).optional(),
    durationMs: z.number().int().min(500).max(300000).default(5000),
    advance: z.enum(SCENE_ADVANCE_MODES).default("auto"),
    volume: z.number().min(0).max(1).default(0.8).optional(),
    loop: z.boolean().default(false).optional(),
    muted: z.boolean().default(false).optional(),
    showControls: z.boolean().default(false).optional(),
    mediaFit: z.enum(["contain", "cover"]).default("contain").optional(),
    stageLayout: z.enum(["card", "cinema"]).default("card").optional(),
    subtitle: z.string().max(200).optional(),
    textOverlay: z.boolean().default(true).optional(),
    endBehavior: z
      .enum(["holdFrame", "advanceNext", "fadeToTitle"])
      .default("holdFrame")
      .optional(),
    mediaEndFallbackMs: z.number().int().min(500).max(600000).optional(),
    overlayAnimations: cinematicOverlayAnimationsArraySchema.optional(),
    ...sceneAppearanceFields,
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

export const leaderboardSceneSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal("leaderboard"),
  title: z.string().max(120).optional(),
  durationMs: z.number().int().min(500).max(60000).default(5000),
  advance: z.enum(SCENE_ADVANCE_MODES).default("auto"),
  ...sceneAppearanceFields,
})

export const interimResultsSceneSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal("interimResults"),
  title: z.string().max(120).optional(),
  durationMs: z.number().int().min(500).max(60000).default(5000),
  advance: z.enum(SCENE_ADVANCE_MODES).default("auto"),
  ...sceneAppearanceFields,
})

export const answerRecapSceneSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal("answerRecap"),
  title: z.string().max(120).optional(),
  startQuestionId: z.uuid().optional(),
  mode: z.enum(ANSWER_RECAP_MODES).default("mostSelected"),
  maxItemsPerPage: z.number().int().min(1).max(8).default(4).optional(),
  showCounts: z.boolean().default(true).optional(),
  showPercentages: z.boolean().default(true).optional(),
  durationMs: z.number().int().min(500).max(120000).default(8000),
  advance: z.enum(SCENE_ADVANCE_MODES).default("auto"),
  ...sceneAppearanceFields,
})

export const countdownSceneSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal("countdown"),
  durationSeconds: z.number().int().min(3).max(120).default(10),
  title: z.string().max(120).optional(),
  advance: z.enum(SCENE_ADVANCE_MODES).default("auto"),
  ...sceneAppearanceFields,
})

const cinematicBookendFields = {
  mediaType: z.enum(["image", "video", "audio"]).optional(),
  stageLayout: z.enum(["card", "cinema"]).default("cinema").optional(),
  mediaFit: z.enum(["contain", "cover"]).default("cover").optional(),
  logoPosition: z
    .enum(["top", "center", "bottom", "hidden"])
    .default("center")
    .optional(),
  textOverlay: z.boolean().default(true).optional(),
  endBehavior: z
    .enum(["holdFrame", "advanceNext", "fadeToTitle"])
    .default("holdFrame")
    .optional(),
  volume: z.number().min(0).max(1).default(0.8).optional(),
  loop: z.boolean().default(false).optional(),
  muted: z.boolean().default(false).optional(),
  showControls: z.boolean().default(false).optional(),
  lottieUrl: safeMediaUrlSchema.optional(),
  lottieFit: z.enum(["contain", "cover"]).default("contain").optional(),
  lottieLoop: z.boolean().default(true).optional(),
  lottieSpeed: z.number().min(0.25).max(3).default(1).optional(),
  mediaEndFallbackMs: z.number().int().min(500).max(600000).optional(),
  overlayAnimations: cinematicOverlayAnimationsArraySchema.optional(),
}

export const openingSceneSchema = z
  .strictObject({
    id: z.uuid(),
    kind: z.literal("opening"),
    title: z.string().min(1).max(120),
    subtitle: z.string().max(200).optional(),
    mediaUrl: z.string().optional(),
    durationMs: z.number().int().min(500).max(300000).default(5000),
    advance: z.enum(SCENE_ADVANCE_MODES).default("auto"),
    ...cinematicBookendFields,
    ...sceneAppearanceFields,
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

export const closingSceneSchema = z
  .strictObject({
    id: z.uuid(),
    kind: z.literal("closing"),
    title: z.string().min(1).max(120),
    subtitle: z.string().max(200).optional(),
    mediaUrl: z.string().optional(),
    durationMs: z.number().int().min(500).max(300000).default(5000),
    advance: z.enum(SCENE_ADVANCE_MODES).default("auto"),
    ...cinematicBookendFields,
    ...sceneAppearanceFields,
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

export const sceneConfigSchema = z.discriminatedUnion("kind", [
  transitionSceneSchema,
  animationSceneSchema,
  mediaSceneSchema,
  leaderboardSceneSchema,
  interimResultsSceneSchema,
  answerRecapSceneSchema,
  countdownSceneSchema,
  openingSceneSchema,
  closingSceneSchema,
])

export type SceneConfig = z.infer<typeof sceneConfigSchema>

// ── Authoritative Active Scene Data (Role-Safe Public Projections) ──────────

export interface PublicRankEntry {
  rank: number
  displayName: string
  points: number
}

export interface PublicInterimOption {
  answerIndex?: number
  label: string
  count: number
  percentage: number
  imageUrl?: string
  alt?: string
}

export interface PublicInterimResults {
  sourceQuestionId: string | null
  questionText: string
  totalResponders: number
  options: PublicInterimOption[]
  winners?: number[]
  isTie?: boolean
}

export type PublicAnswerRecapBadge =
  "mostSelected" | "correctAnswer" | "tiedMostSelected" | "noResponses"

export interface PublicAnswerRecapWinnerOption {
  answerIndex: number
  label: string
  count: number
  percentage: number
  imageUrl?: string
  alt?: string
  isCorrect?: boolean
}

export interface PublicAnswerRecapQuestionItem {
  questionId: string
  questionNumber: number
  questionText: string
  questionType: "single" | "multi" | "estimation"
  playMode: "quiz" | "survey"
  totalResponders: number
  badge: PublicAnswerRecapBadge
  winningOptions: PublicAnswerRecapWinnerOption[]
  correctOptions?: PublicAnswerRecapWinnerOption[]
}

export interface PublicAnswerRecap {
  startQuestionId?: string
  fromQuestionNumber?: number
  toQuestionNumber?: number
  totalQuestionsInRange: number
  completedQuestionsCount: number
  mode: AnswerRecapMode
  maxItemsPerPage: number
  showCounts: boolean
  showPercentages: boolean
  items: PublicAnswerRecapQuestionItem[]
}

export interface ActiveSceneData {
  leaderboard?: { entries: PublicRankEntry[] }
  interimResults?: PublicInterimResults | null
  answerRecap?: PublicAnswerRecap | null
}

// ── Studio Defaults Schema ────────────────────────────────────────────────

export const studioDefaultsSchema = z.strictObject({
  newQuestionMode: z.enum(["quiz", "survey"]).default("quiz"),
  leaderboardPolicy: z
    .enum(["upstream", "everyN", "cardOnly", "disabled"])
    .default("cardOnly"),
  advanceMode: z.enum(["auto", "manual"]).default("auto"),
  stageAnimations: cardStageAnimationsSchema.optional(),
  questionDecoration: questionDecorationSchema.optional(),
  tadazzBackground: tadazzShowBackgroundSchema.optional(),
  /** Opt-in stage overlay backed by the owner's original Motion Kit assets. */
  motionKit: z.enum(["goldy-20261105", "legacy"]).optional(),
})

export type StudioDefaults = z.infer<typeof studioDefaultsSchema>

export const authoringMetadataSchema = z.strictObject({
  showNote: z.string().max(2000).optional(),
})

export type AuthoringMetadata = z.infer<typeof authoringMetadataSchema>

// ── QuizExtrasV2 Schema ───────────────────────────────────────────────────

export const quizExtrasV2Schema = z
  .strictObject({
    schemaVersion: z.literal(2),
    revision: z.number().int().positive(),
    quizId: z.string().min(1),
    baseDigest: z.string().length(64),
    questionIds: z.array(z.uuid()),
    timeline: z.array(timelineItemSchema),
    scenes: z.record(z.uuid(), sceneConfigSchema),
    defaults: studioDefaultsSchema,
    leaderboard: leaderboardExtrasSchema.optional(),
    teams: teamsExtrasSchema.default({
      enabled: false,
      teams: [],
      autoAssign: "roundRobin",
    }),
    audio: audioExtrasSchema.default(createDefaultAudioExtras()),
    perQuestion: perQuestionExtrasSchema.default({}),
    roster: rosterExtrasSchema.default(createDefaultRosterExtras()),
    authoring: authoringMetadataSchema.optional(),
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

    // 2. Timeline item IDs must be unique
    const timelineIdSet = new Set<string>()
    for (let i = 0; i < extras.timeline.length; i += 1) {
      const item = extras.timeline[i]

      if (timelineIdSet.has(item.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["timeline", i, "id"],
          message: "errors:extensions.duplicateTimelineItemId",
        })
      }

      timelineIdSet.add(item.id)
    }

    // 3. Question item validation
    const seenQuestionIdsInTimeline = new Set<string>()
    let questionItemCount = 0

    for (let i = 0; i < extras.timeline.length; i += 1) {
      const item = extras.timeline[i]

      if (item.kind === "question") {
        questionItemCount += 1

        if (!qIdSet.has(item.questionId)) {
          ctx.addIssue({
            code: "custom",
            path: ["timeline", i, "questionId"],
            message: `errors:extensions.orphanTimelineQuestionId:${item.questionId}`,
          })
        }

        if (seenQuestionIdsInTimeline.has(item.questionId)) {
          ctx.addIssue({
            code: "custom",
            path: ["timeline", i, "questionId"],
            message: `errors:extensions.duplicateTimelineQuestionRef:${item.questionId}`,
          })
        }

        seenQuestionIdsInTimeline.add(item.questionId)
      } else if (!(item.sceneId in extras.scenes)) {
        ctx.addIssue({
          code: "custom",
          path: ["timeline", i, "sceneId"],
          message: `errors:extensions.orphanTimelineSceneId:${item.sceneId}`,
        })
      } else if (extras.scenes[item.sceneId].kind !== item.kind) {
        ctx.addIssue({
          code: "custom",
          path: ["timeline", i, "kind"],
          message: `errors:extensions.timelineSceneKindMismatch:${item.kind}`,
        })
      } else if (item.kind === "answerRecap") {
        const recapScene = extras.scenes[item.sceneId]
        if (
          recapScene.kind === "answerRecap" &&
          recapScene.startQuestionId !== undefined
        ) {
          if (!qIdSet.has(recapScene.startQuestionId)) {
            ctx.addIssue({
              code: "custom",
              path: ["scenes", item.sceneId, "startQuestionId"],
              message: `errors:extensions.invalidRecapStartQuestion:${recapScene.startQuestionId}`,
            })
          } else if (
            !seenQuestionIdsInTimeline.has(recapScene.startQuestionId)
          ) {
            // startQuestionId exists in the show, but has not appeared before this answerRecap item!
            ctx.addIssue({
              code: "custom",
              path: ["scenes", item.sceneId, "startQuestionId"],
              message: `errors:extensions.recapStartAfterRecap:${recapScene.startQuestionId}`,
            })
          }
        }
      }
    }

    // 4. Must contain at least one question item
    if (questionItemCount < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["timeline"],
        message: "errors:extensions.noQuestionsInTimeline",
      })
    }

    // 5. Every questionId in questionIds must be present in timeline
    for (const qId of extras.questionIds) {
      if (!seenQuestionIdsInTimeline.has(qId)) {
        ctx.addIssue({
          code: "custom",
          path: ["questionIds"],
          message: `errors:extensions.missingQuestionInTimeline:${qId}`,
        })
      }
    }

    // 6. perQuestion keys must be in questionIds
    for (const qId of Object.keys(extras.perQuestion)) {
      if (!qIdSet.has(qId)) {
        ctx.addIssue({
          code: "custom",
          path: ["perQuestion", qId],
          message: `errors:extensions.orphanQuestionExtra:${qId}`,
        })
      }
    }

    // 7. leaderboard.afterQuestionIds (if present) must be in questionIds
    if (extras.leaderboard?.afterQuestionIds) {
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

export type QuizExtrasV2 = z.infer<typeof quizExtrasV2Schema>

export const createDefaultQuizExtrasV2 = (
  quizId: string,
  questionIds: string[],
  baseDigest: string,
): QuizExtrasV2 => {
  const timeline: TimelineItem[] = questionIds.map((qId) => ({
    id: crypto.randomUUID(),
    kind: "question",
    questionId: qId,
  }))

  return {
    schemaVersion: 2,
    revision: 1,
    quizId,
    baseDigest,
    questionIds,
    timeline,
    scenes: {},
    defaults: {
      newQuestionMode: "quiz",
      leaderboardPolicy: "cardOnly",
      advanceMode: "auto",
    },
    audio: createDefaultAudioExtras(),
    teams: {
      enabled: false,
      teams: [],
      autoAssign: "roundRobin",
    },
    roster: createDefaultRosterExtras(),
    perQuestion: {},
  }
}
