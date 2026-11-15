import { useEffect, useRef } from "react"
import { mountCompositionPreviewCandidateV2 } from "../../presentation/show-library-preview/renderer-entry-v2"
import {
  nativePreviewRendererInputV2Schema,
  type NativePreviewRendererInputV2,
} from "../../core/show-library/native-preview-renderer-v2-schema"

// Build.mjs replaces this literal with the exact built stylesheet. No fetch,
// caller CSS, runtime code URL or external module loader enters the iframe.
export const bundledStyle = "__TADAZZ_WIDGET_BUNDLED_CSS_20261115__"

export function CandidateStage({
  input,
  onUnavailable,
}: {
  input: NativePreviewRendererInputV2
  onUnavailable: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const renderer = useRef<ReturnType<
    typeof mountCompositionPreviewCandidateV2
  > | null>(null)
  const failure = useRef(onUnavailable)
  failure.current = onUnavailable
  useEffect(() => {
    const target = host.current

    if (!target) {
      return
    }

    const shadow = target.shadowRoot ?? target.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = bundledStyle
    const element = document.createElement("div")
    element.className = "widget-native-stage"
    shadow.replaceChildren(style, element)
    const mounted = mountCompositionPreviewCandidateV2(element, () =>
      failure.current(),
    )
    renderer.current = mounted

    return () => {
      renderer.current = null
      mounted.dispose()
      shadow.replaceChildren()
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    // Native mount commits synchronously; call outside React's effect commit.
    queueMicrotask(() => {
      if (cancelled || !renderer.current) {
        return
      }

      try {
        renderer.current.update(nativePreviewRendererInputV2Schema.parse(input))
      } catch {
        failure.current()
      }
    })

    return () => {
      cancelled = true
    }
  }, [input])

  return (
    <div
      className="widget-stage-host"
      ref={host}
      data-testid="candidate-stage"
    />
  )
}
