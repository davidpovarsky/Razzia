import {
  useCallback,
  useLayoutEffect,
  useRef,
  type RefObject,
  type PointerEvent,
  type MouseEvent,
} from "react"
import { createPreviewActivation } from "./activation"

/** Cover-only DOM adapter. Ordinary pointerdown never prevents scrolling/default actions. */
export function usePreviewActivation({
  enabled,
  active,
  rootRef,
  open,
}: {
  enabled: boolean
  active: boolean
  rootRef: RefObject<HTMLDivElement | null>
  open: () => void
}) {
  const machine = useRef<ReturnType<typeof createPreviewActivation> | null>(
    null,
  )
  const watch = useRef<AbortController | null>(null)
  const origin = useRef<number | null>(null)
  const latestOpen = useRef(open)
  latestOpen.current = open
  const stopWatching = useCallback(() => {
    watch.current?.abort()
    watch.current = null
  }, [])
  const cancel = useCallback(() => {
    machine.current?.cancel()
    stopWatching()
  }, [stopWatching])

  useLayoutEffect(() => {
    if (!enabled) {
      return
    }

    const activation = createPreviewActivation(() => {
      stopWatching()
      const element = rootRef.current
      const pointer = origin.current

      if (element && pointer !== null) {
        try {
          // Capture only AFTER recognition, never while a finger may still pan.
          element.setPointerCapture(pointer)
        } catch {
          // The pointer may have ended between timer delivery and capture.
        }
      }

      latestOpen.current()
    })
    machine.current = activation

    return () => {
      activation.dispose()
      machine.current = null
      stopWatching()
    }
  }, [enabled, rootRef, stopWatching])

  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      const target = event.target instanceof Element ? event.target : null
      const cover = target?.closest("[data-preview-cover-action]")
      const action = target?.closest(
        "button,a,input,select,textarea,[role=button],[role=menuitem]",
      )
      const nestedAction =
        active || !cover || Boolean(action && action !== cover)
      origin.current = event.pointerId
      machine.current?.down({
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        x: event.clientX,
        y: event.clientY,
        primary: event.isPrimary,
        button: event.button,
        nestedAction,
      })
      stopWatching()

      if (!enabled || nestedAction || event.button !== 0 || !event.isPrimary) {
        return
      }

      const owner = new AbortController()
      watch.current = owner
      const options = { capture: true, passive: true, signal: owner.signal }
      window.addEventListener("scroll", cancel, options)
      window.addEventListener("blur", cancel, options)
      window.addEventListener("pointerup", cancel, options)
      window.addEventListener("pointercancel", cancel, options)
      rootRef.current?.getRootNode().addEventListener("scroll", cancel, options)
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      machine.current?.move(event.pointerId, event.clientX, event.clientY)
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      machine.current?.up(event.pointerId)
      stopWatching()

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onLostPointerCapture: cancel,
    onClickCapture(event: MouseEvent<HTMLDivElement>) {
      if (event.detail > 0 && machine.current?.consumeClick()) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    onContextMenu(event: MouseEvent<HTMLDivElement>) {
      if (machine.current?.interceptContextMenu()) {
        event.preventDefault()
      }
    },
  }
}
