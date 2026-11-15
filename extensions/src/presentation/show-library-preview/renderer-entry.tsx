import { createRoot } from "react-dom/client"
import { NativePreviewStage } from "./NativePreviewStage"
import type { PreviewLocale } from "./i18n"
import { validatePreviewFrame, type PreviewFrame } from "./stage-scene-adapter"

export interface RendererInput { frame: PreviewFrame; locale: PreviewLocale; reducedMotion: boolean }

/** Candidate artifact entry. This is not a registry, loader or capability grant. */
export function mountPreviewCandidate(element: HTMLElement, onUnavailable: () => void) {
  if (!(element.getRootNode() instanceof ShadowRoot)) throw new Error("show-preview:isolated-root-required")
  const root = createRoot(element)
  let disposed = false
  let revision = 0
  let current: RendererInput | null = null
  const render = () => {
    if (disposed || !current) return
    const { frame, locale, reducedMotion } = current
    root.render(<NativePreviewStage key={`${frame.role}:${frame.revision}:${frame.epoch}`} frame={frame}
      locale={locale} reducedMotion={reducedMotion} fitRevision={revision} onUnavailable={onUnavailable} />)
  }
  const resize = new ResizeObserver(() => { revision += 1; render() })
  resize.observe(element)
  return {
    update(input: RendererInput) {
      if (disposed) throw new Error("show-preview:disposed")
      if (!input || Object.keys(input).some((key) => !["frame", "locale", "reducedMotion"].includes(key)) ||
          !["en", "fr", "de", "es", "it", "ja", "tr", "vi"].includes(input.locale) || typeof input.reducedMotion !== "boolean") throw new Error("show-preview:invalid-input")
      const copy = structuredClone(input)
      validatePreviewFrame(copy.frame)
      current = copy
      render()
    },
    dispose() {
      if (disposed) return
      disposed = true
      resize.disconnect()
      root.unmount()
      current = null
    },
  }
}
