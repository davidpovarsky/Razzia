import {
  FULL_SHOW_META_V3,
  fullShowFrameV3Schema,
  fullShowToolInputV3Schema,
} from "../contracts/full-show-frame.ts"
import { dataSchemas, outputs } from "../contracts/tools.ts"
import { canonicalJson, hashJson, utf8Bytes } from "../contracts/canonical.ts"
import { LIMITS } from "../contracts/schemas.ts"

/** Strict SDK payload consumer. A late result can only match its own invocation ticket. */
export function createFullShowConsumerV3(rendererBuildId: string) {
  let current: object | null = null
  let disposed = false

  return {
    begin(raw: unknown) {
      if (disposed) {
        throw new Error("full-show:disposed")
      }

      current = Object.freeze(fullShowToolInputV3Schema.parse(raw))

      return current
    },
    receive(ticket: object, raw: unknown) {
      if (disposed || current !== ticket) {
        return null
      }

      if (utf8Bytes(JSON.stringify(raw)) > LIMITS.response) {
        throw new Error("full-show:response-budget")
      }

      const result = raw as {
        isError?: boolean
        structuredContent?: unknown
        _meta?: Record<string, unknown>
      }
      const body = outputs.preview_show.parse(result.structuredContent)

      if (!body.ok || result.isError === true) {
        throw new Error("full-show:unavailable")
      }

      const data = dataSchemas.preview_show.parse(body.data)
      const frame = fullShowFrameV3Schema.parse(
        result._meta?.[FULL_SHOW_META_V3],
      )
      const input = fullShowToolInputV3Schema.parse(ticket)

      if (
        frame.rendererBuildId !== rendererBuildId ||
        data.frameDigest !== hashJson(frame) ||
        frame.inventory.draftId !== input.draftId ||
        frame.inventory.revision !== input.expectedRevision ||
        data.draftId !== input.draftId ||
        data.revision !== input.expectedRevision ||
        data.selectedChapterId !== frame.inventory.selectedChapterId ||
        data.chapterCount !== frame.inventory.chapters.length ||
        data.title !== frame.inventory.title ||
        (input.chapterId &&
          frame.inventory.selectedChapterId !== input.chapterId) ||
        canonicalJson(frame.inventory.context) !== canonicalJson(input.context)
      ) {
        throw new Error("full-show:association")
      }

      return frame
    },
    cancel() {
      current = null
    },
    dispose() {
      disposed = true
      current = null
    },
  }
}
