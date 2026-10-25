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

export const extensionCommandSchema = z.discriminatedUnion("action", [
  showLeaderboardCommandSchema,
  skipInterludeCommandSchema,
  revealMediaCommandSchema,
  assignTeamCommandSchema,
  endAnswerTimerCommandSchema,
  nextScreenCommandSchema,
  skipQuestionCommandSchema,
  viewHistoryCommandSchema,
  replayFromCheckpointCommandSchema,
  endOrSkipInterludeCommandSchema,
])

export type ExtensionCommand = z.infer<typeof extensionCommandSchema>
