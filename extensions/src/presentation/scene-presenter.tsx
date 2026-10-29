import type {
  ActiveSceneData,
  SceneConfig,
} from "../core/studio-timeline-schema"
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

export interface ScenePresenterLabels {
  kinds?: Partial<Record<string, string>>
  autoProgression?: string
  awaitingHost?: string
  advanceScene?: string
  skipped?: string
  videoError?: string
  imageError?: string
  noMedia?: string
  points?: string
  noScores?: string
  noInterimResults?: string
  totalResponders?: (count: number) => string
  sampleDataNotice?: string
  rankLabel?: string
  scoreLabel?: string
  noRankingsYet?: string
  noResponsesYet?: string
  votesSuffix?: string
  advanceButtonLabel?: string
  intermissionDefaultTitle?: string
  intermissionDefaultSubtitle?: string
  leaderboardDefaultTitle?: string
  leaderboardDefaultSubtitle?: string
  interimResultsDefaultTitle?: string
  interimResultsDefaultSubtitle?: string
}

const getRankBadgeClass = (rank: number): string => {
  if (rank === 1) {
    return "bg-amber-400 text-black"
  }

  if (rank === 2) {
    return "bg-slate-300 text-black"
  }

  if (rank === 3) {
    return "bg-amber-700 text-white"
  }

  return "bg-white/10 text-white/80"
}

export interface ScenePresenterProps {
  step?: AuthoritativeStepEnvelope | null
  scene?: SceneConfig
  activeSceneData?: ActiveSceneData | null
  labels?: ScenePresenterLabels
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
  activeSceneData,
  labels,
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

  const leaderboardEntries = activeSceneData?.leaderboard?.entries ?? []
  const interimResults = activeSceneData?.interimResults

