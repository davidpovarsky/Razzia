// F's reusable payload consumer; G owns the concrete widget/HTML/SDK bridge.
import type { NativePreviewCandidateMountV2 } from "../../core/show-library/native-preview-renderer-v2-schema"
import {
  PREVIEW_CANDIDATE_META_V2,
  previewCandidateV2Schema,
} from "../contracts/preview-candidate-v2.ts"
import { hashJson, utf8Bytes } from "../contracts/canonical.ts"
import { LIMITS } from "../contracts/schemas.ts"
import { inputs, outputs } from "../contracts/tools.ts"

/**
 * G supplies the actual reviewed E mount through its loader. No module URL,
 * executable bytes, auth/key, normalizer or second clock enters this consumer.
 * The SDK App tool-input/result handlers pair begin/receive using one ticket.
 */

export function createPreviewCandidateConsumerV2(
  element: HTMLElement,
  mount: NativePreviewCandidateMountV2,
  onUnavailable: () => void,
) {
  let current: object | null = null
  let renderer: ReturnType<NativePreviewCandidateMountV2> | undefined =
    undefined
  let disposed = false
  const clear = () => {
    renderer?.dispose()
    renderer = undefined
  }
  const unavailable = () => {
    clear()
    onUnavailable()

    return false
  }

  return {
    begin(raw: unknown) {
      clear()
      current = null

      if (disposed) {
        throw new Error("preview-consumer:disposed")
      }

      const selected = inputs.preview_game.parse(raw)
      const ticket = Object.freeze({ ...selected })
      current = ticket

      return ticket
    },
    receive(
      ticket: ReturnType<typeof inputs.preview_game.parse>,
      raw: unknown,
    ) {
      if (disposed || current !== ticket) {
        return false
      }

      try {
        if (utf8Bytes(JSON.stringify(raw)) > LIMITS.response) {
          return unavailable()
        }

        const result = raw as {
          isError?: boolean
          structuredContent?: unknown
          _meta?: Record<string, unknown>
        }
        const body = outputs.preview_game.parse(result.structuredContent)

        if (
          body.ok ||
          body.error.code !== "PREVIEW_UNAVAILABLE" ||
          result.isError !== true
        ) {
          return unavailable()
        }

        const candidate = previewCandidateV2Schema.parse(
          result._meta?.[PREVIEW_CANDIDATE_META_V2],
        )

        if (
          candidate.draftId !== ticket.draftId ||
          candidate.revision !== ticket.expectedRevision ||
          (ticket.locale && candidate.input.locale !== ticket.locale) ||
          hashJson(candidate.input) !== candidate.inputDigest
        ) {
          return unavailable()
        }

        clear()
        const renderState = { failed: false }
        const next = mount(element, () => {
          renderState.failed = true
          unavailable()
        })

        if (renderState.failed) {
          next.dispose()

          return false
        }

        renderer = next
        next.update(candidate.input)

        return !renderState.failed
      } catch {
        return unavailable()
      }
    },
    cancel() {
      current = null
      clear()
    },
    dispose() {
      disposed = true
      current = null
      clear()
    },
  }
}
