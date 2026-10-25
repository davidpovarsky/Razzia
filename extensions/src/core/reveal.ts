import { z } from "zod"

export const revealOptionDistributionSchema = z.strictObject({
  index: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
  isSolution: z.boolean().optional(),
})

export type RevealOptionDistribution = z.infer<
  typeof revealOptionDistributionSchema
>

export const estimationDistributionSchema = z.strictObject({
  min: z.number(),
  max: z.number(),
  target: z.number(),
  guessesCount: z.number().int().nonnegative(),
  closestGuess: z.number().optional(),
  median: z.number().optional(),
  guesses: z.array(z.number()).optional(),
})

export type EstimationDistribution = z.infer<
  typeof estimationDistributionSchema
>

export const revealDistributionSnapshotSchema = z.strictObject({
  questionId: z.uuid().optional(),
  questionIndex: z.number().int().nonnegative(),
  questionType: z.string().min(1),
  totalResponders: z.number().int().nonnegative(),
  eligiblePlayers: z.number().int().nonnegative(),
  revealStartedAt: z.number().int().positive(),
  options: z
    .record(z.coerce.number(), revealOptionDistributionSchema)
    .optional(),
  estimation: estimationDistributionSchema.optional(),
  solutions: z.array(z.number()).optional(),
})

export type RevealDistributionSnapshot = z.infer<
  typeof revealDistributionSnapshotSchema
>

export interface HistorySummaryItem {
  questionIndex: number
  questionId?: string
  questionText: string
  questionType: string
  skipped?: boolean
  skipReason?: string
  playerAnswersCount: number
  solutions?: number[]
}
