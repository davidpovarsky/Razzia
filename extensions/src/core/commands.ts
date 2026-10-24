import { z } from "zod"

export const showLeaderboardCommandSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  action: z.literal("SHOW_LEADERBOARD"),
  payload: z.strictObject({}).optional().default({}),
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
  }),
  requestId: z.string().min(1),
})

export type AssignTeamCommand = z.infer<typeof assignTeamCommandSchema>

export const extensionCommandSchema = z.discriminatedUnion("action", [
  showLeaderboardCommandSchema,
  skipInterludeCommandSchema,
  revealMediaCommandSchema,
  assignTeamCommandSchema,
])

export type ExtensionCommand = z.infer<typeof extensionCommandSchema>
