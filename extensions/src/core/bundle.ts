import { z } from "zod"
import { quizExtrasV1Schema, type QuizExtrasV1 } from "./quiz-extras"

export const ENHANCED_BUNDLE_VERSION = 1 as const

export const enhancedBundleSchema = z.strictObject({
  bundleVersion: z.literal(ENHANCED_BUNDLE_VERSION),
  quizz: z.unknown(),
  extras: quizExtrasV1Schema,
})

export type EnhancedBundle = z.infer<typeof enhancedBundleSchema>

/**
 * Checks whether an imported payload is an enhanced bundle.
 */
export const isEnhancedBundle = (data: unknown): data is EnhancedBundle =>
  enhancedBundleSchema.safeParse(data).success

/**
 * Creates an enhanced bundle for export.
 */
export const createEnhancedBundle = (
  quizz: unknown,
  extras: QuizExtrasV1,
): EnhancedBundle => ({
  bundleVersion: ENHANCED_BUNDLE_VERSION,
  quizz,
  extras,
})
