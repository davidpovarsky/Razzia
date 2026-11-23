import { requireLibraryValue } from "./required"
import type { TadaShowV1 } from "../show-authoring-schema"
import type { TimelineItem } from "../studio-timeline-schema"
import { applicationCardScopeId } from "./application-composition-pin"

/** Native UUIDs remain authoritative; export-friendly Q01 names are never room IDs. */
export function nativePreviewScopeIds(
  show: TadaShowV1,
  timeline: readonly TimelineItem[],
): Record<string, string> {
  if (timeline.length !== show.cards.length) {
    throw new Error("Preview timeline mismatch")
  }

  return Object.fromEntries(
    show.cards.map((card, index) => {
      const item = timeline[index]

      if (
        (card.kind === "quiz" || card.kind === "survey") !==
        (item.kind === "question")
      ) {
        throw new Error("Preview card mismatch")
      }

      const nativeId = item.kind === "question" ? item.questionId : item.sceneId
      const authoredAlias =
        show.defaults?.showCompositionScopeAliases?.[card.key]

      return [
        card.key,
        authoredAlias ??
          requireLibraryValue(
            applicationCardScopeId(
              nativeId,
              show.defaults?.showCompositionScopeAliases,
            ),
          ),
      ]
    }),
  )
}
