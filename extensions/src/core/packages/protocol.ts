import { z } from "zod"
import { packageDigestSchema } from "./manifest"

export const RUNTIME_PHASES = [
  "opening",
  "lobby",
  "question",
  "answerCards",
  "voting",
  "voteLocked",
  "results",
  "leaderboard",
  "interlude",
  "closing",
  "personalResult",
] as const

const text = z.string().max(1000)

export const sandboxDefinitionSchema = z.strictObject({
  runtimeApi: z.literal(1),
  entry: z.string().max(240),
  slots: z.record(z.enum(RUNTIME_PHASES), z.enum(["implemented", "classic"])),
  roles: z
    .array(z.enum(["manager", "player", "spectator"]))
    .min(1)
    .max(3),
  assetPaths: z.array(z.string().max(240)).max(256).optional(),
})

export const runtimePinSchema = z.strictObject({
  packageId: z.string().max(64),
  version: z.string().max(32),
  sourceDigest: packageDigestSchema,
  buildDigest: packageDigestSchema,
})

// Public projection, deliberately not z.passthrough()/a copy of server extras.
export const runtimeSnapshotSchema = z.strictObject({
  roomId: text,
  questionId: text,
  epoch: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  role: z.enum(["manager", "player", "spectator"]),
  phase: z.enum(RUNTIME_PHASES),
  locale: z.string().max(16),
  reducedMotion: z.boolean(),
  title: text,
  question: text,
  questionImage: z
    .string()
    .max(7_000_000)
    .regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/u)
    .optional(),
  backgroundImage: z
    .string()
    .max(7_000_000)
    .regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/u)
    .optional(),
  joinCode: z
    .string()
    .regex(/^(?:[0-9]{6})?$/u)
    .optional(),
  joinUrl: z
    .string()
    .max(2048)
    .regex(/^https?:\/\/[^\s?#]+\/game$/u)
    .optional(),
  answers: z
    .array(
      z.strictObject({
        id: z.string().max(64),
        label: text,
        image: z
          .string()
          .max(7_000_000)
          .regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/u)
          .optional(),
        percent: z.number().min(0).max(100).optional(),
        correct: z.boolean().optional(),
        votes: z.number().int().nonnegative().optional(),
      }),
    )
    .max(64),
  leaders: z
    .array(
      z.strictObject({
        label: text,
        score: z.number(),
        rank: z.number().int().positive(),
      }),
    )
    .max(100),
  personalResult: z
    .strictObject({
      correct: z.boolean(),
      points: z.number(),
      rank: z.number().int().nonnegative(),
    })
    .nullable(),
  serverTime: z.number(),
  deadline: z.number().nullable(),
  remainingMs: z.number().min(0).max(86_400_000),
  paused: z.boolean(),
  canAnswer: z.boolean(),
  labels: z.strictObject({ submit: text, waiting: text, results: text }),
})

export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>

const envelope = {
  v: z.literal(1),
  channel: z.string().regex(/^[a-f0-9]{64}$/u),
  roomId: text,
  questionId: text,
  role: z.enum(["manager", "player", "spectator"]),
  sequence: z.number().int().positive(),
  epoch: z.number().int().nonnegative(),
}

export const rendererMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...envelope,
    type: z.literal("READY"),
    runtimeApi: z.literal(1),
  }),
  z.strictObject({ ...envelope, type: z.literal("RENDER_HEALTH") }),
  z.strictObject({
    ...envelope,
    type: z.literal("ANSWER_INTENT"),
    questionId: text,
    optionIds: z.array(z.string().max(64)).min(1).max(64),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal("AUDIO_CUE_REQUEST"),
    cueId: z.string().max(64),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal("RUNTIME_ERROR"),
    code: z.enum(["RENDER_FAILED", "UNSUPPORTED_SLOT"]),
  }),
])

export const parentMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...envelope,
    type: z.literal("BOOTSTRAP"),
    snapshot: runtimeSnapshotSchema,
    assetMap: z.record(z.string().max(240), z.string().max(2048)),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal("STATE_SNAPSHOT"),
    snapshot: runtimeSnapshotSchema,
  }),
  z.strictObject({ ...envelope, type: z.literal("DISPOSE") }),
])

/** Per-frame replay and flood protection; invalid messages do not advance state. */
export class RendererMessageGuard {
  private sequence = 0
  private windowStart = 0
  private count = 0
  readonly channel: string
  constructor(channel: string) {
    this.channel = channel
  }
  accept(
    input: unknown,
    context: Pick<RuntimeSnapshot, "epoch" | "roomId" | "questionId" | "role">,
    now: number,
  ) {
    if (now - this.windowStart >= 1000) {
      this.windowStart = now
      this.count = 0
    }

    this.count += 1

    if (
      this.count > 30 ||
      !input ||
      typeof input !== "object" ||
      Object.keys(input).length > 12 ||
      ("optionIds" in input &&
        (!Array.isArray(input.optionIds) || input.optionIds.length > 64))
    ) {
      return null
    }

    const parsed = rendererMessageSchema.safeParse(input)

    if (
      !parsed.success ||
      parsed.data.channel !== this.channel ||
      parsed.data.sequence <= this.sequence ||
      parsed.data.epoch !== context.epoch ||
      parsed.data.roomId !== context.roomId ||
      parsed.data.questionId !== context.questionId ||
      parsed.data.role !== context.role
    ) {
      return null
    }

    this.sequence = parsed.data.sequence

    return parsed.data
  }
}
