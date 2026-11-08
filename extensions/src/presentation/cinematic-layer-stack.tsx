import { PlatformButton } from "./platform-controls"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  resolveSceneOverlayAnimations,
  type CinematicOverlayAnimation,
} from "../core/cinematic-overlays"
import {
  computeLateJoinVideoSeekSeconds,
  type CinematicClockInput,
} from "./cinematic-clock"
import { clampNormalizedStagePoint } from "./cinematic-geometry"
import { CinematicOverlay } from "./cinematic-overlay"

export interface CinematicLayerStackProps {
  sceneId: string
  sceneKind: "opening" | "closing" | "media"
  epoch?: number
  serverStartedAt?: number

  mediaUrl?: string
  mediaType?: "image" | "video" | "audio"
  mediaFit?: "contain" | "cover"
  volume?: number
  loop?: boolean
  muted?: boolean
  showControls?: boolean
  endBehavior?: "holdFrame" | "advanceNext" | "fadeToTitle"
  contrastOverlayOpacity?: number

  /** Legacy single Lottie fields (used only when overlayAnimations is undefined) */
  lottieUrl?: string
  lottieFit?: "contain" | "cover"
  lottieLoop?: boolean
  lottieSpeed?: number

  /** Canonical multi-layer Lottie array */
  overlayAnimations?: CinematicOverlayAnimation[]
  inlineLottieMap?: Record<string, Record<string, unknown> | string>

  /** Native Layer 3 content (brand logo, title, subtitle, audio card) */
  titleSlot?: React.ReactNode
  /** Interactive Layer 5 content (host advance/skip controls, badges) */
  interactiveSlot?: React.ReactNode

  /** Fired ONLY when the designated foreground <video> or <audio> genuinely finishes */
  onForegroundMediaEnded?: () => void
  /** Local visual-layer completion callback for tests/telemetry (NEVER advances scene) */
  onOverlayCompleted?: (overlayId: string) => void

  /** Editor-only controlled playback & scrub hooks */
  interactiveEditorMode?: boolean
  controlledTimeMs?: number
  controlledPaused?: boolean
  selectedOverlayId?: string | null
  onSelectOverlay?: (id: string | null) => void
  onUpdateOverlayPosition?: (id: string, pos: { x: number; y: number }) => void
  onVideoDurationDetected?: (durationMs: number) => void
  onClockTick?: (timeMs: number) => void
  onEditorMediaEnded?: () => void
  activateAudioLabel?: string
  showAutoplayControl?: boolean
}

