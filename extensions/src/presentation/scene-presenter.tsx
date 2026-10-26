import type { SceneConfig } from "../core/studio-timeline-schema"
import type { AuthoritativeStepEnvelope } from "../server/game/studio-show-coordinator"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  calculateInterludeRemainingMs,
  processInterludeSkip,
  type InterludeSkipState,
} from "./interlude-state"
import {
  AlertTriangle,
  Award,
  BarChart3,
  Clock,
  Film,
  Layers,
  Sparkles,
  Trophy,
} from "lucide-react"

export interface ScenePresenterProps {
  step?: AuthoritativeStepEnvelope | null
  scene?: SceneConfig
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
 * Studio ScenePresenter renders all 8 non-question timeline kinds:
 * transition, animation, media, leaderboard, interimResults, countdown, opening, closing.
 * Resumes gracefully across reconnects from serverStartedAt, ensures fallback placeholders
 * for missing media, and supports manager skip actions.
 */
export const ScenePresenter = ({
  step,
  scene,
  serverStartedAt,
  isManager = false,
  onAdvance: _onAdvance,
  onSkip,
  className,
}: ScenePresenterProps) => {
  const activeScene = scene ?? step?.scene
  const kind = activeScene?.kind ?? step?.kind ?? "transition"

  const durationMs = useMemo(() => {
    if (activeScene && "durationMs" in activeScene && typeof activeScene.durationMs === "number") {
      return activeScene.durationMs
    }

    if (activeScene && "durationSeconds" in activeScene && typeof activeScene.durationSeconds === "number") {
      return activeScene.durationSeconds * 1000
    }

    return step?.durationMs ?? 5000
  }, [activeScene, step?.durationMs])

  const [skipState, setSkipState] = useState<InterludeSkipState>({
    hasSkipped: false,
  })
  const [mediaError, setMediaError] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    setSkipState({ hasSkipped: false })
    setMediaError(false)
  }, [serverStartedAt, activeScene?.id])

  const initialRemaining = useMemo(
    () => calculateInterludeRemainingMs(serverStartedAt, durationMs),
    [serverStartedAt, durationMs],
  )

  const [remainingMs, setRemainingMs] = useState(initialRemaining)

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = calculateInterludeRemainingMs(serverStartedAt, durationMs)
      setRemainingMs(remaining)
    }, 100)

    return () => clearInterval(interval)
  }, [serverStartedAt, durationMs])

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
  const progressRatio = Math.max(0, Math.min(1, remainingMs / (durationMs || 1)))
  const advanceMode = (activeScene && "advance" in activeScene ? activeScene.advance : step?.advance) ?? "auto"

  return (
    <div
      className={clsx(
        "relative flex min-h-[500px] w-full max-w-6xl flex-1 flex-col items-center justify-between rounded-3xl border border-white/10 bg-black/60 p-6 text-center text-white shadow-2xl backdrop-blur-xl sm:p-12",
        className,
      )}
      data-testid="studio-scene-presenter"
      data-kind={kind}
      data-remaining={remainingSeconds}
    >
      {/* 1. Header / Title */}
      <div className="w-full">
        {kind === "opening" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-primary/20 px-4 py-1.5 text-sm font-bold text-primary">
              <Sparkles className="size-4" />
              <span>Show Opening</span>
            </div>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white drop-shadow-2xl sm:text-6xl">
              {"title" in (activeScene ?? {}) ? (activeScene as { title: string }).title : "Welcome to the Show"}
            </h1>
            {"subtitle" in (activeScene ?? {}) && (activeScene as { subtitle?: string }).subtitle && (
              <p className="max-w-2xl text-xl font-medium text-white/80">
                {(activeScene as { subtitle?: string }).subtitle}
              </p>
            )}
          </div>
        )}

        {kind === "closing" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-primary/20 px-4 py-1.5 text-sm font-bold text-primary">
              <Award className="size-4" />
              <span>Show Closing</span>
            </div>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white drop-shadow-2xl sm:text-6xl">
              {"title" in (activeScene ?? {}) ? (activeScene as { title: string }).title : "Thank You For Playing"}
            </h1>
            {"subtitle" in (activeScene ?? {}) && (activeScene as { subtitle?: string }).subtitle && (
              <p className="max-w-2xl text-xl font-medium text-white/80">
                {(activeScene as { subtitle?: string }).subtitle}
              </p>
            )}
          </div>
        )}

        {kind === "transition" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-blue-500/20 px-4 py-1.5 text-sm font-bold text-blue-400">
              <Layers className="size-4" />
              <span>Transition</span>
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white drop-shadow-2xl sm:text-5xl">
              {"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Next Up" : "Next Up"}
            </h2>
            {"description" in (activeScene ?? {}) && (activeScene as { description?: string }).description && (
              <p className="max-w-2xl text-lg font-medium text-white/80">
                {(activeScene as { description?: string }).description}
              </p>
            )}
          </div>
        )}

        {kind === "leaderboard" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-yellow-500/20 px-4 py-1.5 text-sm font-bold text-yellow-400">
              <Trophy className="size-4" />
              <span>Leaderboard</span>
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white drop-shadow-2xl sm:text-5xl">
              {"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Leaderboard Standings" : "Leaderboard Standings"}
            </h2>
          </div>
        )}

        {kind === "interimResults" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-purple-500/20 px-4 py-1.5 text-sm font-bold text-purple-400">
              <BarChart3 className="size-4" />
              <span>Interim Standings</span>
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white drop-shadow-2xl sm:text-5xl">
              {"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Current Progress" : "Current Progress"}
            </h2>
          </div>
        )}

        {kind === "animation" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-indigo-500/20 px-4 py-1.5 text-sm font-bold text-indigo-400">
              <Sparkles className="size-4" />
              <span>Animation</span>
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white drop-shadow-2xl sm:text-5xl">
              {"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Get Ready" : "Get Ready"}
            </h2>
          </div>
        )}

        {kind === "media" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-1.5 text-sm font-bold text-emerald-400">
              <Film className="size-4" />
              <span>Media Spotlight</span>
            </div>
            {"title" in (activeScene ?? {}) && (activeScene as { title?: string }).title && (
              <h2 className="mt-2 text-3xl font-black tracking-tight text-white drop-shadow-2xl sm:text-5xl">
                {(activeScene as { title?: string }).title}
              </h2>
            )}
          </div>
        )}

        {kind === "countdown" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-red-500/20 px-4 py-1.5 text-sm font-bold text-red-400">
              <Clock className="size-4" />
              <span>Countdown</span>
            </div>
            {"title" in (activeScene ?? {}) && (activeScene as { title?: string }).title && (
              <h2 className="mt-2 text-3xl font-black tracking-tight text-white drop-shadow-2xl sm:text-5xl">
                {(activeScene as { title?: string }).title}
              </h2>
            )}
          </div>
        )}
      </div>

      {/* 2. Central Visual Body */}
      <div className="my-6 flex w-full flex-1 flex-col items-center justify-center">
        {kind === "countdown" && (
          <div className="relative flex items-center justify-center">
            <div
              className="flex size-48 items-center justify-center rounded-full border-8 border-red-500/60 bg-black/60 text-8xl font-black tabular-nums text-white shadow-2xl backdrop-blur-md transition-transform duration-200 sm:size-64 sm:text-9xl"
              data-testid="scene-countdown-circle"
            >
              {remainingSeconds}
            </div>
          </div>
        )}

        {kind === "animation" && (
          <div className="relative flex size-44 items-center justify-center rounded-full border-4 border-indigo-400/40 bg-indigo-500/20 p-8 shadow-2xl backdrop-blur-md sm:size-56">
            <Sparkles className="size-24 animate-pulse text-indigo-300 drop-shadow-2xl" />
          </div>
        )}

        {kind === "leaderboard" && (
          <div className="relative flex flex-col items-center justify-center gap-4">
            <div className="flex size-40 items-center justify-center rounded-full border-4 border-yellow-400/40 bg-yellow-500/20 p-8 shadow-2xl backdrop-blur-md">
              <Trophy className="size-24 text-yellow-300 drop-shadow-2xl" />
            </div>
            <p className="text-xl font-bold text-white/90">Authoritative Leaderboard Break</p>
          </div>
        )}

        {kind === "interimResults" && (
          <div className="relative flex flex-col items-center justify-center gap-4">
            <div className="flex size-40 items-center justify-center rounded-full border-4 border-purple-400/40 bg-purple-500/20 p-8 shadow-2xl backdrop-blur-md">
              <BarChart3 className="size-24 text-purple-300 drop-shadow-2xl" />
            </div>
            <p className="text-xl font-bold text-white/90">Audience Poll & Response Overview</p>
          </div>
        )}

        {/* Media or Optional Media in Opening/Closing */}
        {(kind === "media" || (activeScene && "mediaUrl" in activeScene && (activeScene as { mediaUrl?: string }).mediaUrl)) && (
          (() => {
            const { mediaUrl, mediaType = "image" } = (activeScene ?? {}) as {
              mediaUrl?: string
              mediaType?: "image" | "video"
            }

            if (!mediaUrl || mediaError) {
              return (
                <div
                  className="flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-black/40 p-12 text-muted-foreground shadow-2xl"
                  data-testid="scene-media-placeholder"
                >
                  <AlertTriangle className="size-16 text-yellow-400" />
                  <p className="mt-3 text-lg font-semibold text-white/80">
                    {mediaError ? "Failed to load media asset" : "No media asset configured"}
                  </p>
                </div>
              )
            }

            if (mediaType === "video") {
              return (
                <div className="relative max-h-[55vh] max-w-[85vw] overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
                  <video
                    ref={videoRef}
                    src={mediaUrl}
                    autoPlay
                    controls
                    playsInline
                    onError={() => setMediaError(true)}
                    className="max-h-[55vh] w-auto max-w-[85vw] rounded-2xl shadow-2xl"
                    data-testid="scene-video"
                  />
                </div>
              )
            }

            return (
              <div className="relative max-h-[55vh] max-w-[85vw] overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
                <img
                  src={mediaUrl}
                  alt={"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Scene media" : "Scene media"}
                  onError={() => setMediaError(true)}
                  className="max-h-[55vh] w-auto max-w-[85vw] rounded-2xl object-contain shadow-2xl"
                  data-testid="scene-image"
                />
              </div>
            )
          })()
        )}

        {kind === "transition" && !("mediaUrl" in (activeScene ?? {})) && (
          <div className="flex size-40 items-center justify-center rounded-full border-4 border-blue-400/40 bg-blue-500/20 p-8 shadow-2xl backdrop-blur-md">
            <Layers className="size-20 text-blue-300 drop-shadow-2xl" />
          </div>
        )}
      </div>

      {/* 3. Bottom Controls & Progress */}
      <div className="mt-4 flex w-full flex-col gap-3 border-t border-white/20 pt-4">
        {advanceMode === "auto" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-white/70">
              <span>{remainingSeconds}s remaining</span>
              <span>{Math.round(progressRatio * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full bg-primary transition-all duration-100 ease-linear"
                style={{ width: `${progressRatio * 100}%` }}
                data-testid="scene-progress-bar"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-white/60">
            {advanceMode === "auto" ? "Automatic progression" : "Awaiting host to advance"}
          </p>

          {isManager && (
            <button
              type="button"
              onClick={handleSkipClick}
              disabled={skipState.hasSkipped}
              className={clsx(
                "rounded-xl px-5 py-2.5 text-sm font-bold shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                skipState.hasSkipped
                  ? "cursor-not-allowed bg-white/10 text-white/40"
                  : "bg-primary text-white hover:opacity-90 active:scale-95",
              )}
              data-testid="scene-skip-button"
            >
              {skipState.hasSkipped ? "Skipped" : "Advance Scene"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
