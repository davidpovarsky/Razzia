import { EVENTS, MAX_ANSWERS } from "@razzia/common/constants"
import { z } from "zod"

const gameMessageValidator = z.object({ gameId: z.string().min(1) })

const answerKeysValidator = z
  .array(z.number())
  .max(MAX_ANSWERS)
  .refine((keys) => new Set(keys).size === keys.length)

export const clientEventValidators = {
  [EVENTS.MANAGER.RECONNECT]: gameMessageValidator,
  [EVENTS.MANAGER.LEAVE]: gameMessageValidator,
  [EVENTS.MANAGER.KICK_PLAYER]: gameMessageValidator.extend({
    playerId: z.string().min(1),
  }),
  [EVENTS.MANAGER.START_GAME]: gameMessageValidator,
  [EVENTS.MANAGER.ADVANCE]: gameMessageValidator,
  [EVENTS.MANAGER.SET_LOCK]: gameMessageValidator.extend({
    locked: z.boolean(),
  }),
  [EVENTS.PLAYER.LOGIN]: z.object({ ticket: z.string().min(1) }),
  [EVENTS.PLAYER.RECONNECT]: gameMessageValidator,
  [EVENTS.PLAYER.LEAVE]: gameMessageValidator,
  [EVENTS.PLAYER.SELECTED_ANSWER]: gameMessageValidator.extend({
    data: z.object({ answerKeys: answerKeysValidator }),
  }),
  [EVENTS.EXTENSIONS.COMMAND]: z.object({
    v: z.literal(1),
    gameId: z.string().min(1),
    action: z.enum([
      "SHOW_LEADERBOARD",
      "SKIP_INTERLUDE",
      "REVEAL_MEDIA",
      "ASSIGN_TEAM",
      "END_ANSWER_TIMER",
      "NEXT_SCREEN",
      "SKIP_QUESTION",
      "VIEW_HISTORY",
      "REPLAY_FROM_CHECKPOINT",
      "END_OR_SKIP_INTERLUDE",
    ]),
    payload: z.unknown().optional(),
    requestId: z.string().min(1),
  }),
}
