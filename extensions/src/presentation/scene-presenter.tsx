import type {
  ActiveSceneData,
  SceneConfig,
} from "../core/studio-timeline-schema"
import {
  resolveCardStageAnimations,
  type CardStageAnimations,
  type StageAnimationSlot,
} from "../core/card-appearance"
import type { AuthoritativeStepEnvelope } from "../server/game/studio-show-coordinator"
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react"
import {
  CANONICAL_ANSWER_COLORS,
  computePollRanking,
  type PollOptionItem,
} from "./poll-ranking"
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
  epoch?: number | string
  isManager?: boolean
  onAdvance?: () => void
  onSkip?: () => void
  className?: string
}

const buildSceneSlotStyle = (
  slot: StageAnimationSlot | undefined,
  index = 0,
  extra?: CSSProperties,
): CSSProperties => {
  if (!slot || slot.preset === "none") {
    return extra ?? {}
  }
  const delayMs =
    slot.timing === "sequential" ? index * (slot.staggerMs ?? 90) : 0
  return {
    ...extra,
    animationDuration: `${slot.durationMs ?? 800}ms`,
    animationDelay: `${delayMs}ms`,
    animationFillMode: "both",
  }
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
  epoch,
  isManager = false,
  onAdvance: _onAdvance,
  onSkip,
  className,
}: ScenePresenterProps) => {
  const activeScene = scene ?? step?.scene
  const kind = activeScene?.kind ?? step?.kind ?? "transition"

  const stageAnimations = useMemo(
    () =>
      resolveCardStageAnimations({
        stageAnimations:
          activeScene && "stageAnimations" in activeScene
            ? (activeScene.stageAnimations as CardStageAnimations | undefined)
            : undefined,
      }),
    [activeScene],
  )

  const sceneAnimationKey = `${activeScene?.id ?? kind}-${epoch ?? serverStartedAt ?? "static"}`
  const containerPreset = stageAnimations.questionEntrance.preset
  const resultsSlot = stageAnimations.resultsRevealEntrance
  const badgeSlot = stageAnimations.answerBadgeEntrance

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
      key={sceneAnimationKey}
      className={clsx(
        "relative flex min-h-0 max-h-full w-full max-w-6xl flex-1 flex-col items-center justify-between overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-black/60 p-3 sm:p-6 md:p-8 text-center text-white shadow-2xl backdrop-blur-xl",
        containerPreset !== "none" && `tada-entrance-${containerPreset}`,
        className,
      )}
      style={buildSceneSlotStyle(stageAnimations.questionEntrance, 0)}
      data-tada-entrance={containerPreset !== "none" ? containerPreset : undefined}
      data-testid="studio-scene-presenter"
      data-kind={kind}
      data-remaining={remainingSeconds}
    >
      {/* 1. Header / Title */}
      <div className="w-full shrink-0">
        {kind === "opening" && (
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Sparkles className="size-3.5 sm:size-4 text-primary" />
              <span>{getKindLabel("opening", "Show Opening")}</span>
            </div>
            <h1 className="mt-1 sm:mt-2 text-2xl font-black tracking-tight text-white drop-shadow-2xl sm:text-4xl md:text-5xl line-clamp-2">
              {"title" in (activeScene ?? {}) ? (activeScene as { title: string }).title : "Welcome to the Show"}
            </h1>
            {"subtitle" in (activeScene ?? {}) && (activeScene as { subtitle?: string }).subtitle && (
              <p className="max-w-2xl text-sm sm:text-lg font-medium text-white/80 line-clamp-2">
                {(activeScene as { subtitle?: string }).subtitle}
              </p>
            )}
          </div>
        )}

        {kind === "closing" && (
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Award className="size-3.5 sm:size-4 text-primary" />
              <span>{getKindLabel("closing", "Show Closing")}</span>
            </div>
            <h1 className="mt-1 sm:mt-2 text-2xl font-black tracking-tight text-white drop-shadow-2xl sm:text-4xl md:text-5xl line-clamp-2">
              {"title" in (activeScene ?? {}) ? (activeScene as { title: string }).title : "Thank You For Playing"}
            </h1>
            {"subtitle" in (activeScene ?? {}) && (activeScene as { subtitle?: string }).subtitle && (
              <p className="max-w-2xl text-sm sm:text-lg font-medium text-white/80 line-clamp-2">
                {(activeScene as { subtitle?: string }).subtitle}
              </p>
            )}
          </div>
        )}

        {kind === "transition" && (
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Layers className="size-3.5 sm:size-4 text-primary" />
              <span>{getKindLabel("transition", "Transition")}</span>
            </div>
            <h2 className="mt-1 sm:mt-2 text-xl font-black tracking-tight text-white drop-shadow-2xl sm:text-3xl md:text-4xl line-clamp-2">
              {"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Next Up" : "Next Up"}
            </h2>
            {"description" in (activeScene ?? {}) && (activeScene as { description?: string }).description && (
              <p className="max-w-2xl text-sm sm:text-base font-medium text-white/80 line-clamp-2">
                {(activeScene as { description?: string }).description}
              </p>
            )}
          </div>
        )}

        {kind === "leaderboard" && (
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Trophy className="size-3.5 sm:size-4 text-primary" />
              <span>{getKindLabel("leaderboard", "Leaderboard")}</span>
            </div>
            <h2 className="mt-1 sm:mt-2 text-xl font-black tracking-tight text-white drop-shadow-2xl sm:text-3xl md:text-4xl line-clamp-2">
              {"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Leaderboard Standings" : "Leaderboard Standings"}
            </h2>
          </div>
        )}

        {kind === "interimResults" && (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-0.5 sm:px-4 sm:py-1 text-xs sm:text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <BarChart3 className="size-3.5 sm:size-4 text-primary" />
              <span>{getKindLabel("interimResults", "Interim Results")}</span>
            </div>
            <h2 className="mt-0.5 sm:mt-1 text-lg font-black tracking-tight text-white drop-shadow-2xl sm:text-2xl md:text-3xl line-clamp-1">
              {"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Audience Poll Results" : "Audience Poll Results"}
            </h2>
          </div>
        )}

        {kind === "animation" && (
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Sparkles className="size-3.5 sm:size-4 text-primary" />
              <span>{getKindLabel("animation", "Animation")}</span>
            </div>
            <h2 className="mt-1 sm:mt-2 text-xl font-black tracking-tight text-white drop-shadow-2xl sm:text-3xl md:text-4xl line-clamp-2">
              {"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Get Ready" : "Get Ready"}
            </h2>
          </div>
        )}

        {kind === "media" && (
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Film className="size-3.5 sm:size-4 text-primary" />
              <span>{getKindLabel("media", "Media Spotlight")}</span>
            </div>
            {"title" in (activeScene ?? {}) && (activeScene as { title?: string }).title && (
              <h2 className="mt-1 sm:mt-2 text-xl font-black tracking-tight text-white drop-shadow-2xl sm:text-3xl md:text-4xl line-clamp-2">
                {(activeScene as { title?: string }).title}
              </h2>
            )}
          </div>
        )}

        {kind === "countdown" && (
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-bold text-white shadow-xs backdrop-blur-md">
              <Clock className="size-3.5 sm:size-4 text-primary" />
              <span>{getKindLabel("countdown", "Countdown")}</span>
            </div>
            {"title" in (activeScene ?? {}) && (activeScene as { title?: string }).title && (
              <h2 className="mt-1 sm:mt-2 text-xl font-black tracking-tight text-white drop-shadow-2xl sm:text-3xl md:text-4xl line-clamp-2">
                {(activeScene as { title?: string }).title}
              </h2>
            )}
          </div>
        )}
      </div>

      {/* 2. Central Visual Body */}
      <div className="my-2 sm:my-3 flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden">
        {labels?.sampleDataNotice && (
          <span className="mb-1.5 shrink-0 rounded-full border border-primary/40 bg-primary/20 px-3 py-0.5 text-xs font-semibold text-primary">
            {labels.sampleDataNotice}
          </span>
        )}

        {kind === "countdown" && (
          <div className="relative flex items-center justify-center">
            <div
              className="flex size-32 sm:size-44 md:size-56 items-center justify-center rounded-full border-8 border-primary/60 bg-black/60 text-6xl font-black tabular-nums text-white shadow-2xl backdrop-blur-md transition-transform duration-200 sm:text-7xl md:text-8xl"
              data-testid="scene-countdown-circle"
            >
              {remainingSeconds}
            </div>
          </div>
        )}

        {kind === "animation" && (
          <div className="relative flex size-32 sm:size-40 md:size-48 items-center justify-center rounded-full border-4 border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md">
            <Sparkles className="size-16 sm:size-20 animate-pulse text-primary drop-shadow-2xl" />
          </div>
        )}

        {/* Real Live Leaderboard */}
        {kind === "leaderboard" && (
          <div className="flex min-h-0 w-full max-w-xl flex-col items-center justify-center gap-2 overflow-hidden">
            {leaderboardEntries.length > 0 ? (
              <div className="w-full rounded-2xl border border-white/10 bg-black/50 p-2.5 sm:p-4 shadow-2xl backdrop-blur-md">
                <ol className="divide-y divide-white/10">
                  {leaderboardEntries.slice(0, 6).map((entry, idx) => (
                    <li
                      key={entry.displayName}
                      className={clsx(
                        "flex items-center justify-between py-1.5 sm:py-2 px-2 sm:px-3",
                        resultsSlot.preset !== "none" &&
                          `tada-entrance-${resultsSlot.preset}`,
                      )}
                      style={buildSceneSlotStyle(resultsSlot, idx)}
                      data-tada-entrance={
                        resultsSlot.preset !== "none"
                          ? resultsSlot.preset
                          : undefined
                      }
                      data-testid="leaderboard-scene-row"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={clsx(
                            "flex size-6 sm:size-7 items-center justify-center rounded-full text-xs font-black",
                            getRankBadgeClass(entry.rank),
                          )}
                        >
                          {entry.rank}
                        </span>
                        <span className="text-sm sm:text-base font-bold text-white truncate max-w-[180px] sm:max-w-[260px]">
                          {entry.displayName}
                        </span>
                      </div>
                      <span className="font-mono text-sm sm:text-base font-extrabold text-primary">
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
          <div className="flex min-h-0 w-full max-w-5xl flex-1 flex-col items-center justify-center gap-2 overflow-hidden">
            {interimResults ? (
              (() => {
                const pollOptions: PollOptionItem[] = interimResults.options.map(
                  (opt, i) => ({
                    answerIndex:
                      opt.answerIndex !== undefined ? opt.answerIndex : i,
                    label: opt.label,
                    count: opt.count ?? 0,
                    percentage: opt.percentage ?? 0,
                    imageUrl: opt.imageUrl,
                    alt: opt.alt,
                  }),
                )

                const ranking = computePollRanking(pollOptions)
                const { isZeroVotes, isTie, winners, runnersUp, allSorted } =
                  ranking

                const getCardColor = (idx: number) =>
                  CANONICAL_ANSWER_COLORS[idx] ?? "#334155"

                return (
                  <div className="flex min-h-0 w-full flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-black/60 p-2.5 sm:p-4 shadow-2xl backdrop-blur-md">
                    <p className="mb-1 sm:mb-2 text-center text-base font-black text-white sm:text-xl md:text-2xl line-clamp-1">
                      {interimResults.questionText}
                    </p>

                    {/* Winner / Tie / No Votes Status Banner */}
                    {isZeroVotes ? (
                      <div
                        data-testid="no-votes-message"
                        className="my-1 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-center text-xs sm:text-sm font-semibold text-white/70"
                      >
                        No votes yet
                      </div>
                    ) : isTie ? (
                      <div
                        data-testid="spotlight-tie"
                        className="my-1 flex items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-1"
                      >
                        <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300 truncate">
                          Tie / Co-leaders ({winners.map((o) => o.label).join(", ")})
                        </span>
                      </div>
                    ) : (
                      <div
                        data-testid="spotlight-winner"
                        className="my-1 flex items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 py-1"
                      >
                        <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-amber-300 truncate">
                          Leading Choice: {winners[0]?.label}
                        </span>
                      </div>
                    )}

                    {/* Results Composition: Dominant Hero + Ranked Runners-up */}
                    {!isZeroVotes ? (
                      <div className="flex min-h-0 flex-col items-center justify-center w-full my-1.5 overflow-hidden">
                        {/* Dominant Centered Hero Winner(s) */}
                        <div
                          data-testid="results-hero-section"
                          className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 w-full max-w-4xl mb-2"
                        >
                          {winners.map((winner, wIdx) => {
                            const index = winner.answerIndex
                            const cardBg = getCardColor(index)

                            return (
                              <div
                                key={`interim-winner-${index}`}
                                data-testid="interim-option-row"
                                data-winner="true"
                                data-tada-entrance={
                                  resultsSlot.preset !== "none"
                                    ? resultsSlot.preset
                                    : undefined
                                }
                                style={buildSceneSlotStyle(resultsSlot, wIdx, {
                                  backgroundColor: cardBg,
                                })}
                                className={clsx(
                                  "relative flex flex-col items-center justify-between overflow-hidden rounded-xl sm:rounded-2xl border-2 border-amber-300 ring-2 sm:ring-4 ring-amber-400 p-2 sm:p-3 text-center shadow-2xl shadow-amber-500/30 transition-all duration-500",
                                  resultsSlot.preset !== "none" &&
                                    `tada-entrance-${resultsSlot.preset}`,
                                  winners.length === 1
                                    ? "w-full max-w-xs sm:max-w-sm md:max-w-md"
                                    : "w-[calc(50%-0.5rem)] max-w-xs sm:max-w-sm",
                                )}
                              >
                                <div className="flex w-full items-center justify-between gap-1.5 mb-1 z-10">
                                  <span
                                    className={clsx(
                                      "flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg bg-black/35 text-white font-black text-xs sm:text-sm border border-white/25 shadow-md",
                                      badgeSlot.preset !== "none" &&
                                        `tada-entrance-${badgeSlot.preset}`,
                                    )}
                                    style={buildSceneSlotStyle(badgeSlot, wIdx)}
                                  >
                                    {index + 1}
                                  </span>

                                  <span className="flex items-center gap-1 rounded-full bg-amber-400 px-2 sm:px-3 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-wider text-black shadow-lg">
                                    <Trophy className="size-3.5 sm:size-4 fill-black" />
                                    <span>{isTie ? "Co-leader" : "Leader"}</span>
                                  </span>

                                  <div className="flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[10px] sm:text-xs font-mono font-bold text-white shadow-md">
                                    <span>{winner.percentage}%</span>
                                    <span className="text-white/80">
                                      ({winner.count} {winner.count === 1 ? "vote" : "votes"})
                                    </span>
                                  </div>
                                </div>

                                <div
                                  className="relative flex w-full items-center justify-center overflow-hidden rounded-lg sm:rounded-xl border border-black/20 shadow-inner"
                                  style={{
                                    backgroundColor: cardBg,
                                    height: "clamp(48px, 14vh, 140px)",
                                    maxHeight: "clamp(48px, 14vh, 140px)",
                                  }}
                                >
                                  {winner.imageUrl && (
                                    <img
                                      src={winner.imageUrl}
                                      alt={winner.alt || winner.label}
                                      data-testid="winner-image"
                                      className="h-full w-full object-contain p-1 rounded-lg"
                                      loading="lazy"
                                    />
                                  )}

                                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-1 text-center">
                                    <div className="flex items-baseline justify-center gap-1.5 text-white">
                                      <span className="text-base sm:text-xl font-black drop-shadow-md">
                                        {winner.percentage}%
                                      </span>
                                      <span className="text-[10px] sm:text-xs font-semibold text-white/90">
                                        ({winner.count} {winner.count === 1 ? "vote" : "votes"})
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <span
                                  data-testid="winner-caption"
                                  className="mt-1 w-full text-center font-black text-white text-xs sm:text-sm md:text-base line-clamp-1 drop-shadow-md"
                                >
                                  {winner.label}
                                </span>

                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
                                  <div
                                    className="h-full rounded-full bg-amber-400 transition-all duration-700 ease-out"
                                    style={{
                                      width: `${Math.min(100, Math.max(0, winner.percentage))}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Runners-up below sorted descending */}
                        {runnersUp.length > 0 && (
                          <div
                            data-testid="results-runners-up-section"
                            className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2.5 w-full max-w-4xl"
                          >
                            {runnersUp.map((runner, rIdx) => {
                              const index = runner.answerIndex
                              const cardBg = getCardColor(index)
                              const orderIdx = winners.length + rIdx

                              return (
                                <div
                                  key={`interim-runner-${index}`}
                                  data-testid="interim-option-row"
                                  data-winner="false"
                                  data-tada-entrance={
                                    resultsSlot.preset !== "none"
                                      ? resultsSlot.preset
                                      : undefined
                                  }
                                  style={buildSceneSlotStyle(resultsSlot, orderIdx, {
                                    backgroundColor: cardBg,
                                  })}
                                  className={clsx(
                                    "relative flex flex-col items-center justify-between overflow-hidden rounded-lg sm:rounded-xl border border-black/20 p-1.5 sm:p-2 text-center shadow-lg opacity-95 transition-all duration-300",
                                    resultsSlot.preset !== "none" &&
                                      `tada-entrance-${resultsSlot.preset}`,
                                  )}
                                >
                                  <div className="flex w-full items-center justify-between gap-1 mb-0.5 z-10">
                                    <span
                                      className={clsx(
                                        "flex size-5 sm:size-6 shrink-0 items-center justify-center rounded-md bg-black/35 text-white font-black text-[10px] sm:text-xs border border-white/20 shadow-md",
                                        badgeSlot.preset !== "none" &&
                                          `tada-entrance-${badgeSlot.preset}`,
                                      )}
                                      style={buildSceneSlotStyle(badgeSlot, orderIdx)}
                                    >
                                      {index + 1}
                                    </span>
                                    <span className="text-[10px] font-mono font-bold text-white bg-black/35 px-1.5 py-0.5 rounded-full">
                                      {runner.count} {runner.count === 1 ? "vote" : "votes"}
                                    </span>
                                  </div>

                                  <div
                                    className="relative flex w-full items-center justify-center overflow-hidden rounded-md sm:rounded-lg border border-black/15 shadow-inner"
                                    style={{
                                      backgroundColor: cardBg,
                                      height: "clamp(36px, 9vh, 80px)",
                                      maxHeight: "clamp(36px, 9vh, 80px)",
                                    }}
                                  >
                                    {runner.imageUrl && (
                                      <img
                                        src={runner.imageUrl}
                                        alt={runner.alt || runner.label}
                                        className="h-full w-full object-contain p-0.5 rounded-md"
                                        loading="lazy"
                                      />
                                    )}
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-0.5 text-center">
                                      <span className="text-xs sm:text-sm font-black text-white drop-shadow-md">
                                        {runner.percentage}%
                                      </span>
                                    </div>
                                  </div>

                                  <span className="mt-1 w-full text-center font-bold text-white text-[11px] sm:text-xs wrap-break-word drop-shadow-md line-clamp-1">
                                    {runner.label}
                                  </span>

                                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/20">
                                    <div
                                      className="h-full rounded-full bg-white transition-all duration-700 ease-out"
                                      style={{
                                        width: `${Math.min(100, Math.max(0, runner.percentage))}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Zero votes unranked peer grid */
                      <div className="grid w-full grid-cols-6 gap-2 sm:gap-3 my-1.5">
                        {allSorted.map((opt, i) => {
                          const index = opt.answerIndex
                          const count = allSorted.length
                          let colClass = "col-span-3 sm:col-span-3"
                          if (count === 5) {
                            if (i === 0) colClass = "col-span-3 sm:col-span-2 sm:col-start-1"
                            else if (i === 1) colClass = "col-span-3 sm:col-span-2 sm:col-start-3"
                            else if (i === 2) colClass = "col-span-3 sm:col-span-2 sm:col-start-5"
                            else if (i === 3) colClass = "col-span-3 sm:col-span-2 sm:col-start-2"
                            else if (i === 4) colClass = "col-span-6 sm:col-span-2 sm:col-start-4"
                          } else if (count === 3) {
                            colClass = i === 2 ? "col-span-6 sm:col-span-2" : "col-span-3 sm:col-span-2"
                          }
                          const cardBg = getCardColor(index)

                          return (
                            <div
                              key={opt.label || i}
                              data-testid="interim-option-row"
                              data-winner="false"
                              data-tada-entrance={
                                resultsSlot.preset !== "none"
                                  ? resultsSlot.preset
                                  : undefined
                              }
                              style={buildSceneSlotStyle(resultsSlot, i, {
                                backgroundColor: cardBg,
                              })}
                              className={clsx(
                                "flex flex-col items-center justify-between rounded-xl border border-black/20 p-2 text-center shadow-lg transition-all duration-300",
                                resultsSlot.preset !== "none" &&
                                  `tada-entrance-${resultsSlot.preset}`,
                                colClass,
                              )}
                            >
                              <div className="flex w-full items-center justify-between mb-1">
                                <span className="flex size-5 items-center justify-center rounded-md bg-black/35 text-xs font-black text-white border border-white/20">
                                  {index + 1}
                                </span>
                              </div>

                              <div
                                className="relative flex aspect-square w-full max-h-[12vh] sm:max-h-[16vh] items-center justify-center overflow-hidden rounded-lg border border-black/15 shadow-inner"
                                style={{ backgroundColor: cardBg }}
                              >
                                {opt.imageUrl && (
                                  <img
                                    src={opt.imageUrl}
                                    alt={opt.alt || opt.label}
                                    className="h-full w-full object-contain p-1 rounded-lg"
                                    loading="lazy"
                                  />
                                )}
                              </div>

                              <span className="mt-1 w-full text-center font-bold text-white text-xs sm:text-sm line-clamp-1 drop-shadow-md">
                                {opt.label}
                              </span>

                              <div className="mt-0.5 flex items-center justify-center gap-1 text-[10px] font-mono font-bold text-white/90">
                                <span>0 votes</span>
                                <span>(0%)</span>
                              </div>

                              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/20">
                                <div className="h-full rounded-full bg-white" style={{ width: "0%" }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="mt-1.5 flex justify-between border-t border-white/10 pt-1.5 text-[11px] text-white/60">
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
                  className="flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-black/40 p-6 sm:p-10 text-muted-foreground shadow-2xl"
                  data-testid="scene-media-placeholder"
                >
                  <AlertTriangle className="size-10 sm:size-14 text-yellow-400" />
                  <p className="mt-2 text-sm sm:text-base font-semibold text-white/80">
                    {mediaError
                      ? labels?.imageError ?? "Failed to load media asset"
                      : labels?.noMedia ?? "No media asset configured"}
                  </p>
                </div>
              )
            }

            if (mediaType === "video") {
              return (
                <div className="relative max-h-[38vh] sm:max-h-[45vh] max-w-[85vw] overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
                  <video
                    ref={videoRef}
                    src={mediaUrl}
                    autoPlay
                    controls
                    playsInline
                    onError={() => setMediaError(true)}
                    className="max-h-[38vh] sm:max-h-[45vh] w-auto max-w-[85vw] rounded-2xl shadow-2xl"
                    data-testid="scene-video"
                  />
                </div>
              )
            }

            return (
              <div className="relative max-h-[38vh] sm:max-h-[45vh] max-w-[85vw] overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
                <img
                  src={mediaUrl}
                  alt={"title" in (activeScene ?? {}) ? (activeScene as { title?: string }).title ?? "Scene media" : "Scene media"}
                  onError={() => setMediaError(true)}
                  className="max-h-[38vh] sm:max-h-[45vh] w-auto max-w-[85vw] rounded-2xl object-contain shadow-2xl"
                  data-testid="scene-image"
                />
              </div>
            )
          })()
        )}

        {kind === "transition" && !("mediaUrl" in (activeScene ?? {})) && (
          <div className="flex size-28 sm:size-36 items-center justify-center rounded-full border-4 border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md">
            <Layers className="size-14 sm:size-16 text-primary drop-shadow-2xl" />
          </div>
        )}
      </div>

      {/* 3. Bottom Controls & Progress */}
      <div className="mt-2 flex w-full shrink-0 flex-col gap-2 border-t border-white/20 pt-2.5 sm:pt-3">
        {advanceMode === "auto" && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs font-semibold text-white/70">
              <span>{remainingSeconds}s</span>
              <span>{Math.round(progressRatio * 100)}%</span>
            </div>
            <div className="h-1.5 sm:h-2 w-full overflow-hidden rounded-full bg-white/20">
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
                "rounded-xl px-4 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-sm font-bold shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
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
