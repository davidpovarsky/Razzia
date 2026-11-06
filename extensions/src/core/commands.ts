import { z } from "zod"

export const showLeaderboardCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("SHOW_LEADERBOARD"),
  payload: z
    .strictObject({
      epoch: z.number().int().optional(),
    })
    .optional()
    .default({}),
  requestId: z.string().min(1),
})

export type ShowLeaderboardCommand = z.infer<
  typeof showLeaderboardCommandSchema
>

export const skipInterludeCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("SKIP_INTERLUDE"),
  payload: z
    .strictObject({
      interludeId: z.string().optional(),
      epoch: z.number().int().optional(),
    })
    .optional()
    .default({}),
  requestId: z.string().min(1),
})

export type SkipInterludeCommand = z.infer<typeof skipInterludeCommandSchema>

export const revealMediaCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("REVEAL_MEDIA"),
  payload: z
    .strictObject({
      questionId: z.string().optional(),
      epoch: z.number().int().optional(),
    })
    .optional()
    .default({}),
  requestId: z.string().min(1),
})

export type RevealMediaCommand = z.infer<typeof revealMediaCommandSchema>

export const assignTeamCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("ASSIGN_TEAM"),
  payload: z.strictObject({
    clientId: z.string().min(1),
    teamId: z.string().min(1),
    epoch: z.number().int().optional(),
  }),
  requestId: z.string().min(1),
})

export type AssignTeamCommand = z.infer<typeof assignTeamCommandSchema>

export const endAnswerTimerCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("END_ANSWER_TIMER"),
  payload: z
    .strictObject({
      questionIndex: z.number().int().nonnegative().optional(),
      epoch: z.number().int().optional(),
    })
    .optional()
    .default({}),
  requestId: z.string().min(1),
})

export type EndAnswerTimerCommand = z.infer<typeof endAnswerTimerCommandSchema>

export const nextScreenCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("NEXT_SCREEN"),
  payload: z
    .strictObject({
      phase: z.string().optional(),
      epoch: z.number().int().optional(),
    })
    .optional()
    .default({}),
  requestId: z.string().min(1),
})

export type NextScreenCommand = z.infer<typeof nextScreenCommandSchema>

export const previousScreenCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("PREVIOUS_SCREEN"),
  payload: z
    .strictObject({
      phase: z.string().optional(),
      epoch: z.number().int().optional(),
      confirmed: z.boolean().optional(),
    })
    .optional()
    .default({}),
  requestId: z.string().min(1),
})

export type PreviousScreenCommand = z.infer<typeof previousScreenCommandSchema>

export const skipQuestionCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("SKIP_QUESTION"),
  payload: z
    .strictObject({
      questionIndex: z.number().int().nonnegative().optional(),
      reason: z.string().optional(),
      epoch: z.number().int().optional(),
    })
    .optional()
    .default({}),
  requestId: z.string().min(1),
})

export type SkipQuestionCommand = z.infer<typeof skipQuestionCommandSchema>

export const viewHistoryCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("VIEW_HISTORY"),
  payload: z
    .strictObject({
      questionIndex: z.number().int().nonnegative().optional(),
      epoch: z.number().int().optional(),
    })
    .optional()
    .default({}),
  requestId: z.string().min(1),
})

export type ViewHistoryCommand = z.infer<typeof viewHistoryCommandSchema>

export const replayFromCheckpointCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("REPLAY_FROM_CHECKPOINT"),
  payload: z.strictObject({
    questionIndex: z.number().int().nonnegative(),
    confirmed: z.literal(true),
    epoch: z.number().int().optional(),
  }),
  requestId: z.string().min(1),
})

export type ReplayFromCheckpointCommand = z.infer<
  typeof replayFromCheckpointCommandSchema
>

export const endOrSkipInterludeCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("END_OR_SKIP_INTERLUDE"),
  payload: z
    .strictObject({
      interludeId: z.string().optional(),
      reason: z.enum(["manual", "auto", "ended"]).optional(),
      epoch: z.number().int().optional(),
    })
    .optional()
    .default({}),
  requestId: z.string().min(1),
})

export type EndOrSkipInterludeCommand = z.infer<
  typeof endOrSkipInterludeCommandSchema
>

export const advanceTimelineSceneCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("ADVANCE_TIMELINE_SCENE"),
  payload: z
    .strictObject({
      sceneId: z.string().optional(),
      stepId: z.string().optional(),
      timelineStepIndex: z.number().int().nonnegative().optional(),
      reason: z.enum(["manual", "auto", "mediaEnded"]).optional(),
      epoch: z.number().int().optional(),
    })
    .optional()
    .default({}),
  requestId: z.string().min(1),
})

export type AdvanceTimelineSceneCommand = z.infer<
  typeof advanceTimelineSceneCommandSchema
>

export const skipTimelineSceneCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("SKIP_TIMELINE_SCENE"),
  payload: z
    .strictObject({
      sceneId: z.string().optional(),
      stepId: z.string().optional(),
      timelineStepIndex: z.number().int().nonnegative().optional(),
      reason: z.enum(["manual", "auto", "mediaEnded"]).optional(),
      epoch: z.number().int().optional(),
    })
    .optional()
    .default({}),
  requestId: z.string().min(1),
})

export type SkipTimelineSceneCommand = z.infer<
  typeof skipTimelineSceneCommandSchema
>

export const resolveStoryTieCommandSchema = z.strictObject({
  v: z.literal(1), gameId: z.string().min(1), action: z.literal("RESOLVE_STORY_TIE"),
  payload: z.strictObject({ answerIndex: z.number().int().min(0), epoch: z.number().int() }),
  requestId: z.string().min(1),
})
export const extensionCommandSchema = z.discriminatedUnion("action", [
  resolveStoryTieCommandSchema,
  showLeaderboardCommandSchema,
  skipInterludeCommandSchema,
  revealMediaCommandSchema,
  assignTeamCommandSchema,
  endAnswerTimerCommandSchema,
  nextScreenCommandSchema,
  previousScreenCommandSchema,
  skipQuestionCommandSchema,
  viewHistoryCommandSchema,
  replayFromCheckpointCommandSchema,
  endOrSkipInterludeCommandSchema,
  advanceTimelineSceneCommandSchema,
  skipTimelineSceneCommandSchema,
])

export type ExtensionCommand = z.infer<typeof extensionCommandSchema>
