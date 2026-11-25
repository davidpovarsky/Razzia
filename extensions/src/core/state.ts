import { z } from "zod"
import { EXTENSION_PHASES } from "./constants"

/**
 * Server-to-clients state envelope emitted under 'extensions:state'.
 * Contains monotonically increasing sequence number (seq) and question epoch.
 */
export const extensionStateEnvelopeSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  epoch: z.number().int().nonnegative(),
  questionId: z.uuid().optional(),
  phase: z.enum(EXTENSION_PHASES),
  startedAt: z.number().int().positive(),
  pause: z
    .strictObject({
      paused: z.boolean(),
      remainingMs: z.number().int().nonnegative().nullable(),
      deadline: z.number().int().positive().nullable(),
      phase: z.enum(EXTENSION_PHASES),
      epoch: z.number().int().nonnegative(),
    })
    .optional(),
  extras: z.record(z.string(), z.unknown()),
})

export type ExtensionStateEnvelope = z.infer<
  typeof extensionStateEnvelopeSchema
>