export const CinematicLayerStack: React.FC<CinematicLayerStackProps> = ({
  sceneId,
  sceneKind,
  epoch = 0,
  serverStartedAt,
  mediaUrl,
  mediaType,
  mediaFit = "cover",
  volume = 0.8,
  loop = false,
  muted = false,
  showControls = false,
  endBehavior = "holdFrame",
  contrastOverlayOpacity,
  lottieUrl,
  lottieFit,
  lottieLoop,
  lottieSpeed,
  overlayAnimations,
  inlineLottieMap,
  titleSlot,
  interactiveSlot,
  onForegroundMediaEnded,
  onOverlayCompleted,
  interactiveEditorMode = false,
  controlledTimeMs,
  controlledPaused,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlayPosition,
  onVideoDurationDetected,
  onClockTick,
  onEditorMediaEnded,
  activateAudioLabel = "Enable Sound",
  showAutoplayControl = true,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const endedKeyRef = useRef<string | null>(null)
  const lateSeekAppliedKeyRef = useRef<string | null>(null)
  const mountTimestampRef = useRef<number>(Date.now())
  const draggingOverlayIdRef = useRef<string | null>(null)

  const trimmedMediaUrl = mediaUrl?.trim() ?? ""
  const effectiveMediaType: "image" | "video" | "audio" | undefined =
    useMemo(() => {
      if (!trimmedMediaUrl) {
        return undefined
      }

      if (mediaType) {
        return mediaType
      }

      if (/\.(mp4|webm|mov|m4v)$/iu.test(trimmedMediaUrl)) {
        return "video"
      }

      if (/\.(mp3|wav|ogg|m4a|aac)$/iu.test(trimmedMediaUrl)) {
        return "audio"
      }

      return "image"
    }, [trimmedMediaUrl, mediaType])

  const hasVideoBackdrop =
    effectiveMediaType === "video" && trimmedMediaUrl.length > 0

  const [videoTimeMs, setVideoTimeMs] = useState(0)
  const [isVideoPaused, setIsVideoPaused] = useState(
    Boolean(interactiveEditorMode && (controlledPaused ?? true)),
  )
  const [sceneTimeMs, setSceneTimeMs] = useState(0)
  const [mediaEndedVisual, setMediaEndedVisual] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  const [autoplayAudioBlocked, setAutoplayAudioBlocked] = useState(false)

  const stageIdentityKey = `${sceneId}::${epoch}::${trimmedMediaUrl}`

  // Reset per-entry state when sceneId, epoch, or mediaUrl changes
  useEffect(() => {
    endedKeyRef.current = null
    lateSeekAppliedKeyRef.current = null
    mountTimestampRef.current = Date.now()
    setMediaEndedVisual(false)
    setMediaError(false)
    setAutoplayAudioBlocked(false)
    setVideoTimeMs(controlledTimeMs ?? 0)
    setSceneTimeMs(
      controlledTimeMs ??
        (serverStartedAt ? Math.max(0, Date.now() - serverStartedAt) : 0),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageIdentityKey, serverStartedAt])

  // Authoritative scene clock for timeBase="scene" (or when no video backdrop exists)
  useEffect(() => {
    if (controlledTimeMs !== undefined) {
      setSceneTimeMs(controlledTimeMs)

      return undefined
    }

    const originMs =
      serverStartedAt && serverStartedAt > 0 ? serverStartedAt : Date.now()
    const updateSceneClock = () => {
      const nextMs = Math.max(0, Date.now() - originMs)
      setSceneTimeMs(nextMs)

      if (!hasVideoBackdrop) {
        onClockTick?.(nextMs)
      }
    }
    updateSceneClock()
    const interval = setInterval(updateSceneClock, 50)

    return () => clearInterval(interval)
  }, [
    stageIdentityKey,
    serverStartedAt,
    controlledTimeMs,
    hasVideoBackdrop,
    onClockTick,
  ])

  // Sync video volume and controlled editor play/pause/seek
  useEffect(() => {
    const vid = videoRef.current

    if (!vid) {
      return
    }

    vid.volume = Math.max(0, Math.min(1, volume))
  }, [volume, trimmedMediaUrl])

  useEffect(() => {
    const vid = videoRef.current

    if (!vid || !hasVideoBackdrop) {
      return
    }

    if (controlledTimeMs !== undefined) {
      const targetSec = Math.max(0, controlledTimeMs / 1000)

      if (Math.abs(vid.currentTime - targetSec) > 0.08) {
        try {
          vid.currentTime = targetSec
        } catch {
          // Ignore seek before metadata ready
        }
      }

      setVideoTimeMs(controlledTimeMs)
    }

    if (controlledPaused !== undefined) {
      if (controlledPaused) {
        if (!vid.paused) {
          vid.pause()
        }

        setIsVideoPaused(true)
      } else {
        setIsVideoPaused(false)
        const playPromise = vid.play()

        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            setIsVideoPaused(true)
          })
        }
      }
    }
  }, [controlledTimeMs, controlledPaused, hasVideoBackdrop])

  // Attempt live video playback and handle browser autoplay-with-sound policies gracefully
  useEffect(() => {
    const vid = videoRef.current

    if (!vid || !hasVideoBackdrop || interactiveEditorMode) {
      return
    }

    vid.volume = Math.max(0, Math.min(1, volume))
    vid.muted = muted
    const playPromise = vid.play()

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Browser blocked unmuted autoplay -> fallback to muted playback so visual stage never stalls
        if (!vid.muted) {
          vid.muted = true
          setAutoplayAudioBlocked(true)
          vid.play().catch(() => {
            setIsVideoPaused(true)
          })
        } else {
          setIsVideoPaused(true)
        }
      })
    }
  }, [stageIdentityKey, hasVideoBackdrop, interactiveEditorMode, muted, volume])

  // Track video.currentTime smoothly via requestAnimationFrame while video is playing
  useEffect(() => {
    if (!hasVideoBackdrop || controlledTimeMs !== undefined) {
      return undefined
    }

    let rafId = 0
    let lastReportedMs = -1

    const tick = () => {
      const vid = videoRef.current

      if (vid && !vid.paused && !vid.ended) {
        const nowMs = Math.round(vid.currentTime * 1000)

        if (Math.abs(nowMs - lastReportedMs) >= 33) {
          lastReportedMs = nowMs
          setVideoTimeMs(nowMs)
          onClockTick?.(nowMs)
        }
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [hasVideoBackdrop, controlledTimeMs, onClockTick, stageIdentityKey])

  const handleVideoLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const vid = e.currentTarget

      if (Number.isFinite(vid.duration) && vid.duration > 0) {
        onVideoDurationDetected?.(Math.round(vid.duration * 1000))
      }

      if (
        !interactiveEditorMode &&
        serverStartedAt &&
        lateSeekAppliedKeyRef.current !== stageIdentityKey
      ) {
        lateSeekAppliedKeyRef.current = stageIdentityKey
        const mountedAfterSceneStartMs =
          mountTimestampRef.current - serverStartedAt

        if (mountedAfterSceneStartMs >= 1200) {
          const seekSec = computeLateJoinVideoSeekSeconds({
            serverStartedAt,
            videoDurationSeconds: vid.duration,
            loop,
          })

          if (seekSec > 0) {
            try {
              vid.currentTime = seekSec
              setVideoTimeMs(Math.round(seekSec * 1000))
            } catch {
              // Ignore if browser media source does not support immediate seek
            }
          }
        }
      }
    },
    [
      interactiveEditorMode,
      serverStartedAt,
      stageIdentityKey,
      loop,
      onVideoDurationDetected,
    ],
  )

  const handleVideoTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (controlledTimeMs !== undefined) {
        return
      }

      const nextMs = Math.round(e.currentTarget.currentTime * 1000)
      setVideoTimeMs(nextMs)
      onClockTick?.(nextMs)
    },
    [controlledTimeMs, onClockTick],
  )

  const handleForegroundVideoEnded = useCallback(() => {
    setMediaEndedVisual(true)
    setIsVideoPaused(true)
    const vid = videoRef.current

    if (vid && Number.isFinite(vid.duration) && vid.duration > 0) {
      setVideoTimeMs(Math.round(vid.duration * 1000))
    }

    if (interactiveEditorMode) {
      onEditorMediaEnded?.()

      return
    }

    // Strict one-shot de-duplication per (sceneId, epoch, mediaUrl)
    if (endedKeyRef.current === stageIdentityKey) {
      return
    }

    endedKeyRef.current = stageIdentityKey
    onForegroundMediaEnded?.()
  }, [interactiveEditorMode, onForegroundMediaEnded, stageIdentityKey])

  const handleActivateAudio = useCallback(() => {
    const vid = videoRef.current

    if (!vid) {
      return
    }

    vid.muted = false
    vid.volume = Math.max(0, Math.min(1, volume))
    setAutoplayAudioBlocked(false)
    vid.play().catch(() => {
      // Ignore if still blocked
    })
  }, [volume])

  const resolvedOverlays = useMemo(
    () =>
      resolveSceneOverlayAnimations({
        id: sceneId,
        mediaType: effectiveMediaType,
        mediaUrl: trimmedMediaUrl,
        lottieUrl,
        lottieFit,
        lottieLoop,
        lottieSpeed,
        overlayAnimations,
      }),
    [
      sceneId,
      effectiveMediaType,
      trimmedMediaUrl,
      lottieUrl,
      lottieFit,
      lottieLoop,
      lottieSpeed,
      overlayAnimations,
    ],
  )

  const behindTitleOverlays = useMemo(
    () => resolvedOverlays.filter((o) => o.layer === "behindTitle"),
    [resolvedOverlays],
  )
  const aboveTitleOverlays = useMemo(
    () => resolvedOverlays.filter((o) => o.layer === "aboveTitle"),
    [resolvedOverlays],
  )

  const effectiveClock: CinematicClockInput = useMemo(
    () => ({
      hasVideoBackdrop: hasVideoBackdrop && !mediaError,
      videoTimeMs:
        controlledTimeMs !== undefined ? controlledTimeMs : videoTimeMs,
      isVideoPaused:
        controlledPaused !== undefined ? controlledPaused : isVideoPaused,
      sceneTimeMs:
        controlledTimeMs !== undefined ? controlledTimeMs : sceneTimeMs,
      isScenePaused: controlledPaused,
    }),
    [
      hasVideoBackdrop,
      mediaError,
      controlledTimeMs,
      videoTimeMs,
      controlledPaused,
      isVideoPaused,
      sceneTimeMs,
    ],
  )

  // Editor pointer drag support on the shared stage coordinate plane
  const handleDragStartOverlay = useCallback(
    (id: string, e: React.PointerEvent<HTMLElement>) => {
      if (!interactiveEditorMode || !onUpdateOverlayPosition) {
        return
      }

      draggingOverlayIdRef.current = id
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    [interactiveEditorMode, onUpdateOverlayPosition],
  )

  const handleStagePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const dragId = draggingOverlayIdRef.current

      if (!dragId || !interactiveEditorMode || !onUpdateOverlayPosition) {
        return
      }

      const rect = stageRef.current?.getBoundingClientRect()

      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return
      }

      const norm = clampNormalizedStagePoint(
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height,
      )
      onUpdateOverlayPosition(dragId, norm)
    },
    [interactiveEditorMode, onUpdateOverlayPosition],
  )

  const handleStagePointerUp = useCallback(() => {
    draggingOverlayIdRef.current = null
  }, [])

  const handleOverlayKeyDown = useCallback(
    (id: string, e: React.KeyboardEvent<HTMLElement>) => {
      if (!interactiveEditorMode || !onUpdateOverlayPosition) {
        return
      }

      const target = resolvedOverlays.find((o) => o.id === id)

      if (!target) {
        return
      }

      const step = e.shiftKey ? 0.05 : 0.01
      let dx = 0
      let dy = 0

      if (e.key === "ArrowLeft") {
        dx = -step
      } else if (e.key === "ArrowRight") {
        dx = step
      } else if (e.key === "ArrowUp") {
        dy = -step
      } else if (e.key === "ArrowDown") {
        dy = step
      } else if (e.key === "Escape") {
        onSelectOverlay?.(null)

        return
      } else {
        return
      }

      e.preventDefault()
      e.stopPropagation()
      onUpdateOverlayPosition(
        id,
        clampNormalizedStagePoint(
          target.position.x + dx,
          target.position.y + dy,
        ),
      )
    },
    [
      interactiveEditorMode,
      onUpdateOverlayPosition,
      resolvedOverlays,
      onSelectOverlay,
    ],
  )

  const defaultTintOpacity =
    endBehavior === "fadeToTitle" && mediaEndedVisual
      ? 0.75
      : trimmedMediaUrl && effectiveMediaType !== "audio"
        ? 0.35
        : 0
  const resolvedTintOpacity = contrastOverlayOpacity ?? defaultTintOpacity

  return (
    <div
      ref={stageRef}
      data-testid={`cinematic-layer-stack-${sceneKind}`}
      data-scene-id={sceneId}
      data-scene-epoch={String(epoch)}
      data-has-video={hasVideoBackdrop ? "true" : "false"}
      data-video-time-ms={String(effectiveClock.videoTimeMs)}
      data-scene-time-ms={String(effectiveClock.sceneTimeMs)}
      data-overlay-count={String(resolvedOverlays.length)}
      onPointerMove={interactiveEditorMode ? handleStagePointerMove : undefined}
      onPointerUp={interactiveEditorMode ? handleStagePointerUp : undefined}
      onPointerCancel={interactiveEditorMode ? handleStagePointerUp : undefined}
      onClick={
        interactiveEditorMode
          ? () => {
              onSelectOverlay?.(null)
            }
          : undefined
      }
      className="relative flex h-full w-full flex-1 flex-col items-center justify-center overflow-hidden select-none"
    >
      {/* Layer 0: Full-stage video or image backdrop */}
      {trimmedMediaUrl &&
        (effectiveMediaType === "video" || effectiveMediaType === "image") &&
        !mediaError && (
          <div
            data-testid="scene-cinema-backdrop"
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          >
            {effectiveMediaType === "video" ? (
              <video
                ref={videoRef}
                key={stageIdentityKey}
                data-testid="scene-video"
                data-scene-video-kind={sceneKind}
                src={trimmedMediaUrl}
                autoPlay={!interactiveEditorMode}
                playsInline
                loop={loop}
                muted={muted}
                controls={showControls}
                onLoadedMetadata={handleVideoLoadedMetadata}
                onTimeUpdate={handleVideoTimeUpdate}
                onPlay={() => setIsVideoPaused(false)}
                onPlaying={() => setIsVideoPaused(false)}
                onPause={() => setIsVideoPaused(true)}
                onWaiting={() => setIsVideoPaused(true)}
                onSeeked={handleVideoTimeUpdate}
                onEnded={handleForegroundVideoEnded}
                onError={() => setMediaError(true)}
                className={`pointer-events-none h-full w-full transition-opacity duration-500 ${
                  mediaFit === "contain"
                    ? "bg-black object-contain"
                    : "object-cover"
                } ${
                  endBehavior === "fadeToTitle" && mediaEndedVisual
                    ? "opacity-25"
                    : "opacity-100"
                }`}
              />
            ) : (
              <img
                data-testid="scene-image"
                data-scene-image-kind={sceneKind}
                src={trimmedMediaUrl}
                alt=""
                onError={() => setMediaError(true)}
                className={`pointer-events-none h-full w-full ${
                  mediaFit === "contain"
                    ? "bg-black/40 object-contain"
                    : "object-cover"
                }`}
              />
            )}
          </div>
        )}

      {/* Layer 1: Contrast tint / dimming backdrop */}
      {resolvedTintOpacity > 0 && (
        <div
          data-testid={`cinematic-layer-tint-${sceneKind}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-500"
          style={{
            backgroundColor: `rgba(0, 0, 0, ${resolvedTintOpacity})`,
          }}
        />
      )}

      {/* Layer 2: Ordered Lottie overlays behind native title */}
      <div
        data-testid="cinematic-layer-behind-title"
        aria-hidden={interactiveEditorMode ? undefined : "true"}
        className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      >
        {behindTitleOverlays.map((overlay) => (
          <CinematicOverlay
            key={overlay.id}
            overlay={overlay}
            clock={effectiveClock}
            inlineLottieMap={inlineLottieMap}
            interactiveEditorMode={interactiveEditorMode}
            isSelected={selectedOverlayId === overlay.id}
            onSelectOverlay={onSelectOverlay}
            onDragStartOverlay={handleDragStartOverlay}
            onOverlayKeyDown={handleOverlayKeyDown}
            onOverlayCompleted={onOverlayCompleted}
            legacyPlayerTestId={
              !overlayAnimations && resolvedOverlays.length === 1
                ? "scene-lottie-player"
                : undefined
            }
          />
        ))}
      </div>

      {/* Layer 3: Native Razzia title, subtitle, brand logo, or audio card */}
      {titleSlot && (
        <div
          data-testid="cinematic-layer-native-title"
          className="pointer-events-none relative z-30 flex w-full max-w-5xl flex-col items-center justify-center px-4 text-center"
        >
          {titleSlot}
        </div>
      )}

      {/* Layer 4: Ordered Lottie overlays above native title */}
      <div
        data-testid="cinematic-layer-above-title"
        aria-hidden={interactiveEditorMode ? undefined : "true"}
        className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
      >
        {aboveTitleOverlays.map((overlay) => (
          <CinematicOverlay
            key={overlay.id}
            overlay={overlay}
            clock={effectiveClock}
            inlineLottieMap={inlineLottieMap}
            interactiveEditorMode={interactiveEditorMode}
            isSelected={selectedOverlayId === overlay.id}
            onSelectOverlay={onSelectOverlay}
            onDragStartOverlay={handleDragStartOverlay}
            onOverlayKeyDown={handleOverlayKeyDown}
            onOverlayCompleted={onOverlayCompleted}
            legacyPlayerTestId={
              !overlayAnimations && resolvedOverlays.length === 1
                ? "scene-lottie-player"
                : undefined
            }
          />
        ))}
      </div>

      {/* Layer 5: Highest interactive layer (host controls, audio unlock, badges) */}
      <div
        data-testid="cinematic-layer-interactive"
        className="relative z-50 flex w-full flex-col items-center justify-center"
      >
        {showAutoplayControl &&
          autoplayAudioBlocked &&
          !interactiveEditorMode && (
            <PlatformButton size="sm"
              type="button"
              data-testid="cinematic-activate-audio"
              onClick={handleActivateAudio}
              className="mb-3 bg-white text-black hover:bg-accent"
            >
              <span>🔊</span>
              <span>{activateAudioLabel}</span>
            </PlatformButton>
          )}
        {interactiveSlot}
      </div>
    </div>
  )
}
