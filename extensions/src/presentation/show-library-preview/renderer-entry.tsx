import { restoreNativeCspConfiguration } from "./renderer-csp-admission"
import { createRoot } from "react-dom/client"
import { NativePreviewStage } from "./NativePreviewStage"
import {
  nativePreviewRendererInputV1Schema,
  type NativePreviewRendererInputV1,
  type NativePreviewCandidateMountV1,
} from "../../core/show-library/native-preview-frame-schema"
import type { TadazzStageHandle } from "../tadazz-show/TadazzStage"

restoreNativeCspConfiguration()

export type RendererInput = NativePreviewRendererInputV1
const handleIds = new WeakMap<TadazzStageHandle, number>()
let nextHandleId = 0

/** Candidate artifact entry. This is not a registry, loader or capability grant. */
export function mountPreviewCandidate(
  element: HTMLElement,
  onUnavailable: () => void,
) {
  if (!(element.getRootNode() instanceof ShadowRoot))
    throw new Error("show-preview:isolated-root-required")
  const root = createRoot(element)
  let disposed = false
  let revision = 0
  let current: RendererInput | null = null
  let handleId: number | null = null
  const lifecycle: Array<{ event: "mounted" | "disposed"; handleId: number }> =
    []
  const observeHandle = (handle: TadazzStageHandle | null) => {
    if (!handle) {
      if (handleId !== null) lifecycle.push({ event: "disposed", handleId })
      handleId = null
      if (lifecycle.length > 64) lifecycle.splice(0, lifecycle.length - 64)
      return
    }
    let id = handleIds.get(handle)
    if (id === undefined) {
      id = ++nextHandleId
      handleIds.set(handle, id)
    }
    handleId = id
    lifecycle.push({ event: "mounted", handleId: id })
    if (lifecycle.length > 64) lifecycle.splice(0, lifecycle.length - 64)
  }
  const render = () => {
    if (disposed || !current) return
    const { frame, locale, reducedMotion } = current
    root.render(
      <NativePreviewStage
        key={`${frame.role}:${frame.revision}:${frame.epoch}`}
        frame={frame}
        locale={locale}
        reducedMotion={reducedMotion}
        fitRevision={revision}
        onUnavailable={onUnavailable}
        onStageHandle={observeHandle}
      />,
    )
  }
  const resize = new ResizeObserver(() => {
    revision += 1
    render()
  })
  resize.observe(element)
  return {
    update(input: RendererInput) {
      if (disposed) throw new Error("show-preview:disposed")
      const copy = nativePreviewRendererInputV1Schema.parse(input)
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
    /** Read-only identity witness from the actual React ref. No native commands escape. */
    diagnostics() {
      return {
        disposed,
        handleId,
        lifecycle: lifecycle.map((entry) => ({ ...entry })),
      }
    },
  }
}
const sharedMountCompatibility: NativePreviewCandidateMountV1 =
  mountPreviewCandidate
void sharedMountCompatibility
