import { z } from "zod"
import { isSafeMediaUrl, safeMediaUrlSchema } from "./media"
import type { CardBackgroundOverride } from "./card-appearance"

/** Entirely opt-in. Absence of settings preserves the original Razzia background. */
export const tadazzShowBackgroundSchema = z.strictObject({
  mode: z.enum(["original", "animated", "static"]).default("original"),
  staticUrl: safeMediaUrlSchema.optional(),
  intensity: z.number().min(0).max(1.5).default(1),
  paused: z.boolean().default(false),
  fit: z.enum(["cover", "contain"]).default("cover"),
}).superRefine((settings, ctx) => {
  if (settings.mode === "static" && !settings.staticUrl) {
    ctx.addIssue({
      code: "custom",
      path: ["staticUrl"],
      message: "A static background requires a safe media URL",
    })
  }
})

export type TadazzShowBackground = z.infer<typeof tadazzShowBackgroundSchema>
export type TadazzBackdropState = {
  source: "original" | "card" | "cinema" | "tadazz" | "static"
  url?: string
  animate: boolean
  intensity: number
  fit: "cover" | "contain"
}

/** Order is critical: cinematic full-screen > per-card background > show opt-in > legacy. */
export function resolveTadazzStageBackground(input: {
  settings?: TadazzShowBackground | null
  cardBackground?: CardBackgroundOverride | null
  fullScreenVideo?: boolean
  reducedMotion?: boolean
  imageReady?: boolean
  originalUrl?: string
  tadazzImageUrl?: string
}): TadazzBackdropState {
  const { settings, cardBackground, originalUrl, tadazzImageUrl } = input
  const original: TadazzBackdropState = {
    source: "original",
    url: originalUrl,
    fit: "cover",
    intensity: 0,
    animate: false,
  }

  if (input.fullScreenVideo) {
    return { ...original, source: "cinema", url: undefined }
  }
  if (cardBackground?.url && isSafeMediaUrl(cardBackground.url)) {
    return {
      source: "card",
      url: cardBackground.url,
      fit: cardBackground.fit ?? "cover",
      intensity: 0,
      animate: false,
    }
  }
  if (!settings || settings.mode === "original") return original
  if (settings.mode === "static") {
    return settings.staticUrl && isSafeMediaUrl(settings.staticUrl)
      ? { source: "static", url: settings.staticUrl, fit: settings.fit, intensity: 0, animate: false }
      : original
  }
  if (input.imageReady === false || !tadazzImageUrl) return original

  return {
    source: "tadazz",
    url: tadazzImageUrl,
    fit: settings.fit,
    intensity: settings.intensity,
    animate: !input.reducedMotion && !settings.paused && settings.intensity > 0,
  }
}
