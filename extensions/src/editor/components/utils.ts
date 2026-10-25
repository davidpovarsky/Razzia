import type { QuizExtrasV1 } from "@razzia/extensions/core"

export interface MediaPickerRequestOptions {
  target?: {
    questionId: string
    kind: "answer" | "interlude"
    answerIndex?: number
  }
  expectedType?: "image" | "video"
}

export const CANONICAL_ANSWER_COLORS = [
  "bg-[var(--color-answer-1)] text-white",
  "bg-[var(--color-answer-2)] text-white",
  "bg-[var(--color-answer-3)] text-white",
  "bg-[var(--color-answer-4)] text-white",
]

export const DEFAULT_TEAM_PALETTE = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16",
  "#06b6d4",
  "#d946ef",
]

export const clsx = (...classes: unknown[]): string =>
  classes
    .flatMap((c) => {
      if (!c) {
        return []
      }

      if (typeof c === "string") {
        return [c]
      }

      if (Array.isArray(c)) {
        return [clsx(...(c as unknown[]))]
      }

      if (typeof c === "object") {
        return Object.entries(c)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
      }

      return []
    })
    .join(" ")

export type PerQuestionExtras = NonNullable<QuizExtrasV1["perQuestion"][string]>
