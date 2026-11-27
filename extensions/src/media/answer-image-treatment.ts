import type { CSSProperties } from "react"
import type { AnswerImageTreatment } from "../core/media"

/** Authored image semantics; transparent source pixels remain transparent. */
export function answerImageTreatmentStyle(
  treatment: AnswerImageTreatment | undefined,
): CSSProperties | undefined {
  return treatment === "silhouette"
    ? { filter: "brightness(0)", background: "transparent", boxShadow: "none" }
    : undefined
}
