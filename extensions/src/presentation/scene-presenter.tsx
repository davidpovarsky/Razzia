// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import { PlatformButton } from "./platform-controls"
import type {
  ActiveSceneData,
  SceneConfig,
} from "../core/studio-timeline-schema"
import {
  resolveCardStageAnimations,
  type CardStageAnimations,
  type StageAnimationSlot,
} from "../core/card-appearance"
import {
  resolveSceneOverlayAnimations,
  type CinematicOverlayAnimation,
} from "../core/cinematic-overlays"
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
import { useStageFit } from "./stage-fit"
import { LottiePlayer } from "./lottie-player"
import { CinematicLayerStack } from "./cinematic-layer-stack"
import { TadazzLeaderboard } from "./tadazz-leaderboard"
import {
  AlertTriangle,
  Award,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Film,
  Layers,
  ListChecks,
  Music,
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
  globalStageAnimations?: CardStageAnimations
  tadazzEnabled?: boolean
  labels?: ScenePresenterLabels
  serverStartedAt?: number
  epoch?: number | string
  isManager?: boolean
  onAdvance?: () => void
  onSkip?: () => void
  onMediaEnded?: () => void
  onOverlayCompleted?: (overlayId: string) => void
  inlineLottieMap?: Record<string, Record<string, unknown> | string>
  interactiveEditorMode?: boolean
  controlledTimeMs?: number
  controlledPaused?: boolean
  selectedOverlayId?: string | null
  onSelectOverlay?: (id: string | null) => void
  onUpdateOverlayPosition?: (
    id: string,
    pos: {
      x: number
      y: number
    },
  ) => void
  onVideoDurationDetected?: (durationMs: number) => void
  onClockTick?: (timeMs: number) => void
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
  globalStageAnimations,
  tadazzEnabled = false,
  labels,
  serverStartedAt,
  epoch,
  isManager = false,
  onAdvance: _onAdvance,
  onSkip,
  onMediaEnded,
  onOverlayCompleted,
  inlineLottieMap,
  interactiveEditorMode = false,
  controlledTimeMs,
  controlledPaused,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlayPosition,
  onVideoDurationDetected,
  onClockTick,
  className,
}: ScenePresenterProps) => {
  const activeScene = scene ?? step?.scene
  const kind = activeScene?.kind ?? step?.kind ?? "transition"
  const stageAnimations = useMemo(
    () =>
      resolveCardStageAnimations({
        stageAnimations:
          activeScene && "stageAnimations" in activeScene
            ? activeScene.stageAnimations
            : undefined,
        globalStageAnimations,
      }),
    [activeScene, globalStageAnimations],
  )
  const effectiveServerStartedAt = step?.startedAt ?? serverStartedAt
  const sceneAnimationKey = `${activeScene?.id ?? kind}-${epoch ?? effectiveServerStartedAt ?? "static"}`
  const containerPreset = stageAnimations.questionEntrance.preset
  const resultsSlot = stageAnimations.resultsRevealEntrance
  const badgeSlot = stageAnimations.answerBadgeEntrance
  const durationMs = useMemo(() => {
    if (
      activeScene &&
      "durationMs" in activeScene &&
      typeof activeScene.durationMs === "number"
    ) {
      return activeScene.durationMs
    }

    if (
      activeScene &&
      "durationSeconds" in activeScene &&
      typeof activeScene.durationSeconds === "number"
    ) {
      return activeScene.durationSeconds * 1000
    }

    return step?.durationMs ?? 5000
  }, [activeScene, step?.durationMs])
  const [skipState, setSkipState] = useState<InterludeSkipState>({
    hasSkipped: false,
  })
  const [mediaError, setMediaError] = useState(false)
  const [mediaFinished, setMediaFinished] = useState(false)
  const [recapPage, setRecapPage] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaEndFiredRef = useRef(false)
  useEffect(() => {
    setSkipState({
      hasSkipped: false,
    })
    setMediaError(false)
    setMediaFinished(false)
    setRecapPage(0)
    mediaEndFiredRef.current = false
  }, [effectiveServerStartedAt, activeScene?.id, epoch])
  const initialRemaining = useMemo(
    () => calculateInterludeRemainingMs(effectiveServerStartedAt, durationMs),
    [effectiveServerStartedAt, durationMs],
  )
  const [remainingMs, setRemainingMs] = useState(initialRemaining)
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = calculateInterludeRemainingMs(
        effectiveServerStartedAt,
        durationMs,
      )
      setRemainingMs(remaining)
    }, 100)

    return () => clearInterval(interval)
  }, [effectiveServerStartedAt, durationMs])

  // Stop video/audio media on unmount
  useEffect(() => {
    const videoEl = videoRef.current
    const audioEl = audioRef.current

    return () => {
      if (videoEl) {
        videoEl.pause()
        videoEl.removeAttribute("src")
        videoEl.load()
      }

      if (audioEl) {
        audioEl.pause()
        audioEl.removeAttribute("src")
        audioEl.load()
      }
    }
  }, [])

  // Sync volume on foreground video/audio element
  useEffect(() => {
    const vol =
      activeScene &&
      "volume" in activeScene &&
      typeof activeScene.volume === "number"
        ? Math.max(0, Math.min(1, activeScene.volume))
        : 1

    if (videoRef.current) {
      videoRef.current.volume = vol
    }

    if (audioRef.current) {
      audioRef.current.volume = vol
    }
  }, [activeScene])
  const handleSkipClick = () => {
    const { state: nextState, shouldEmitSkip } = processInterludeSkip(skipState)
    setSkipState(nextState)

    if (shouldEmitSkip) {
      onSkip?.()
    }
  }
  const {
    isCompact,
    isUltraCompact,
    isNarrowMobile,
    isPortrait,
    availableHeight,
  } = useStageFit()
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const progressRatio = Math.max(
    0,
    Math.min(1, remainingMs / (durationMs || 1)),
  )
  const advanceMode =
    (activeScene && "advance" in activeScene
      ? activeScene.advance
      : step?.advance) ?? "auto"
  const leaderboardEntries = activeSceneData?.leaderboard?.entries ?? []
  const interimResults = activeSceneData?.interimResults
  const answerRecap = activeSceneData?.answerRecap
  const isCinemaScene =
    ((kind === "opening" || kind === "closing") &&
      ((
        activeScene as
          | {
              stageLayout?: "cinema" | "card"
            }
          | undefined
      )?.stageLayout ?? "cinema") === "cinema") ||
    (kind === "media" &&
      (
        activeScene as
          | {
              stageLayout?: "cinema" | "card"
            }
          | undefined
      )?.stageLayout === "cinema")
  const endBehavior =
    (
      activeScene as
        | {
            endBehavior?: "holdFrame" | "advanceNext" | "fadeToTitle"
          }
        | undefined
    )?.endBehavior ?? "holdFrame"
  const isLoopingMedia = Boolean(
    activeScene &&
    "loop" in activeScene &&
    (
      activeScene as {
        loop?: boolean
      }
    ).loop === true,
  )
  const handleForegroundMediaEnded = () => {
    setMediaFinished(true)
    const shouldAdvanceOnEnd =
      advanceMode === "onMediaEnd" ||
      (advanceMode !== "manual" && endBehavior === "advanceNext")

    if (shouldAdvanceOnEnd && !isLoopingMedia && !mediaEndFiredRef.current) {
      mediaEndFiredRef.current = true
      onMediaEnded?.()
    }
  }

  // Pagination for answerRecap
  const recapItems = answerRecap?.items ?? []
  const configuredPerPage =
    answerRecap?.maxItemsPerPage ??
    (
      activeScene as
        | {
            maxItemsPerPage?: number
          }
        | undefined
    )?.maxItemsPerPage ??
    4
  const effectivePerPage = Math.max(
    1,
    Math.min(
      configuredPerPage,
      (() => {
        if (isUltraCompact || availableHeight <= 580) {
          return Math.min(configuredPerPage, 2)
        }

        if (isCompact || isPortrait || availableHeight <= 740) {
          return Math.min(configuredPerPage, 4)
        }

        return configuredPerPage
      })(),
    ),
  )
  const totalRecapPages = Math.max(
    1,
    Math.ceil(recapItems.length / effectivePerPage),
  )
  const clampedRecapPage = Math.min(recapPage, totalRecapPages - 1)
  const visibleRecapItems = recapItems.slice(
    clampedRecapPage * effectivePerPage,
    (clampedRecapPage + 1) * effectivePerPage,
  )
  useEffect(() => {
    if (kind !== "answerRecap" || totalRecapPages <= 1) {
      return
    }

    const pageDuration = Math.max(
      2000,
      Math.floor(durationMs / totalRecapPages),
    )
    const timer = setInterval(() => {
      setRecapPage((prev) => (prev + 1) % totalRecapPages)
    }, pageDuration)

    return () => clearInterval(timer)
  }, [kind, totalRecapPages, durationMs])
  const getKindLabel = (k: string, defaultLabel: string): string =>
    labels?.kinds?.[k] ?? defaultLabel
  const showHeaderOverlay =
    kind !== "opening" &&
    kind !== "closing" &&
    !(kind === "media" && isCinemaScene)
      ? true
      : ((
          activeScene as
            | {
                textOverlay?: boolean
              }
            | undefined
        )?.textOverlay ??
          true) ||
        (mediaFinished && endBehavior === "fadeToTitle")
  const logoPosition =
    (
      activeScene as
        | {
            logoPosition?: "top" | "center" | "bottom" | "hidden"
          }
        | undefined
    )?.logoPosition ?? "center"
  const renderCinemaNativeTitleSlot = () => {
    if (!showHeaderOverlay) {
      return null
    }

    const positionAlignClass = (() => {
      if (logoPosition === "top") {
        return "justify-start pt-4 sm:pt-8"
      }

      if (logoPosition === "bottom") {
        return "justify-end pb-4 sm:pb-8"
      }

      return "justify-center"
    })()

    if (kind === "opening") {
      return (
        <div
          data-testid="scene-opening-overlay"
          data-logo-position={logoPosition}
          className={clsx(
            "flex h-full w-full flex-col items-center gap-1 sm:gap-2",
            positionAlignClass,
          )}
        >
          {logoPosition !== "hidden" && (
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
              <Sparkles className="text-primary size-3.5 sm:size-4" />
              <span>{getKindLabel("opening", "Show Opening")}</span>
            </div>
          )}
          <h1 className="mt-1 line-clamp-2 text-2xl font-black tracking-tight text-white drop-shadow-2xl sm:mt-2 sm:text-4xl md:text-5xl">
            {"title" in (activeScene ?? {})
              ? (
                  activeScene as {
                    title: string
                  }
                ).title
              : "Welcome to the Show"}
          </h1>
          {"subtitle" in (activeScene ?? {}) &&
            (
              activeScene as {
                subtitle?: string
              }
            ).subtitle && (
              <p className="line-clamp-2 max-w-2xl text-sm font-medium text-white/80 sm:text-lg">
                {
                  (
                    activeScene as {
                      subtitle?: string
                    }
                  ).subtitle
                }
              </p>
            )}
        </div>
      )
    }

    if (kind === "closing") {
      return (
        <div
          data-testid="scene-closing-overlay"
          data-logo-position={logoPosition}
          className={clsx(
            "flex h-full w-full flex-col items-center gap-1 sm:gap-2",
            positionAlignClass,
          )}
        >
          {logoPosition !== "hidden" && (
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
              <Award className="text-primary size-3.5 sm:size-4" />
              <span>{getKindLabel("closing", "Show Closing")}</span>
            </div>
          )}
          <h1 className="mt-1 line-clamp-2 text-2xl font-black tracking-tight text-white drop-shadow-2xl sm:mt-2 sm:text-4xl md:text-5xl">
            {"title" in (activeScene ?? {})
              ? (
                  activeScene as {
                    title: string
                  }
                ).title
              : "Thank You For Playing"}
          </h1>
          {"subtitle" in (activeScene ?? {}) &&
            (
              activeScene as {
                subtitle?: string
              }
            ).subtitle && (
              <p className="line-clamp-2 max-w-2xl text-sm font-medium text-white/80 sm:text-lg">
                {
                  (
                    activeScene as {
                      subtitle?: string
                    }
                  ).subtitle
                }
              </p>
            )}
        </div>
      )
    }

    if (kind === "media") {
      return (
        <div
          data-testid="scene-media-cinema-overlay"
          className="flex flex-col items-center gap-1 sm:gap-2"
        >
          <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
            <Film className="text-primary size-3.5 sm:size-4" />
            <span>{getKindLabel("media", "Media Spotlight")}</span>
          </div>
          {"title" in (activeScene ?? {}) &&
            (
              activeScene as {
                title?: string
              }
            ).title && (
              <h2 className="mt-1 line-clamp-2 text-xl font-black tracking-tight text-white drop-shadow-2xl sm:mt-2 sm:text-3xl md:text-4xl">
                {
                  (
                    activeScene as {
                      title?: string
                    }
                  ).title
                }
              </h2>
            )}
          {"subtitle" in (activeScene ?? {}) &&
            (
              activeScene as {
                subtitle?: string
              }
            ).subtitle && (
              <p className="line-clamp-2 max-w-2xl text-sm font-medium text-white/80 sm:text-lg">
                {
                  (
                    activeScene as {
                      subtitle?: string
                    }
                  ).subtitle
                }
              </p>
            )}
        </div>
      )
    }

    return null
  }

  return (
    <div
      key={sceneAnimationKey}
      className={clsx(
        "relative flex max-h-full min-h-0 w-full flex-1 flex-col items-center justify-between overflow-hidden text-center text-white",
        isCinemaScene
          ? "h-full max-w-none rounded-xl border border-white/5 bg-black/85 shadow-2xl"
          : "max-w-6xl rounded-2xl border border-white/10 bg-black/60 shadow-2xl backdrop-blur-xl sm:rounded-3xl",
        (() => {
          if (isUltraCompact || availableHeight <= 600) {
            return "p-1.5 sm:p-2.5"
          }

          if (isCompact || availableHeight <= 750) {
            return "p-2.5 sm:p-4"
          }

          if (isCinemaScene) {
            return "p-2 sm:p-4"
          }

          return "p-3 sm:p-6 md:p-8"
        })(),
        containerPreset !== "none" && `tada-entrance-${containerPreset}`,
        className,
      )}
      style={buildSceneSlotStyle(stageAnimations.questionEntrance, 0)}
      data-tada-entrance={
        containerPreset !== "none" ? containerPreset : undefined
      }
      data-testid="studio-scene-presenter"
      data-kind={kind}
      data-layout={(() => {
        if (kind === "opening" || kind === "closing" || kind === "media") {
          if (isCinemaScene) {
            return "cinema"
          }

          return "card"
        }

        return undefined
      })()}
      data-remaining={remainingSeconds}
    >
      {/* Unified 6-Layer Stage Compositor for Cinema Mode (Opening, Closing, or Opt-in Media) */}
      {isCinemaScene &&
        (kind === "opening" || kind === "closing" || kind === "media") && (
          <div className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden rounded-lg">
            <CinematicLayerStack
              sceneId={activeScene?.id ?? step?.sceneId ?? step?.id ?? kind}
              sceneKind={kind}
              epoch={(() => {
                if (typeof epoch === "number") {
                  return epoch
                }

                if (typeof step?.epoch === "number") {
                  return step.epoch
                }

                return 0
              })()}
              serverStartedAt={effectiveServerStartedAt}
              mediaUrl={
                activeScene && "mediaUrl" in activeScene
                  ? activeScene.mediaUrl
                  : undefined
              }
              mediaType={
                activeScene && "mediaType" in activeScene
                  ? activeScene.mediaType
                  : undefined
              }
              mediaFit={
                activeScene && "mediaFit" in activeScene
                  ? activeScene.mediaFit
                  : "cover"
              }
              volume={
                activeScene && "volume" in activeScene
                  ? activeScene.volume
                  : 0.8
              }
              loop={
                activeScene && "loop" in activeScene ? activeScene.loop : false
              }
              muted={
                activeScene && "muted" in activeScene
                  ? activeScene.muted
                  : false
              }
              showControls={
                activeScene && "showControls" in activeScene
                  ? activeScene.showControls
                  : false
              }
              endBehavior={endBehavior}
              lottieUrl={
                activeScene && "lottieUrl" in activeScene
                  ? activeScene.lottieUrl
                  : undefined
              }
              lottieFit={
                activeScene && "lottieFit" in activeScene
                  ? activeScene.lottieFit
                  : undefined
              }
              lottieLoop={
                activeScene && "lottieLoop" in activeScene
                  ? activeScene.lottieLoop
                  : undefined
              }
              lottieSpeed={
                activeScene && "lottieSpeed" in activeScene
                  ? activeScene.lottieSpeed
                  : undefined
              }
              overlayAnimations={
                activeScene && "overlayAnimations" in activeScene
                  ? (
                      activeScene as {
                        overlayAnimations?: CinematicOverlayAnimation[]
                      }
                    ).overlayAnimations
                  : undefined
              }
              inlineLottieMap={inlineLottieMap}
              titleSlot={renderCinemaNativeTitleSlot()}
              onForegroundMediaEnded={handleForegroundMediaEnded}
              onOverlayCompleted={onOverlayCompleted}
              interactiveEditorMode={interactiveEditorMode}
              controlledTimeMs={controlledTimeMs}
              controlledPaused={controlledPaused}
              selectedOverlayId={selectedOverlayId}
              onSelectOverlay={onSelectOverlay}
              onUpdateOverlayPosition={onUpdateOverlayPosition}
              onVideoDurationDetected={onVideoDurationDetected}
              onClockTick={onClockTick}
            />
          </div>
        )}

      {/* 1. Header / Title (for non-cinema card mode) */}
      {!isCinemaScene && (
        <div className="relative z-10 w-full shrink-0">
          {kind === "opening" && showHeaderOverlay && (
            <div
              data-testid="scene-opening-overlay"
              data-logo-position={logoPosition}
              className="flex flex-col items-center gap-1 sm:gap-2"
            >
              {logoPosition !== "hidden" && (
                <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
                  <Sparkles className="text-primary size-3.5 sm:size-4" />
                  <span>{getKindLabel("opening", "Show Opening")}</span>
                </div>
              )}
              <h1 className="mt-1 line-clamp-2 text-2xl font-black tracking-tight text-white drop-shadow-2xl sm:mt-2 sm:text-4xl md:text-5xl">
                {"title" in (activeScene ?? {})
                  ? (
                      activeScene as {
                        title: string
                      }
                    ).title
                  : "Welcome to the Show"}
              </h1>
              {"subtitle" in (activeScene ?? {}) &&
                (
                  activeScene as {
                    subtitle?: string
                  }
                ).subtitle && (
                  <p className="line-clamp-2 max-w-2xl text-sm font-medium text-white/80 sm:text-lg">
                    {
                      (
                        activeScene as {
                          subtitle?: string
                        }
                      ).subtitle
                    }
                  </p>
                )}
            </div>
          )}

          {kind === "closing" && showHeaderOverlay && (
            <div
              data-testid="scene-closing-overlay"
              data-logo-position={logoPosition}
              className="flex flex-col items-center gap-1 sm:gap-2"
            >
              {logoPosition !== "hidden" && (
                <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
                  <Award className="text-primary size-3.5 sm:size-4" />
                  <span>{getKindLabel("closing", "Show Closing")}</span>
                </div>
              )}
              <h1 className="mt-1 line-clamp-2 text-2xl font-black tracking-tight text-white drop-shadow-2xl sm:mt-2 sm:text-4xl md:text-5xl">
                {"title" in (activeScene ?? {})
                  ? (
                      activeScene as {
                        title: string
                      }
                    ).title
                  : "Thank You For Playing"}
              </h1>
              {"subtitle" in (activeScene ?? {}) &&
                (
                  activeScene as {
                    subtitle?: string
                  }
                ).subtitle && (
                  <p className="line-clamp-2 max-w-2xl text-sm font-medium text-white/80 sm:text-lg">
                    {
                      (
                        activeScene as {
                          subtitle?: string
                        }
                      ).subtitle
                    }
                  </p>
                )}
            </div>
          )}

          {kind === "answerRecap" && (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-0.5 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1 sm:text-sm">
                <ListChecks className="text-primary size-3.5 sm:size-4" />
                <span>{getKindLabel("answerRecap", "Answer Recap")}</span>
              </div>
              <h2 className="mt-0.5 line-clamp-1 text-lg font-black tracking-tight text-white drop-shadow-2xl sm:mt-1 sm:text-2xl md:text-3xl">
                {answerRecap?.title ??
                  ("title" in (activeScene ?? {})
                    ? (
                        activeScene as {
                          title?: string
                        }
                      ).title
                    : undefined) ??
                  "Cumulative Answer Recap"}
              </h2>
              {(answerRecap?.subtitle ||
                ("subtitle" in (activeScene ?? {}) &&
                  (
                    activeScene as {
                      subtitle?: string
                    }
                  ).subtitle)) && (
                <p className="line-clamp-1 max-w-2xl text-xs font-medium text-white/75 sm:text-sm">
                  {answerRecap?.subtitle ??
                    (
                      activeScene as {
                        subtitle?: string
                      }
                    ).subtitle}
                </p>
              )}
            </div>
          )}

          {kind === "transition" && (
            <div className="flex flex-col items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
                <Layers className="text-primary size-3.5 sm:size-4" />
                <span>{getKindLabel("transition", "Transition")}</span>
              </div>
              <h2 className="mt-1 line-clamp-2 text-xl font-black tracking-tight text-white drop-shadow-2xl sm:mt-2 sm:text-3xl md:text-4xl">
                {"title" in (activeScene ?? {})
                  ? ((
                      activeScene as {
                        title?: string
                      }
                    ).title ?? "Next Up")
                  : "Next Up"}
              </h2>
              {"description" in (activeScene ?? {}) &&
                (
                  activeScene as {
                    description?: string
                  }
                ).description && (
                  <p className="line-clamp-2 max-w-2xl text-sm font-medium text-white/80 sm:text-base">
                    {
                      (
                        activeScene as {
                          description?: string
                        }
                      ).description
                    }
                  </p>
                )}
            </div>
          )}

          {kind === "leaderboard" && (
            <div className="flex flex-col items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
                <Trophy className="text-primary size-3.5 sm:size-4" />
                <span>{getKindLabel("leaderboard", "Leaderboard")}</span>
              </div>
              <h2 className="mt-1 line-clamp-2 text-xl font-black tracking-tight text-white drop-shadow-2xl sm:mt-2 sm:text-3xl md:text-4xl">
                {"title" in (activeScene ?? {})
                  ? ((
                      activeScene as {
                        title?: string
                      }
                    ).title ?? "Leaderboard Standings")
                  : "Leaderboard Standings"}
              </h2>
            </div>
          )}

          {kind === "interimResults" && (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-0.5 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1 sm:text-sm">
                <BarChart3 className="text-primary size-3.5 sm:size-4" />
                <span>{getKindLabel("interimResults", "Interim Results")}</span>
              </div>
              <h2 className="mt-0.5 line-clamp-1 text-lg font-black tracking-tight text-white drop-shadow-2xl sm:mt-1 sm:text-2xl md:text-3xl">
                {"title" in (activeScene ?? {})
                  ? ((
                      activeScene as {
                        title?: string
                      }
                    ).title ?? "Audience Poll Results")
                  : "Audience Poll Results"}
              </h2>
            </div>
          )}

          {kind === "animation" && (
            <div className="flex flex-col items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
                <Sparkles className="text-primary size-3.5 sm:size-4" />
                <span>{getKindLabel("animation", "Animation")}</span>
              </div>
              <h2 className="mt-1 line-clamp-2 text-xl font-black tracking-tight text-white drop-shadow-2xl sm:mt-2 sm:text-3xl md:text-4xl">
                {"title" in (activeScene ?? {})
                  ? ((
                      activeScene as {
                        title?: string
                      }
                    ).title ?? "Get Ready")
                  : "Get Ready"}
              </h2>
            </div>
          )}

          {kind === "media" && (
            <div className="flex flex-col items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
                <Film className="text-primary size-3.5 sm:size-4" />
                <span>{getKindLabel("media", "Media Spotlight")}</span>
              </div>
              {"title" in (activeScene ?? {}) &&
                (
                  activeScene as {
                    title?: string
                  }
                ).title && (
                  <h2 className="mt-1 line-clamp-2 text-xl font-black tracking-tight text-white drop-shadow-2xl sm:mt-2 sm:text-3xl md:text-4xl">
                    {
                      (
                        activeScene as {
                          title?: string
                        }
                      ).title
                    }
                  </h2>
                )}
            </div>
          )}

          {kind === "countdown" && (
            <div className="flex flex-col items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white shadow-xs backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
                <Clock className="text-primary size-3.5 sm:size-4" />
                <span>{getKindLabel("countdown", "Countdown")}</span>
              </div>
              {"title" in (activeScene ?? {}) &&
                (
                  activeScene as {
                    title?: string
                  }
                ).title && (
                  <h2 className="mt-1 line-clamp-2 text-xl font-black tracking-tight text-white drop-shadow-2xl sm:mt-2 sm:text-3xl md:text-4xl">
                    {
                      (
                        activeScene as {
                          title?: string
                        }
                      ).title
                    }
                  </h2>
                )}
            </div>
          )}
        </div>
      )}

      {/* 2. Central Visual Body (for non-cinema card mode, or audio card inside cinema) */}
      {(!isCinemaScene ||
        (activeScene &&
          "mediaType" in activeScene &&
          activeScene.mediaType === "audio")) && (
        <div className="relative z-10 my-2 flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden sm:my-3">
          {labels?.sampleDataNotice && (
            <span className="border-primary/40 bg-primary/20 text-primary mb-1.5 shrink-0 rounded-full border px-3 py-0.5 text-xs font-semibold">
              {labels.sampleDataNotice}
            </span>
          )}

          {kind === "countdown" && (
            <div className="relative flex items-center justify-center">
              <div
                className="border-primary/60 flex size-32 items-center justify-center rounded-full border-8 bg-black/60 text-6xl font-black text-white tabular-nums shadow-2xl backdrop-blur-md transition-transform duration-200 sm:size-44 sm:text-7xl md:size-56 md:text-8xl"
                data-testid="scene-countdown-circle"
              >
                {remainingSeconds}
              </div>
            </div>
          )}

          {/* User-supplied Lottie on opening / closing in non-cinema card mode (NEVER calls handleForegroundMediaEnded) */}
          {!isCinemaScene &&
            (kind === "opening" || kind === "closing") &&
            activeScene &&
            resolveSceneOverlayAnimations(activeScene).map((ov, ovIdx) =>
              ov.enabled ? (
                <div
                  key={ov.id}
                  className="my-2 flex items-center justify-center"
                >
                  <LottiePlayer
                    src={ov.assetUrl}
                    loop={ov.loop}
                    speed={ov.speed}
                    fit={ov.fit}
                    finish={ov.finish}
                    onComplete={() => onOverlayCompleted?.(ov.id)}
                    className="h-36 w-56 sm:h-48 sm:w-72"
                    dataTestId={
                      ovIdx === 0
                        ? "scene-lottie-player"
                        : `scene-lottie-player-${ov.id}`
                    }
                  />
                </div>
              ) : null,
            )}

          {kind === "animation" && (
            <div
              data-testid={`scene-animation-preset-${activeScene && "preset" in activeScene ? activeScene.preset : "spotlight"}`}
              className="relative flex flex-col items-center justify-center gap-3"
            >
              {activeScene &&
              "lottieUrl" in activeScene &&
              activeScene.lottieUrl ? (
                <LottiePlayer
                  src={activeScene.lottieUrl}
                  loop={activeScene.lottieLoop ?? true}
                  speed={activeScene.lottieSpeed ?? 1}
                  fit={activeScene.lottieFit ?? "contain"}
                  onComplete={() => onOverlayCompleted?.("animation-lottie")}
                  className="h-40 w-64 sm:h-52 sm:w-80"
                  dataTestId="scene-lottie-player"
                />
              ) : (
                (() => {
                  const preset =
                    activeScene && "preset" in activeScene
                      ? activeScene.preset
                      : "spotlight"

                  return (
                    <div
                      data-tada-scene-anim={preset}
                      className={clsx(
                        "relative flex size-32 items-center justify-center rounded-full border-4 p-6 shadow-2xl backdrop-blur-md sm:size-40 md:size-48",
                        preset === "spotlight" &&
                          "tada-scene-anim-spotlight border-amber-300/60 bg-amber-400/20 shadow-[0_0_60px_rgba(251,191,36,0.45)]",
                        preset === "confetti" &&
                          "tada-scene-anim-confetti border-pink-400/60 bg-pink-500/20 shadow-[0_0_50px_rgba(236,72,153,0.4)]",
                        preset === "bounce" &&
                          "tada-scene-anim-bounce border-primary/60 bg-primary/20",
                        preset === "pulse" &&
                          "tada-scene-anim-pulse border-emerald-400/60 bg-emerald-500/20",
                      )}
                    >
                      <Sparkles className="text-primary size-16 drop-shadow-2xl sm:size-20" />
                    </div>
                  )
                })()
              )}
            </div>
          )}

          {/* Real Live Leaderboard */}
          {kind === "leaderboard" && (
            <div className="flex min-h-0 w-full max-w-xl flex-col items-center justify-center gap-2 overflow-hidden">
              {(() => {
                if (leaderboardEntries.length > 0) {
                  if (tadazzEnabled) {
                    return (
                      <TadazzLeaderboard
                        entries={leaderboardEntries}
                        epochKey={sceneAnimationKey}
                        pointsLabel={labels?.points ?? "pts"}
                        emptyLabel={
                          labels?.noScores ?? "No scores recorded yet."
                        }
                      />
                    )
                  }

                  return (
                    <div className="w-full rounded-2xl border border-white/10 bg-black/50 p-2.5 shadow-2xl backdrop-blur-md sm:p-4">
                      <ol className="divide-y divide-white/10">
                        {leaderboardEntries.slice(0, 6).map((entry, idx) => (
                          <li
                            key={entry.displayName}
                            className={clsx(
                              "flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2",
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
                                  "flex size-6 items-center justify-center rounded-full text-xs font-black sm:size-7",
                                  getRankBadgeClass(entry.rank),
                                )}
                              >
                                {entry.rank}
                              </span>
                              <span className="max-w-[180px] truncate text-sm font-bold text-white sm:max-w-[260px] sm:text-base">
                                {entry.displayName}
                              </span>
                            </div>
                            <span className="text-primary font-mono text-sm font-extrabold sm:text-base">
                              {entry.points} {labels?.points ?? "pts"}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )
                }

                return (
                  <div className="rounded-xl border border-white/10 bg-black/40 px-6 py-4 text-sm text-white/70">
                    {labels?.noScores ?? "No scores recorded yet."}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Real Live Interim Results */}
          {kind === "interimResults" && (
            <div className="flex min-h-0 w-full max-w-5xl flex-1 flex-col items-center justify-center gap-2 overflow-hidden">
              {interimResults ? (
                (() => {
                  const pollOptions: PollOptionItem[] =
                    interimResults.options.map((opt, i) => ({
                      answerIndex: opt.answerIndex ?? i,
                      label: opt.label,
                      count: opt.count ?? 0,
                      percentage: opt.percentage ?? 0,
                      imageUrl: opt.imageUrl,
                      alt: opt.alt,
                    }))
                  const ranking = computePollRanking(pollOptions)
                  const { isZeroVotes, isTie, winners, runnersUp, allSorted } =
                    ranking
                  const getCardColor = (idx: number) =>
                    CANONICAL_ANSWER_COLORS[idx] ?? "#334155"

                  return (
                    <div
                      className={clsx(
                        "flex min-h-0 w-full flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-2xl backdrop-blur-md sm:rounded-2xl",
                        isUltraCompact || availableHeight <= 600
                          ? "p-1.5 sm:p-2"
                          : "p-2.5 sm:p-4",
                      )}
                    >
                      <p
                        data-testid="scene-question-text"
                        className={clsx(
                          "text-center leading-snug font-black break-words text-white",
                          (() => {
                            if (isUltraCompact || isNarrowMobile) {
                              return "mb-0.5 text-xs sm:text-sm"
                            }

                            if (isCompact || availableHeight <= 600) {
                              return "mb-1 text-sm sm:text-base"
                            }

                            return "mb-1 text-base sm:mb-2 sm:text-xl md:text-2xl"
                          })(),
                        )}
                      >
                        {interimResults.questionText}
                      </p>

                      {/* Winner / Tie / No Votes Status Banner */}
                      {(() => {
                        if (isZeroVotes) {
                          return (
                            <div
                              data-testid="no-votes-message"
                              className={clsx(
                                "rounded-xl border border-white/10 bg-black/40 text-center font-semibold text-white/70",
                                isUltraCompact || availableHeight <= 600
                                  ? "my-0.5 px-2 py-0.5 text-[10px] sm:text-xs"
                                  : "my-1 px-3 py-1.5 text-xs sm:text-sm",
                              )}
                            >
                              No votes yet
                            </div>
                          )
                        }

                        if (isTie) {
                          return (
                            <div
                              data-testid="spotlight-tie"
                              className={clsx(
                                "flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10",
                                isUltraCompact || availableHeight <= 600
                                  ? "my-0.5 px-2 py-0.5"
                                  : "my-1 px-3 py-1",
                              )}
                            >
                              <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold tracking-wider break-words text-amber-300 uppercase sm:text-[11px]">
                                Tie / Co-leaders (
                                {winners.map((o) => o.label).join(", ")})
                              </span>
                            </div>
                          )
                        }

                        return (
                          <div
                            data-testid="spotlight-winner"
                            className={clsx(
                              "flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-400/10",
                              isUltraCompact || availableHeight <= 600
                                ? "my-0.5 px-2 py-0.5"
                                : "my-1 px-3 py-1",
                            )}
                          >
                            <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-black tracking-wider break-words text-amber-300 uppercase sm:text-[11px]">
                              Leading Choice: {winners[0]?.label}
                            </span>
                          </div>
                        )
                      })()}

                      {/* Results Composition: Dominant Hero + Ranked Runners-up */}
                      {!isZeroVotes ? (
                        <div
                          className={clsx(
                            "flex min-h-0 w-full flex-col items-center justify-center overflow-hidden",
                            isUltraCompact || availableHeight <= 600
                              ? "my-0.5"
                              : "my-1.5",
                          )}
                        >
                          {/* Dominant Centered Hero Winner(s) */}
                          <div
                            data-testid="results-hero-section"
                            className={clsx(
                              "flex w-full max-w-4xl flex-wrap items-center justify-center",
                              isUltraCompact || availableHeight <= 600
                                ? "mb-1 gap-1.5"
                                : "mb-2 gap-2 sm:gap-4",
                            )}
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
                                  style={buildSceneSlotStyle(
                                    resultsSlot,
                                    wIdx,
                                    {
                                      backgroundColor: cardBg,
                                    },
                                  )}
                                  className={clsx(
                                    "relative flex flex-col items-center justify-between overflow-hidden rounded-xl border-2 border-amber-300 text-center shadow-2xl ring-2 shadow-amber-500/30 ring-amber-400 transition-all duration-500 sm:rounded-2xl",
                                    isUltraCompact || availableHeight <= 600
                                      ? "p-1 sm:p-1.5"
                                      : "p-2 sm:p-3 sm:ring-4",
                                    resultsSlot.preset !== "none" &&
                                      `tada-entrance-${resultsSlot.preset}`,
                                    winners.length === 1
                                      ? "w-full max-w-xs sm:max-w-sm md:max-w-md"
                                      : "w-[calc(50%-0.5rem)] max-w-xs sm:max-w-sm",
                                  )}
                                >
                                  <div className="z-10 mb-0.5 flex w-full items-center justify-between gap-1">
                                    <span
                                      className={clsx(
                                        "flex shrink-0 items-center justify-center rounded-lg border border-white/25 bg-black/35 font-black text-white shadow-md",
                                        isUltraCompact || availableHeight <= 600
                                          ? "size-5 text-[10px]"
                                          : "size-6 text-xs sm:size-7 sm:text-sm",
                                        badgeSlot.preset !== "none" &&
                                          `tada-entrance-${badgeSlot.preset}`,
                                      )}
                                      style={buildSceneSlotStyle(
                                        badgeSlot,
                                        wIdx,
                                      )}
                                    >
                                      {index + 1}
                                    </span>

                                    <span className="flex items-center gap-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-black uppercase shadow-lg sm:px-2.5 sm:text-[10px]">
                                      <Trophy className="size-3 fill-black sm:size-3.5" />
                                      <span>
                                        {isTie ? "Co-leader" : "Leader"}
                                      </span>
                                    </span>

                                    <div className="flex items-center gap-1 rounded-full bg-black/35 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white shadow-md sm:text-[10px]">
                                      <span>{winner.percentage}%</span>
                                      <span className="text-white/80">
                                        ({winner.count}{" "}
                                        {winner.count === 1 ? "vote" : "votes"})
                                      </span>
                                    </div>
                                  </div>

                                  <div
                                    className="relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-black/20 shadow-inner sm:rounded-xl"
                                    style={{
                                      backgroundColor: cardBg,
                                      height: (() => {
                                        if (isUltraCompact) {
                                          return "clamp(28px, 6vh, 44px)"
                                        }

                                        if (
                                          isCompact ||
                                          availableHeight <= 650
                                        ) {
                                          return "clamp(34px, 8vh, 56px)"
                                        }

                                        return "clamp(48px, 14vh, 140px)"
                                      })(),
                                      maxHeight: (() => {
                                        if (isUltraCompact) {
                                          return "clamp(28px, 6vh, 44px)"
                                        }

                                        if (
                                          isCompact ||
                                          availableHeight <= 650
                                        ) {
                                          return "clamp(34px, 8vh, 56px)"
                                        }

                                        return "clamp(48px, 14vh, 140px)"
                                      })(),
                                    }}
                                  >
                                    {winner.imageUrl && (
                                      <img
                                        src={winner.imageUrl}
                                        alt={winner.alt || winner.label}
                                        data-testid="winner-image"
                                        className="h-full w-full rounded-lg object-contain p-0.5 sm:p-1"
                                        loading="lazy"
                                      />
                                    )}

                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-0.5 text-center sm:p-1">
                                      <div className="flex items-baseline justify-center gap-1 text-white">
                                        <span className="text-sm font-black drop-shadow-md sm:text-base md:text-xl">
                                          {winner.percentage}%
                                        </span>
                                        <span className="text-[9px] font-semibold text-white/90 sm:text-[10px]">
                                          ({winner.count}{" "}
                                          {winner.count === 1
                                            ? "vote"
                                            : "votes"}
                                          )
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <span
                                    data-testid="winner-caption"
                                    className={clsx(
                                      "mt-0.5 w-full text-center leading-tight font-black break-words text-white drop-shadow-md",
                                      isUltraCompact || availableHeight <= 600
                                        ? "text-[10px] sm:text-xs"
                                        : "text-xs sm:text-sm md:text-base",
                                    )}
                                  >
                                    {winner.label}
                                  </span>

                                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/25 sm:h-1.5">
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
                              className={clsx(
                                "grid w-full max-w-4xl grid-cols-2 sm:grid-cols-4",
                                isUltraCompact || availableHeight <= 600
                                  ? "gap-1"
                                  : "gap-1.5 sm:gap-2.5",
                              )}
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
                                    style={buildSceneSlotStyle(
                                      resultsSlot,
                                      orderIdx,
                                      {
                                        backgroundColor: cardBg,
                                      },
                                    )}
                                    className={clsx(
                                      "relative flex flex-col items-center justify-between overflow-hidden rounded-lg border border-black/20 text-center opacity-95 shadow-lg transition-all duration-300 sm:rounded-xl",
                                      isUltraCompact || availableHeight <= 600
                                        ? "p-1"
                                        : "p-1.5 sm:p-2",
                                      resultsSlot.preset !== "none" &&
                                        `tada-entrance-${resultsSlot.preset}`,
                                    )}
                                  >
                                    <div className="z-10 mb-0.5 flex w-full items-center justify-between gap-1">
                                      <span
                                        className={clsx(
                                          "flex shrink-0 items-center justify-center rounded-md border border-white/20 bg-black/35 font-black text-white shadow-md",
                                          isUltraCompact ||
                                            availableHeight <= 600
                                            ? "size-4 text-[9px]"
                                            : "size-5 text-[10px] sm:size-6 sm:text-xs",
                                          badgeSlot.preset !== "none" &&
                                            `tada-entrance-${badgeSlot.preset}`,
                                        )}
                                        style={buildSceneSlotStyle(
                                          badgeSlot,
                                          orderIdx,
                                        )}
                                      >
                                        {index + 1}
                                      </span>
                                      <span className="rounded-full bg-black/35 px-1 py-0.5 font-mono text-[9px] font-bold text-white sm:text-[10px]">
                                        {runner.count}{" "}
                                        {runner.count === 1 ? "vote" : "votes"}
                                      </span>
                                    </div>

                                    <div
                                      className="relative flex w-full items-center justify-center overflow-hidden rounded-md border border-black/15 shadow-inner sm:rounded-lg"
                                      style={{
                                        backgroundColor: cardBg,
                                        height: (() => {
                                          if (isUltraCompact) {
                                            return "clamp(18px, 4.5vh, 28px)"
                                          }

                                          if (
                                            isCompact ||
                                            availableHeight <= 650
                                          ) {
                                            return "clamp(22px, 5.5vh, 36px)"
                                          }

                                          return "clamp(36px, 9vh, 80px)"
                                        })(),
                                        maxHeight: (() => {
                                          if (isUltraCompact) {
                                            return "clamp(18px, 4.5vh, 28px)"
                                          }

                                          if (
                                            isCompact ||
                                            availableHeight <= 650
                                          ) {
                                            return "clamp(22px, 5.5vh, 36px)"
                                          }

                                          return "clamp(36px, 9vh, 80px)"
                                        })(),
                                      }}
                                    >
                                      {runner.imageUrl && (
                                        <img
                                          src={runner.imageUrl}
                                          alt={runner.alt || runner.label}
                                          className="h-full w-full rounded-md object-contain p-0.5"
                                          loading="lazy"
                                        />
                                      )}
                                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-0.5 text-center">
                                        <span className="text-[10px] font-black text-white drop-shadow-md sm:text-xs">
                                          {runner.percentage}%
                                        </span>
                                      </div>
                                    </div>

                                    <span className="mt-0.5 w-full text-center text-[10px] leading-tight font-bold break-words text-white drop-shadow-md sm:text-[11px]">
                                      {runner.label}
                                    </span>

                                    <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/20">
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
                        <div className="my-1.5 grid w-full grid-cols-6 gap-2 sm:gap-3">
                          {allSorted.map((opt, i) => {
                            const index = opt.answerIndex
                            const count = allSorted.length
                            let colClass = "col-span-3 sm:col-span-3"

                            if (count === 5) {
                              if (i === 0) {
                                colClass =
                                  "col-span-3 sm:col-span-2 sm:col-start-1"
                              } else if (i === 1) {
                                colClass =
                                  "col-span-3 sm:col-span-2 sm:col-start-3"
                              } else if (i === 2) {
                                colClass =
                                  "col-span-3 sm:col-span-2 sm:col-start-5"
                              } else if (i === 3) {
                                colClass =
                                  "col-span-3 sm:col-span-2 sm:col-start-2"
                              } else if (i === 4) {
                                colClass =
                                  "col-span-6 sm:col-span-2 sm:col-start-4"
                              }
                            } else if (count === 3) {
                              colClass =
                                i === 2
                                  ? "col-span-6 sm:col-span-2"
                                  : "col-span-3 sm:col-span-2"
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
                                <div className="mb-1 flex w-full items-center justify-between">
                                  <span className="flex size-5 items-center justify-center rounded-md border border-white/20 bg-black/35 text-xs font-black text-white">
                                    {index + 1}
                                  </span>
                                </div>

                                <div
                                  className="relative flex aspect-square max-h-[12vh] w-full items-center justify-center overflow-hidden rounded-lg border border-black/15 shadow-inner sm:max-h-[16vh]"
                                  style={{
                                    backgroundColor: cardBg,
                                  }}
                                >
                                  {opt.imageUrl && (
                                    <img
                                      src={opt.imageUrl}
                                      alt={opt.alt || opt.label}
                                      className="h-full w-full rounded-lg object-contain p-1"
                                      loading="lazy"
                                    />
                                  )}
                                </div>

                                <span className="mt-1 line-clamp-1 w-full text-center text-xs font-bold text-white drop-shadow-md sm:text-sm">
                                  {opt.label}
                                </span>

                                <div className="mt-0.5 flex items-center justify-center gap-1 font-mono text-[10px] font-bold text-white/90">
                                  <span>0 votes</span>
                                  <span>(0%)</span>
                                </div>

                                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/20">
                                  <div
                                    className="h-full rounded-full bg-white"
                                    style={{
                                      width: "0%",
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      <div className="mt-1.5 flex justify-between border-t border-white/10 pt-1.5 text-[11px] text-white/60">
                        <span data-testid="total-votes">
                          {labels?.totalResponders
                            ? labels.totalResponders(
                                interimResults.totalResponders,
                              )
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

          {/* Cumulative Answer Recap */}
          {kind === "answerRecap" && (
            <div
              data-testid="scene-answer-recap"
              className="flex min-h-0 w-full max-w-5xl flex-1 flex-col items-center justify-center gap-2 overflow-hidden"
            >
              {visibleRecapItems.length > 0 ? (
                <div className="flex min-h-0 w-full flex-1 flex-col justify-between gap-2 overflow-hidden">
                  <div
                    className={clsx(
                      "grid min-h-0 w-full flex-1 content-center gap-2 sm:gap-3",
                      visibleRecapItems.length === 1
                        ? "mx-auto max-w-2xl grid-cols-1"
                        : "grid-cols-1 sm:grid-cols-2",
                    )}
                  >
                    {visibleRecapItems.map((item, idx) => {
                      const showCounts = answerRecap?.showCounts ?? true
                      const showPercentages =
                        answerRecap?.showPercentages ?? true
                      const badgeLabel = (() => {
                        if (item.badgeType === "correctAnswer") {
                          return "Correct Answer"
                        }

                        if (item.badgeType === "tiedMostSelected") {
                          return "Tied Most Selected"
                        }

                        if (item.badgeType === "noResponses") {
                          return "No Responses"
                        }

                        return "Most Selected"
                      })()

                      return (
                        <div
                          key={item.questionId}
                          data-testid="recap-question-card"
                          data-question-id={item.questionId}
                          data-badge-type={item.badgeType}
                          data-tada-entrance={
                            resultsSlot.preset !== "none"
                              ? resultsSlot.preset
                              : undefined
                          }
                          style={buildSceneSlotStyle(resultsSlot, idx)}
                          className={clsx(
                            "flex flex-col justify-between rounded-xl border border-white/15 bg-black/55 text-left shadow-xl backdrop-blur-md sm:rounded-2xl",
                            isUltraCompact || availableHeight <= 600
                              ? "gap-1 p-2"
                              : "gap-1.5 p-2.5 sm:gap-2 sm:p-3.5",
                            resultsSlot.preset !== "none" &&
                              `tada-entrance-${resultsSlot.preset}`,
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-black text-white sm:text-xs">
                              Q{item.questionNumber}
                            </span>
                            <span
                              data-testid="recap-item-badge"
                              className={clsx(
                                "rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider uppercase sm:text-xs",
                                item.badgeType === "correctAnswer" &&
                                  "border border-emerald-400/40 bg-emerald-500/25 text-emerald-300",
                                item.badgeType === "mostSelected" &&
                                  "border border-amber-400/40 bg-amber-400/25 text-amber-300",
                                item.badgeType === "tiedMostSelected" &&
                                  "border border-sky-400/40 bg-sky-400/25 text-sky-300",
                                item.badgeType === "noResponses" &&
                                  "border border-white/20 bg-white/10 text-white/60",
                              )}
                            >
                              {badgeLabel}
                            </span>
                          </div>

                          <p
                            data-testid="recap-question-text"
                            className={clsx(
                              "line-clamp-2 leading-snug font-bold text-white",
                              isUltraCompact || isNarrowMobile
                                ? "text-xs sm:text-sm"
                                : "text-sm sm:text-base",
                            )}
                          >
                            {item.questionText}
                          </p>

                          {item.winningOptions.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              {item.winningOptions.map((opt) => {
                                const optBg =
                                  CANONICAL_ANSWER_COLORS[opt.answerIndex] ??
                                  "#334155"

                                return (
                                  <div
                                    key={opt.answerIndex}
                                    data-testid="recap-winning-option"
                                    style={{
                                      backgroundColor: optBg,
                                    }}
                                    className="flex min-w-[120px] flex-1 items-center justify-between gap-2 rounded-lg border border-white/20 px-2.5 py-1.5 text-white shadow-md"
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      {opt.imageUrl && (
                                        <img
                                          src={opt.imageUrl}
                                          alt={opt.alt || opt.label}
                                          data-testid="recap-option-image"
                                          className="size-7 shrink-0 rounded bg-black/25 object-contain sm:size-8"
                                        />
                                      )}
                                      <span
                                        data-testid="recap-option-label"
                                        className="truncate text-xs font-black sm:text-sm"
                                      >
                                        {opt.label}
                                      </span>
                                    </div>
                                    {(showCounts || showPercentages) && (
                                      <span
                                        data-testid="recap-option-stats"
                                        className="shrink-0 rounded bg-black/35 px-1.5 py-0.5 font-mono text-[10px] font-bold sm:text-xs"
                                      >
                                        {showPercentages
                                          ? `${opt.percentage}%`
                                          : ""}
                                        {showPercentages && showCounts
                                          ? " "
                                          : ""}
                                        {showCounts ? `(${opt.count})` : ""}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div
                              data-testid="recap-no-responses-row"
                              className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 text-xs text-white/60"
                            >
                              {labels?.noResponsesYet ??
                                "No responses recorded for this question."}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {totalRecapPages > 1 && (
                    <div
                      data-testid="recap-pagination-bar"
                      className="flex shrink-0 items-center justify-center gap-3 pt-1"
                    >
                      <PlatformButton
                        size="sm"
                        type="button"
                        data-testid="recap-prev-page"
                        onClick={() =>
                          setRecapPage(
                            (prev) =>
                              (prev - 1 + totalRecapPages) % totalRecapPages,
                          )
                        }
                        className="rounded-full bg-white/15 p-1 text-white hover:bg-white/25"
                      >
                        <ChevronLeft className="size-4" />
                      </PlatformButton>
                      <span
                        data-testid="recap-page-indicator"
                        className="text-xs font-bold text-white/80"
                      >
                        Page {clampedRecapPage + 1} of {totalRecapPages}
                      </span>
                      <PlatformButton
                        size="sm"
                        type="button"
                        data-testid="recap-next-page"
                        onClick={() =>
                          setRecapPage((prev) => (prev + 1) % totalRecapPages)
                        }
                        className="rounded-full bg-white/15 p-1 text-white hover:bg-white/25"
                      >
                        <ChevronRight className="size-4" />
                      </PlatformButton>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  data-testid="recap-empty-state"
                  className="rounded-xl border border-white/10 bg-black/40 px-6 py-4 text-sm text-white/70"
                >
                  {labels?.noInterimResults ??
                    "No completed questions to recap yet."}
                </div>
              )}
            </div>
          )}

          {/* Media or Optional Media in Opening/Closing (Card mode or Audio) */}
          {(kind === "media" ||
            (activeScene &&
              "mediaUrl" in activeScene &&
              (
                activeScene as {
                  mediaUrl?: string
                }
              ).mediaUrl &&
              (!isCinemaScene ||
                (
                  activeScene as {
                    mediaType?: string
                  }
                ).mediaType === "audio" ||
                mediaError))) &&
            (() => {
              const {
                mediaUrl,
                mediaType = "image",
                mediaFit = "contain",
                loop = false,
                muted = false,
                showControls = true,
              } = (activeScene ?? {}) as {
                mediaUrl?: string
                mediaType?: "image" | "video" | "audio"
                mediaFit?: "cover" | "contain"
                loop?: boolean
                muted?: boolean
                showControls?: boolean
              }

              if (!mediaUrl || mediaError) {
                return (
                  <div
                    className="text-muted-foreground flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-black/40 p-6 shadow-2xl sm:p-10"
                    data-testid="scene-media-placeholder"
                  >
                    <AlertTriangle className="size-10 text-yellow-400 sm:size-14" />
                    <p className="mt-2 text-sm font-semibold text-white/80 sm:text-base">
                      {mediaError
                        ? (labels?.imageError ?? "Failed to load media asset")
                        : (labels?.noMedia ?? "No media asset configured")}
                    </p>
                  </div>
                )
              }

              if (mediaType === "audio") {
                return (
                  <div
                    data-testid="scene-audio-container"
                    className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/20 bg-black/50 px-8 py-6 shadow-2xl backdrop-blur-md"
                  >
                    <div className="bg-primary/25 text-primary flex size-20 items-center justify-center rounded-full shadow-inner sm:size-24">
                      <Music className="size-10 animate-pulse sm:size-12" />
                    </div>
                    <audio
                      ref={audioRef}
                      src={mediaUrl}
                      autoPlay
                      loop={loop}
                      muted={muted}
                      controls={showControls}
                      onEnded={handleForegroundMediaEnded}
                      onError={() => setMediaError(true)}
                      data-testid="scene-audio"
                      className="w-64 max-w-full sm:w-80"
                    />
                  </div>
                )
              }

              if (mediaType === "video") {
                return (
                  <div className="relative max-h-[38vh] max-w-[85vw] overflow-hidden rounded-2xl border border-white/20 shadow-2xl sm:max-h-[45vh]">
                    <video
                      ref={videoRef}
                      src={mediaUrl}
                      autoPlay
                      loop={loop}
                      muted={muted}
                      controls={showControls}
                      playsInline
                      onEnded={handleForegroundMediaEnded}
                      onError={() => setMediaError(true)}
                      className={clsx(
                        "max-h-[38vh] w-auto max-w-[85vw] rounded-2xl shadow-2xl sm:max-h-[45vh]",
                        mediaFit === "cover"
                          ? "object-cover"
                          : "object-contain",
                      )}
                      data-testid="scene-video"
                    />
                  </div>
                )
              }

              return (
                <div className="relative max-h-[38vh] max-w-[85vw] overflow-hidden rounded-2xl border border-white/20 shadow-2xl sm:max-h-[45vh]">
                  <img
                    src={mediaUrl}
                    alt={
                      "title" in (activeScene ?? {})
                        ? ((
                            activeScene as {
                              title?: string
                            }
                          ).title ?? "Scene media")
                        : "Scene media"
                    }
                    onError={() => setMediaError(true)}
                    className={clsx(
                      "max-h-[38vh] w-auto max-w-[85vw] rounded-2xl shadow-2xl sm:max-h-[45vh]",
                      mediaFit === "cover" ? "object-cover" : "object-contain",
                    )}
                    data-testid="scene-image"
                  />
                </div>
              )
            })()}

          {kind === "transition" && !("mediaUrl" in (activeScene ?? {})) && (
            <div className="flex size-28 items-center justify-center rounded-full border-4 border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md sm:size-36">
              <Layers className="text-primary size-14 drop-shadow-2xl sm:size-16" />
            </div>
          )}
        </div>
      )}

      {/* 3. Bottom Controls & Progress */}
      <div
        className={clsx(
          "flex w-full shrink-0 flex-col border-t border-white/20",
          isUltraCompact || availableHeight <= 600
            ? "mt-1 gap-1 pt-1"
            : "mt-2 gap-2 pt-2.5 sm:pt-3",
        )}
      >
        {advanceMode === "auto" && (
          <div className="flex flex-col gap-0.5 sm:gap-1">
            <div className="flex items-center justify-between text-[10px] font-semibold text-white/70 sm:text-xs">
              <span>{remainingSeconds}s</span>
              <span>{Math.round(progressRatio * 100)}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/20 sm:h-1.5">
              <div
                className="bg-primary h-full transition-all duration-100 ease-linear"
                style={{
                  width: `${progressRatio * 100}%`,
                }}
                data-testid="scene-progress-bar"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p
            data-testid="scene-awaiting-host"
            className="text-[11px] font-medium text-white/60 sm:text-xs"
          >
            {advanceMode === "auto"
              ? (labels?.autoProgression ?? "Automatic progression")
              : (labels?.awaitingHost ?? "Awaiting host to advance")}
          </p>

          {isManager && (
            <PlatformButton
              size="sm"
              type="button"
              onClick={handleSkipClick}
              disabled={skipState.hasSkipped}
              className={clsx(
                "focus:ring-primary rounded-lg font-bold shadow-lg transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none sm:rounded-xl",
                isUltraCompact || availableHeight <= 600
                  ? "px-2.5 py-1 text-[10px] sm:text-xs"
                  : "px-4 py-1.5 text-xs sm:px-5 sm:py-2 sm:text-sm",
                skipState.hasSkipped
                  ? "cursor-not-allowed bg-white/10 text-white/40"
                  : "bg-primary text-white hover:opacity-90 active:scale-95",
              )}
              data-testid="scene-skip-button"
            >
              {skipState.hasSkipped
                ? (labels?.skipped ?? "Skipped")
                : (labels?.advanceScene ?? "Advance Scene")}
            </PlatformButton>
          )}
        </div>
      </div>
    </div>
  )
}