  const getKindLabel = (k: string, defaultLabel: string): string =>
    labels?.kinds?.[k] ?? defaultLabel

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
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Sparkles className="size-4 text-primary" />
              <span>{getKindLabel("opening", "Show Opening")}</span>
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
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Award className="size-4 text-primary" />
              <span>{getKindLabel("closing", "Show Closing")}</span>
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
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Layers className="size-4 text-primary" />
              <span>{getKindLabel("transition", "Transition")}</span>
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
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Trophy className="size-4 text-primary" />
              <span>{getKindLabel("leaderboard", "Leaderboard")}</span>
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white drop-shadow-2xl sm:text-5xl">
              {"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Leaderboard Standings" : "Leaderboard Standings"}
            </h2>
          </div>
        )}

        {kind === "interimResults" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <BarChart3 className="size-4 text-primary" />
              <span>{getKindLabel("interimResults", "Interim Results")}</span>
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white drop-shadow-2xl sm:text-5xl">
              {"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Audience Poll Results" : "Audience Poll Results"}
            </h2>
          </div>
        )}

        {kind === "animation" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Sparkles className="size-4 text-primary" />
              <span>{getKindLabel("animation", "Animation")}</span>
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white drop-shadow-2xl sm:text-5xl">
              {"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Get Ready" : "Get Ready"}
            </h2>
          </div>
        )}

        {kind === "media" && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Film className="size-4 text-primary" />
              <span>{getKindLabel("media", "Media Spotlight")}</span>
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
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Clock className="size-4 text-primary" />
              <span>{getKindLabel("countdown", "Countdown")}</span>
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
        {labels?.sampleDataNotice && (
          <span className="mb-3 rounded-full border border-primary/40 bg-primary/20 px-3 py-0.5 text-xs font-semibold text-primary">
            {labels.sampleDataNotice}
          </span>
        )}

        {kind === "countdown" && (
          <div className="relative flex items-center justify-center">
            <div
              className="flex size-48 items-center justify-center rounded-full border-8 border-primary/60 bg-black/60 text-8xl font-black tabular-nums text-white shadow-2xl backdrop-blur-md transition-transform duration-200 sm:size-64 sm:text-9xl"
              data-testid="scene-countdown-circle"
            >
              {remainingSeconds}
            </div>
          </div>
        )}

        {kind === "animation" && (
          <div className="relative flex size-44 items-center justify-center rounded-full border-4 border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-md sm:size-56">
            <Sparkles className="size-24 animate-pulse text-primary drop-shadow-2xl" />
          </div>
        )}

        {/* Real Live Leaderboard */}
        {kind === "leaderboard" && (
          <div className="flex w-full max-w-xl flex-col items-center gap-4">
            {leaderboardEntries.length > 0 ? (
              <div className="w-full rounded-2xl border border-white/10 bg-black/50 p-4 shadow-2xl backdrop-blur-md">
                <ol className="divide-y divide-white/10">
                  {leaderboardEntries.map((entry) => (
                    <li
                      key={entry.displayName}
                      className="flex items-center justify-between py-3 px-3"
                      data-testid="leaderboard-scene-row"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={clsx(
                            "flex size-7 items-center justify-center rounded-full text-xs font-black",
                            getRankBadgeClass(entry.rank),
                          )}
                        >
                          {entry.rank}
                        </span>
                        <span className="text-base font-bold text-white">
                          {entry.displayName}
                        </span>
                      </div>
                      <span className="font-mono text-base font-extrabold text-primary">
                        {entry.points} {labels?.points ?? "pts"}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/40 px-6 py-4 text-sm text-white/70">
                {labels?.noScores ?? "No scores recorded yet."}
              </div>
            )}
          </div>
        )}

        {/* Real Live Interim Results */}
        {kind === "interimResults" && (
          <div className="flex w-full max-w-2xl flex-col items-center gap-4">
            {interimResults ? (
              (() => {
                const winnerIndices = interimResults.winners ?? []
                const winnerOptions = winnerIndices
                  .map((idx) => interimResults.options[idx])
                  .filter(Boolean)
                const isZeroVotes =
                  interimResults.totalResponders === 0 ||
                  winnerOptions.length === 0
                const isTie =
                  !isZeroVotes &&
                  (interimResults.isTie ?? winnerOptions.length > 1)

                return (
                  <div className="w-full rounded-2xl border border-white/10 bg-black/60 p-6 shadow-2xl backdrop-blur-md">
                    <p className="mb-4 text-center text-xl font-black text-white md:text-2xl">
                      {interimResults.questionText}
                    </p>

                    {/* Winner / Tie / No Votes Spotlight */}
                    {isZeroVotes ? (
                      <div
                        data-testid="no-votes-message"
                        className="my-4 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center text-sm font-semibold text-white/70"
                      >
                        No votes yet
                      </div>
                    ) : isTie ? (
                      <div
                        data-testid="spotlight-tie"
                        className="my-4 flex flex-col items-center gap-3 rounded-2xl border-2 border-primary/40 bg-primary/10 p-4"
                      >
                        <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                          Tie / Co-leaders
                        </span>
                        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
                          {winnerOptions.map((opt, wIdx) => (
                            <div
                              key={wIdx}
                              className="flex flex-col items-center gap-2 rounded-xl bg-black/30 p-3"
                              data-testid="tied-winner-item"
                            >
                              {opt.imageUrl && (
                                <img
                                  src={opt.imageUrl}
                                  alt={opt.alt || opt.label}
                                  data-testid="winner-image"
                                  className="max-h-40 w-auto rounded-lg object-contain shadow-md"
                                  loading="lazy"
                                />
                              )}
                              <span
                                data-testid="winner-caption"
                                className="text-center font-bold text-white text-base"
                              >
                                {opt.label}
                              </span>
                              <span className="font-mono text-sm font-bold text-primary">
                                {opt.count} votes ({opt.percentage}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div
                        data-testid="spotlight-winner"
                        className="my-4 flex flex-col items-center gap-3 rounded-2xl border-2 border-primary/50 bg-primary/10 p-5 shadow-lg"
                      >
                        <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary">
                          Leading Choice
                        </span>
                        {winnerOptions[0]?.imageUrl && (
                          <img
                            src={winnerOptions[0].imageUrl}
                            alt={
                              winnerOptions[0].alt || winnerOptions[0].label
                            }
                            data-testid="winner-image"
                            className="max-h-52 w-auto rounded-xl object-contain shadow-lg border border-white/20"
                            loading="lazy"
                          />
                        )}
                        <span
                          data-testid="winner-caption"
                          className="text-center text-xl font-black text-white"
                        >
                          {winnerOptions[0]?.label}
                        </span>
                        <span className="font-mono text-sm font-bold text-primary">
                          {winnerOptions[0]?.count} votes (
                          {winnerOptions[0]?.percentage}%)
                        </span>
                      </div>
                    )}

                    {/* Breakdown by option */}
                    <div className="mt-4 flex flex-col gap-3">
                      {interimResults.options.map((opt, i) => (
                        <div
                          key={opt.label || i}
                          className="flex flex-col gap-1 text-left"
                          data-testid="interim-option-row"
                        >
                          <div className="flex items-center justify-between text-sm font-semibold text-white/90">
                            <span className="flex items-center gap-2">
                              {opt.imageUrl && (
                                <img
                                  src={opt.imageUrl}
                                  alt=""
                                  className="size-5 rounded object-cover"
                                />
                              )}
                              <span>{opt.label}</span>
                            </span>
                            <span className="font-mono font-bold text-primary">
                              {opt.count} ({opt.percentage}%)
                            </span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{
                                width: `${Math.min(100, Math.max(0, opt.percentage))}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex justify-between border-t border-white/10 pt-3 text-xs text-white/60">
                      <span data-testid="total-votes">
                        {labels?.totalResponders
                          ? labels.totalResponders(interimResults.totalResponders)
                          : `Total votes: ${interimResults.totalResponders}`}
                      </span>
                    </div>
                  </div>
                )
              })()
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/40 px-6 py-4 text-sm text-white/70">
                {labels?.noInterimResults ?? "No completed results yet."}
              </div>
            )}
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
                    {mediaError
                      ? labels?.imageError ?? "Failed to load media asset"
                      : labels?.noMedia ?? "No media asset configured"}
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
          <div className="flex size-40 items-center justify-center rounded-full border-4 border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-md">
            <Layers className="size-20 text-primary drop-shadow-2xl" />
          </div>
        )}
      </div>

      {/* 3. Bottom Controls & Progress */}
      <div className="mt-4 flex w-full flex-col gap-3 border-t border-white/20 pt-4">
        {advanceMode === "auto" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-white/70">
              <span>{remainingSeconds}s</span>
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
            {advanceMode === "auto"
              ? labels?.autoProgression ?? "Automatic progression"
              : labels?.awaitingHost ?? "Awaiting host to advance"}
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
              {skipState.hasSkipped
                ? labels?.skipped ?? "Skipped"
                : labels?.advanceScene ?? "Advance Scene"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
