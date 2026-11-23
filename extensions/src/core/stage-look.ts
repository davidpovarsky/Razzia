import { CLASSIC_THEME_ID } from "./show-themes/selection"
import type { QuizExtrasV2 } from "./studio-timeline-schema"

// Compatibility for the one original show whose native styling predated saved
// presentation defaults. No copied game's identity is used as a renderer choice.
const LEGACY_GUESS_OFF_QUIZ_ID = "6369bf77-c3d4-40ee-8a67-0476434b562f"

/** Pure compatibility normalization; ordinary save/import persists the result. */
export function normalizeLegacyStageLook(extras: QuizExtrasV2): QuizExtrasV2 {
  if (
    extras.quizId !== LEGACY_GUESS_OFF_QUIZ_ID ||
    extras.defaults.stageLook !== undefined
  ) {
    return extras
  }

  return { ...extras, defaults: { ...extras.defaults, stageLook: "guess-off" } }
}

/** An explicit theme or composition remains the presentation authority. */
export function resolveStageLook(defaults?: {
  stageLook?: "theme" | "guess-off"
  showTheme?: { id?: string; version?: string }
  showComposition?: unknown
}): "theme" | "guess-off" {
  return defaults?.stageLook === "guess-off" &&
    defaults.showTheme?.id === CLASSIC_THEME_ID &&
    defaults.showTheme.version === "1.0.0" &&
    !defaults.showComposition
    ? "guess-off"
    : "theme"
}
