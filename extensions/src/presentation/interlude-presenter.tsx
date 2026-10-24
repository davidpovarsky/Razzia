import type { Interlude } from "@razzia/extensions/core"
import { useEffect, useMemo, useState } from "react"
import {
  calculateInterludeRemainingMs,
  processInterludeSkip,
  type InterludeSkipState,
} from "./interlude-state"

export interface InterludePresenterProps {
  interlude: Interlude
  serverStartedAt?: number
  isManager?: boolean
  onAdvance?: () => void
  onSkip?: () => void
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
 * - Resumes from server startedAt (snapshot resilience across reconnects)
 * - Auto advance vs manual manager trigger
 * - Manager skip action executed exactly once
 */
export const InterludePresenter = ({
  interlude,
  serverStartedAt,
  isManager = false,
  onAdvance,
  onSkip,
  className,
}: InterludePresenterProps) => {
  const [skipState, setSkipState] = useState<InterludeSkipState>({
    hasSkipped: false,
  })

  // Calculate initial remaining ms
  const initialRemaining = useMemo(
    () => calculateInterludeRemainingMs(serverStartedAt, interlude.durationMs),
    [serverStartedAt, interlude.durationMs],
  )

  const [remainingMs, setRemainingMs] = useState(initialRemaining)

  useEffect(() => {
    // Tick every 100ms for smooth progress / countdown display
    const interval = setInterval(() => {
      const remaining = calculateInterludeRemainingMs(
        serverStartedAt,
        interlude.durationMs,
      )
      setRemainingMs(remaining)

      if (remaining <= 0 && interlude.advance === "auto") {
        clearInterval(interval)
        onAdvance?.()
      }
    }, 100)

    return () => clearInterval(interval)
  }, [serverStartedAt, interlude.durationMs, interlude.advance, onAdvance])

  const handleSkipClick = () => {
    const { state: nextState, shouldEmitSkip } = processInterludeSkip(skipState)
    setSkipState(nextState)

    if (shouldEmitSkip) {
      onSkip?.()
    }
  }

  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000))

  return (
    <div
      className={clsx(
        "relative flex min-h-[400px] w-full max-w-4xl flex-col items-center justify-center rounded-2xl bg-black/40 p-8 text-center text-white backdrop-blur-md",
        className,
      )}
      data-testid="interlude-presenter"
      data-kind={interlude.kind}
      data-remaining={remainingSeconds}
    >
      {/* Title / Heading */}
      {interlude.title && (
        <h2 className="mb-4 text-3xl font-extrabold drop-shadow-md sm:text-5xl">
          {interlude.title}
        </h2>
      )}

      {/* Slide Content based on kind */}
      <div className="my-6 flex flex-1 flex-col items-center justify-center">
        {interlude.kind === "image" && interlude.url && (
          <img
            src={interlude.url}
            alt={interlude.title ?? "Interlude slide"}
            className="max-h-72 w-auto rounded-xl object-contain shadow-2xl"
            data-testid="interlude-image"
          />
        )}

        {interlude.kind === "video" && interlude.url && (
          <video
            src={interlude.url}
            autoPlay
            controls
            playsInline
            className="max-h-72 w-auto rounded-xl shadow-2xl"
            data-testid="interlude-video"
          />
        )}

        {interlude.kind === "countdown" && (
          <div
            className="flex size-32 items-center justify-center rounded-full bg-white/20 text-6xl font-black tabular-nums shadow-inner sm:size-44 sm:text-7xl"
            data-testid="interlude-countdown-circle"
          >
            {remainingSeconds}
          </div>
        )}

        {interlude.kind === "title" && !interlude.title && (
          <p className="text-xl font-medium text-white/80">...</p>
        )}
      </div>

      {/* Bottom Bar: Timer indicator & Manager Skip control */}
      <div className="mt-4 flex w-full items-center justify-between border-t border-white/20 pt-4">
        <span className="text-sm font-semibold tracking-wide text-white/70">
          {interlude.advance === "auto"
            ? `${remainingSeconds}s`
            : "Awaiting Host"}
        </span>

        {isManager && (
          <button
            type="button"
            onClick={handleSkipClick}
            disabled={skipState.hasSkipped}
            className={clsx(
              "rounded-lg bg-white px-4 py-2 font-bold text-black transition-opacity hover:bg-white/90",
              skipState.hasSkipped && "cursor-not-allowed opacity-50",
            )}
            data-testid="interlude-skip-button"
          >
            {skipState.hasSkipped ? "Skipped" : "Skip Interlude"}
          </button>
        )}
      </div>
    </div>
  )
}
