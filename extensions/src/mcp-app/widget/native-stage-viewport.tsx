import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

// Fits the complete native answer composition without changing its layout.
// This observes layout only; the existing native demo clock owns playback time.
//
export function NativeStageViewportV3({
  children,
  enabled,
  onUnavailable,
}: {
  children: ReactNode
  enabled: boolean
  onUnavailable: () => void
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const [factor, setFactor] = useState(1)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const outer = viewport.current
    const inner = canvas.current

    if (!enabled || !outer || !inner) {
      return
    }

    let frame = 0
    let closed = false
    let size = { width: 0, height: 0 }
    let currentFactor = 1
    let attempts = 0
    let settlingFrames = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const measure = () => {
      if (closed) {
        return
      }

      const width = outer.clientWidth
      const height = outer.clientHeight

      if (width <= 0 || height <= 0) {
        return
      }

      if (
        Math.abs(width - size.width) > 1 ||
        Math.abs(height - size.height) > 1
      ) {
        size = { width, height }
        currentFactor = 1
        attempts = 0
        settlingFrames = 0
        outer.dataset.fitReady = "false"
        setDimensions(size)
        setFactor(1)
        schedule()

        return
      }

      // React and the browser must commit the requested logical canvas before
      // its overflow can inform another fit attempt. Pixel dimensions avoid
      // percentage-size resolution inside a size-contained native surface.
      if (
        Math.abs(inner.clientWidth - width * currentFactor) > 2 ||
        Math.abs(inner.clientHeight - height * currentFactor) > 2
      ) {
        settlingFrames += 1

        if (settlingFrames >= 8) {
          onUnavailable()
        } else {
          schedule()
        }

        return
      }

      settlingFrames = 0
      const native = inner.querySelector<HTMLElement>(
        '[data-testid="native-razzia-preview-v2"]',
      )

      if (!native) {
        return
      }

      // Offset geometry ignores native entrance transforms. Only a complete
      // composition that cannot fit its logical canvas causes uniform scaling.
      let left = 0
      let top = 0
      let right = native.scrollWidth
      let bottom = native.scrollHeight
      const parts = native.querySelectorAll<HTMLElement>(
        '[data-testid^="photo-card-choice-"], [data-testid^="native-razzia-answer-"], [data-testid="native-razzia-question"], [data-testid="native-razzia-clock"], [data-testid="zero-votes-notice"]',
      )
      for (const part of parts) {
        let x = 0
        let y = 0
        let node: HTMLElement | null = part

        while (node && node !== inner) {
          x += node.offsetLeft
          y += node.offsetTop
          node = node.offsetParent as HTMLElement | null
        }

        if (node === inner) {
          left = Math.min(left, x)
          top = Math.min(top, y)
          right = Math.max(right, x + part.offsetWidth)
          bottom = Math.max(bottom, y + part.offsetHeight)
        }
      }

      const demand = Math.max(
        right / inner.clientWidth,
        bottom / inner.clientHeight,
        1 - (2 * left) / inner.clientWidth,
        1 - (2 * top) / inner.clientHeight,
      )

      if (demand <= 1.01) {
        outer.dataset.fitReady = "true"

        return
      }

      if (attempts >= 8 || currentFactor >= 8) {
        onUnavailable()

        return
      }

      outer.dataset.fitReady = "false"
      attempts += 1
      currentFactor = Math.min(8, currentFactor * Math.min(2, demand + 0.02))
      setFactor(currentFactor)
      schedule()
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(outer)
    outer.addEventListener("load", schedule, true)
    schedule()

    return () => {
      closed = true
      observer.disconnect()
      outer.removeEventListener("load", schedule, true)
      cancelAnimationFrame(frame)
    }
  }, [enabled, onUnavailable])

  return (
    <div
      ref={viewport}
      data-testid="native-stage-viewport"
      data-fit-factor={factor}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        ref={canvas}
        style={{
          width: dimensions.width ? dimensions.width * factor : "100%",
          height: dimensions.height ? dimensions.height * factor : "100%",
          position: "absolute",
          inset: "0 auto auto 0",
          transform: `scale(${1 / factor})`,
          transformOrigin: "top left",
          containerType: "inline-size",
        }}
      >
        {children}
      </div>
    </div>
  )
}
