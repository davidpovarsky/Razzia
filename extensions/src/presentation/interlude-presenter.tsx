import { PlatformButton } from "./platform-controls"
import type { Interlude } from "@razzia/extensions/core"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  calculateInterludeRemainingMs,
  processInterludeSkip,
  type InterludeSkipState,
} from "./interlude-state"

export interface InterludePresenterLabels {
  secondsRemaining?: (seconds: number) => string
  awaitingHost?: string
  skipInterlude?: string
  skipped?: string
  slideAlt?: string
}

export interface InterludePresenterProps {
  interlude: Interlude
  serverStartedAt?: number
  isManager?: boolean
  onAdvance?: () => void
  onSkip?: () => void
  labels?: InterludePresenterLabels
  className?: string
}

const clsx = (...classes: unknown[]): string =>
  classes
    .flatMap((c) => {
      if (!c) {
        return []
      }

      if (typeof c === "string") {
        return [c]
      }

      if (Array.isArray(c)) {
        return [clsx(...(c as unknown[]))]
      }

      if (typeof c === "object") {
        return Object.entries(c)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
      }

      return []
    })
    .join(" ")

/**
 * InterludePresenter displays interlude slides between question results and the next question.
 * Supports title, image, video, and countdown screen kinds.
 * - Full-screen cinematic presentation suitable for an event projection
 * - Resumes from server startedAt (snapshot resilience across reconnects)
 * - Auto advance vs manual manager trigger
 * - Manager skip action executed exactly once
 * - Reliable unmount media disposal
 */
export const InterludePresenter = ({
  interlude,
  serverStartedAt,
  isManager = false,
  onAdvance: _onAdvance,
  onSkip,
  labels,
  className,
}: InterludePresenterProps) => {
  const [skipState, setSkipState] = useState<InterludeSkipState>({
    hasSkipped: false,
  })
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Reset skip state on new interlude or server timestamp change
  useEffect(() => {
    setSkipState({ hasSkipped: false })
  }, [serverStartedAt, interlude])

  // Calculate initial remaining ms
  const initialRemaining = useMemo(
    () => calculateInterludeRemainingMs(serverStartedAt, interlude.durationMs),
    [serverStartedAt, interlude.durationMs],
  )

  const [remainingMs, setRemainingMs] = useState(initialRemaining)

  useEffect(() => {
    // Tick every 100ms for smooth progress / countdown display
    // The server is the sole authoritative driver of automatic phase transitions;
    // the frontend timer provides smooth visual progress only.
    const interval = setInterval(() => {
      const remaining = calculateInterludeRemainingMs(
        serverStartedAt,
        interlude.durationMs,
      )
      setRemainingMs(remaining)
    }, 100)

    return () => clearInterval(interval)
  }, [serverStartedAt, interlude.durationMs])

  // Stop video media on unmount
  useEffect(() => {
    const videoEl = videoRef.current

    return () => {
      if (videoEl) {
        videoEl.pause()
        videoEl.removeAttribute("src")
        videoEl.load()
      }
    }
  }, [])

  const handleSkipClick = () => {
    const { state: nextState, shouldEmitSkip } = processInterludeSkip(skipState)
    setSkipState(nextState)

    if (shouldEmitSkip) {
      onSkip?.()
    }
  }

  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const progressRatio = Math.max(
    0,
    Math.min(1, remainingMs / (interlude.durationMs || 1)),
  )

  const labelSecondsRemaining =
    labels?.secondsRemaining ?? ((sec: number) => `${sec}s remaining`)
  const labelAwaitingHost = labels?.awaitingHost ?? "Awaiting Host to advance"
  const labelSkipInterlude = labels?.skipInterlude ?? "Skip Interlude"
  const labelSkipped = labels?.skipped ?? "Skipped"
  const labelSlideAlt = labels?.slideAlt ?? interlude.title ?? "Interlude slide"

  return (
    <div
      className={clsx(
        "relative flex min-h-[500px] w-full max-w-6xl flex-1 flex-col items-center justify-between rounded-3xl border border-white/10 bg-black/60 p-6 text-center text-white shadow-2xl backdrop-blur-xl sm:p-12",
        className,
      )}
      data-testid="interlude-presenter"
      data-kind={interlude.kind}
      data-remaining={remainingSeconds}
    >
      {/* Title / Heading */}
      {interlude.title && (
        <h2 className="mb-4 max-w-4xl text-3xl font-black tracking-tight drop-shadow-2xl sm:text-5xl md:text-6xl">
          {interlude.title}
        </h2>
      )}

      {/* Slide Content based on kind */}
      <div className="my-6 flex w-full flex-1 flex-col items-center justify-center">
        {interlude.kind === "image" && interlude.url && (
          <div className="relative max-h-[55vh] max-w-[85vw] overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
            <img
              src={interlude.url}
              alt={labelSlideAlt}
              className="max-h-[55vh] w-auto max-w-[85vw] rounded-2xl object-contain shadow-2xl"
              data-testid="interlude-image"
            />
          </div>
        )}

        {interlude.kind === "video" && interlude.url && (
          <div className="relative max-h-[55vh] max-w-[85vw] overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
            <video
              ref={videoRef}
              src={interlude.url}
              autoPlay
              controls
              playsInline
              className="max-h-[55vh] w-auto max-w-[85vw] rounded-2xl shadow-2xl"
              data-testid="interlude-video"
            />
          </div>
        )}

        {interlude.kind === "countdown" && (
          <div className="relative flex items-center justify-center">
            <div
              className="flex size-44 items-center justify-center rounded-full border-4 border-white/40 bg-black/40 text-7xl font-black tabular-nums shadow-2xl backdrop-blur-md transition-transform duration-200 sm:size-56 sm:border-8 sm:text-8xl md:size-64 md:text-9xl"
              data-testid="interlude-countdown-circle"
            >
              {remainingSeconds}
            </div>
          </div>
        )}

        {interlude.kind === "title" && !interlude.title && (
          <p className="text-2xl font-medium text-white/70">...</p>
        )}
      </div>

      {/* Bottom Bar: Timer indicator / Progress & Manager Skip control */}
      <div className="mt-4 flex w-full flex-col gap-3 border-t border-white/20 pt-4">
        {interlude.advance === "auto" && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all duration-100 ease-linear"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
        )}

        <div className="flex w-full items-center justify-between">
          <span className="text-sm font-semibold tracking-wide text-white/70">
            {interlude.advance === "auto"
              ? labelSecondsRemaining(remainingSeconds)
              : labelAwaitingHost}
          </span>

          {isManager && (
            <PlatformButton size="sm"
              type="button"
              onClick={handleSkipClick}
              disabled={skipState.hasSkipped}
              className={clsx(
                "rounded-lg bg-white px-5 py-2.5 font-bold text-black shadow-md transition-opacity hover:bg-white/90",
                skipState.hasSkipped && "cursor-not-allowed opacity-50",
              )}
              data-testid="interlude-skip-button"
            >
              {skipState.hasSkipped ? labelSkipped : labelSkipInterlude}
            </PlatformButton>
          )}
        </div>
      </div>
    </div>
  )
}
