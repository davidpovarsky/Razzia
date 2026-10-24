import type { QuestionReveal, RevealEffect } from "@razzia/extensions/core"
import { useEffect, useMemo, useState } from "react"

export interface RevealMediaProps {
  src: string
  alt: string
  reveal?: QuestionReveal
  serverStartedAt?: number
  currentEpoch?: number
  isManager?: boolean
  isManuallyRevealed?: boolean
  reducedMotion?: boolean
  className?: string
  mediaClassName?: string
}

const clsx = (...classes: unknown[]): string =>
  classes
    .flatMap((c) => {
      if (!c) return []
      if (typeof c === "string") return [c]
      if (Array.isArray(c)) return [clsx(...c)]
      if (typeof c === "object") {
        return Object.entries(c)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
      }
      return []
    })
    .join(" ")

/**
 * Calculates current progress (0..1) of a reveal effect based on server clock synchronization.
 * If elapsed >= durationMs, progress is 1.0 (fully revealed).
 */
export const calculateRevealProgress = (
  serverStartedAt: number | undefined,
  durationMs: number,
  now: number = Date.now(),
): number => {
  if (!serverStartedAt) {
    return 1.0
  }

  const elapsed = Math.max(0, now - serverStartedAt)

  if (elapsed >= durationMs) {
    return 1.0
  }

  return elapsed / durationMs
}

/**
 * RevealMedia renders question media with synchronized reveal effects:
 * - none (instant display)
 * - blur (heavy gaussian blur easing to crisp clarity)
 * - pixelate (CSS / SVG filter resolution unmasking)
 * - tiles (grid of 16 opaque tiles dissolving)
 * - zoom (oversized scale easing to 100%)
 *
 * Synchronized by server epoch/seq and timestamp (startedAt), preventing premature reveal
 * or replay after reconnect. Respects prefers-reduced-motion.
 */
export const RevealMedia = ({
  src,
  alt,
  reveal,
  serverStartedAt,
  currentEpoch,
  isManager = false,
  isManuallyRevealed = false,
  reducedMotion = false,
  className,
  mediaClassName,
}: RevealMediaProps) => {
  const effect: RevealEffect = reveal?.effect ?? "none"
  const durationMs = reveal?.durationMs ?? 0
  const trigger = reveal?.trigger ?? "automatic"
  const audience = reveal?.audience ?? "all"

  // Audience check: if audience is 'manager' only and client is player, do not reveal or hide
  const isAudienceAllowed = audience === "all" || isManager

  // Reduced motion check (system preference or explicit prop)
  const [systemReducedMotion, setSystemReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
      setSystemReducedMotion(mediaQuery.matches)

      const handler = (e: MediaQueryListEvent) =>
        setSystemReducedMotion(e.matches)
      mediaQuery.addEventListener?.("change", handler)

      return () => mediaQuery.removeEventListener?.("change", handler)
    }
  }, [])

  const shouldSkipAnimation =
    reducedMotion || systemReducedMotion || effect === "none" || durationMs <= 0

  // Determine whether reveal should be active based on trigger
  const isTriggered = trigger === "automatic" || isManuallyRevealed

  // Compute server-synchronized progress at mount
  const initialProgress = useMemo(() => {
    if (shouldSkipAnimation || !isTriggered) {
      return isTriggered ? 1.0 : 0.0
    }

    return calculateRevealProgress(serverStartedAt, durationMs)
  }, [
    shouldSkipAnimation,
    isTriggered,
    serverStartedAt,
    durationMs,
    currentEpoch,
  ])

  const [progress, setProgress] = useState<number>(initialProgress)

  useEffect(() => {
    // If not triggered yet or animation skipped, snap to target
    if (!isTriggered) {
      setProgress(0.0)

      return
    }

    if (shouldSkipAnimation) {
      setProgress(1.0)

      return
    }

    // Check how much time has already passed
    const now = Date.now()
    const currentProgress = calculateRevealProgress(
      serverStartedAt,
      durationMs,
      now,
    )

    if (currentProgress >= 1.0) {
      setProgress(1.0)

      return
    }

    setProgress(currentProgress)

    // Run animation loop until 100%
    const startTime = now - currentProgress * durationMs
    let animationFrameId: number

    const tick = () => {
      const elapsed = Date.now() - startTime
      const nextProgress = Math.min(1.0, elapsed / durationMs)

      setProgress(nextProgress)

      if (nextProgress < 1.0) {
        animationFrameId = requestAnimationFrame(tick)
      }
    }

    animationFrameId = requestAnimationFrame(tick)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [
    isTriggered,
    shouldSkipAnimation,
    serverStartedAt,
    durationMs,
    currentEpoch,
  ])

  if (!isAudienceAllowed) {
    return null
  }

  // Effect-specific style calculations based on progress (0 -> 1)
  const isFullyRevealed = progress >= 1.0

  let containerStyle: React.CSSProperties = {}
  let imageStyle: React.CSSProperties = {}

  if (!isFullyRevealed && effect !== "none") {
    switch (effect) {
      case "blur": {
        const blurPx = Math.round((1 - progress) * 24)
        imageStyle = {
          filter: `blur(${blurPx}px)`,
          transform: `scale(${1 + (1 - progress) * 0.05})`,
          transition: "filter 50ms linear, transform 50ms linear",
        }
        break
      }
      case "zoom": {
        const scale = 1 + (1 - progress) * 1.5
        imageStyle = {
          transform: `scale(${scale})`,
          transition: "transform 50ms linear",
        }
        break
      }
      case "pixelate": {
        const blurPx = Math.round((1 - progress) * 16)
        imageStyle = {
          filter: `blur(${blurPx}px) contrast(${1 + (1 - progress) * 1.5})`,
          imageRendering: "pixelated",
          transition: "filter 50ms linear",
        }
        break
      }
      case "tiles": {
        // Handled via grid overlay below
        break
      }
    }
  }

  return (
    <div
      className={clsx(
        "relative inline-block overflow-hidden rounded-xl bg-black/10",
        className,
      )}
      style={containerStyle}
      data-testid="reveal-media-container"
      data-effect={effect}
      data-progress={progress.toFixed(3)}
      data-revealed={String(isFullyRevealed)}
    >
      <img
        src={src}
        alt={alt}
        style={imageStyle}
        data-testid="reveal-media-image"
        className={clsx(
          "max-h-60 w-auto rounded-xl object-contain sm:max-h-96",
          mediaClassName,
        )}
      />

      {/* Tiles Effect Overlay: 4x4 grid of tiles fading out sequentially */}
      {!isFullyRevealed && effect === "tiles" && (
        <div
          aria-hidden="true"
          className="absolute inset-0 grid grid-cols-4 grid-rows-4"
          data-testid="reveal-tiles-grid"
        >
          {Array.from({ length: 16 }).map((_, index) => {
            // Sequential reveal order based on diagonal / pseudo-random index
            const tileThreshold = (index + 1) / 16
            const isTileGone = progress >= tileThreshold

            return (
              <div
                key={index}
                className={clsx(
                  "bg-neutral-900 transition-opacity duration-150",
                  isTileGone ? "opacity-0" : "opacity-100",
                )}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
