import { tadaShowV1Schema } from "../show-authoring-schema"
import {
  previewPhaseSchema,
  type PreviewPhase,
  assertBoundedJson,
  freeze,
} from "./primitives"

export type PreviewDuration =
  | { kind: "known"; milliseconds: number }
  | { kind: "manual" | "infinite" | "unknown" }

export interface AuthoredPreviewChapter {
  id: string
  authoredKey: string
  cardIndex: number
  phase: string
  title: string
  duration: PreviewDuration
  /** Chapters describe authored order. Only an admitted runtime may grant seek. */
  seek: "unavailable"
}

// Read-only authored-order inventory, not a game engine or executable admission.
// Manual presentation milestones have no invented wall-time duration.
//
export function compileFullShowPreviewTimeline(input: unknown) {
  assertBoundedJson(input)
  const show = tadaShowV1Schema.parse(input)
  const chapters: AuthoredPreviewChapter[] = []
  show.cards.forEach((card, cardIndex) => {
    const add = (phase: string, duration: PreviewDuration) => {
      chapters.push({
        id: `${encodeURIComponent(card.key)}:${phase}`,
        authoredKey: card.key,
        cardIndex,
        phase,
        title: "question" in card ? card.question : card.title || show.title,
        duration,
        seek: "unavailable",
      })
    }

    if (card.kind === "quiz" || card.kind === "survey") {
      add("question", {
        kind: "known",
        milliseconds: card.cooldownSeconds * 1000,
      })
      add("answerCards", { kind: "manual" })
      add(
        "voting",
        card.timeSeconds > 0
          ? { kind: "known", milliseconds: card.timeSeconds * 1000 }
          : { kind: "infinite" },
      )
      for (const phase of ["voteLocked", "results"]) {
        add(phase, { kind: "manual" })
      }
    } else {
      let duration: PreviewDuration = { kind: "unknown" }

      if (card.advance === "manual") {
        duration = { kind: "manual" }
      } else if (card.advance === "onMediaEnd") {
        duration = { kind: "unknown" }
      } else if ("durationMs" in card) {
        duration = { kind: "known", milliseconds: card.durationMs }
      } else if ("durationSeconds" in card) {
        duration = { kind: "known", milliseconds: card.durationSeconds * 1000 }
      }

      add(card.kind, duration)
    }
  })

  return freeze(chapters)
}

/** Match the original application's role-specific presentation phase. */
export function applicationChapterPhase(
  phase: string,
  role: "manager" | "player" | "spectator",
): PreviewPhase {
  if (phase === "results" && role === "player") {
    return "personalResult"
  }

  const parsed = previewPhaseSchema.safeParse(phase)

  return parsed.success ? parsed.data : "interlude"
}
