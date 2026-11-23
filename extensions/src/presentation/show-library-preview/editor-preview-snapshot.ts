import {
  authoredCardSchema,
  tadaShowV1Schema,
} from "../../core/show-authoring-schema"
import { compileFullShowPreviewTimeline } from "../../core/show-library/full-show-preview-timeline"
import { nativePreviewScopeIds } from "../../core/show-library/native-preview-scopes"
import type { TimelineItem } from "../../core/studio-timeline-schema"

/** Materialize only the open editor's data into the native preview's JSON contract. */
export function createEditorPreviewSnapshot(
  source: unknown,
  timeline?: readonly TimelineItem[],
  authoredKey?: string,
) {
  try {
    // Native authoring conversion includes absent optional properties as
    // undefined; executable-preview JSON intentionally rejects those values.
    let input: unknown = JSON.parse(JSON.stringify(source))
    let scopedTimeline = timeline
    let questionPosition: { number: number; total: number } | undefined =
      undefined

    if (
      authoredKey &&
      typeof input === "object" &&
      input !== null &&
      "cards" in input &&
      Array.isArray(input.cards)
    ) {
      if (timeline && timeline.length !== input.cards.length) {
        return null
      }

      const questionKeysInEditor = input.cards.flatMap((candidate: unknown) =>
        typeof candidate === "object" &&
        candidate !== null &&
        "kind" in candidate &&
        (candidate.kind === "quiz" || candidate.kind === "survey") &&
        "key" in candidate &&
        typeof candidate.key === "string"
          ? [candidate.key]
          : [],
      )
      const questionIndex = questionKeysInEditor.indexOf(authoredKey)

      if (questionIndex >= 0) {
        questionPosition = {
          number: questionIndex + 1,
          total: questionKeysInEditor.length,
        }
      }

      const cards: Array<ReturnType<typeof authoredCardSchema.parse>> = []
      const contextTimeline: TimelineItem[] = []
      for (const [index, candidate] of input.cards.entries()) {
        const card = authoredCardSchema.safeParse(candidate)

        if (!card.success) {
          continue
        }

        // Other scene drafts are irrelevant to the current stage. Retain valid
        // question context for ordering and recap without fabricating responses.
        if (
          card.data.key === authoredKey ||
          card.data.kind === "quiz" ||
          card.data.kind === "survey"
        ) {
          cards.push(card.data)

          if (timeline) {
            contextTimeline.push(timeline[index])
          }
        }
      }

      if (!cards.some((card) => card.key === authoredKey)) {
        return null
      }

      const questionKeys = new Set(
        cards
          .filter((card) => card.kind === "quiz" || card.kind === "survey")
          .map((card) => card.key),
      )
      const settings =
        "settings" in input && Array.isArray(input.settings)
          ? input.settings.map((setting: unknown) => {
              if (
                typeof setting === "object" &&
                setting !== null &&
                "scope" in setting &&
                setting.scope === "leaderboard" &&
                "property" in setting &&
                setting.property === "afterQuestionIds" &&
                "valueJson" in setting &&
                Array.isArray(setting.valueJson)
              ) {
                return {
                  ...setting,
                  valueJson: setting.valueJson.filter(
                    (key: unknown) =>
                      typeof key === "string" && questionKeys.has(key),
                  ),
                }
              }

              return setting
            })
          : []
      input = { ...input, cards, settings }
      scopedTimeline = timeline ? contextTimeline : undefined
    }

    const parsed = tadaShowV1Schema.safeParse(input)

    if (!parsed.success) {
      return null
    }

    const show = JSON.parse(JSON.stringify(parsed.data)) as ReturnType<
      typeof tadaShowV1Schema.parse
    >
    const chapters = compileFullShowPreviewTimeline(show)
    const scopeIds = scopedTimeline
      ? nativePreviewScopeIds(show, scopedTimeline)
      : undefined

    return { show, chapters, scopeIds, questionPosition }
  } catch {
    // Partially edited values, invalid references and legacy drafts remain in
    // the native presentational fallback instead of replacing the editor.
    return null
  }
}
