import { join } from "path"

export const MANAGER_PASSWORD = "e2e-password"

// Only owned E2E backends enable this synthetic test endpoint.
export const TZILA_PILOT_SECRET = "e2e-tzila-pilot-isolated"

export const CONFIG_PATH = join(import.meta.dirname, "../.config")

export const BASIC_QUIZZ = "E2E Quizz"

export const SCORING_QUIZZ = "E2E Scoring"

export const SURVEY_QUIZZ = "E2E Survey"

export const REVEAL_QUIZZ = "E2E Reveal"
