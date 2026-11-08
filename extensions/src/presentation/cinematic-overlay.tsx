import {PlatformButton} from "./platform-controls"
import React, { useCallback, useState } from "react"
import type { CinematicOverlayAnimation } from "../core/cinematic-overlays"
import {
  evaluateOverlayPlaybackState,
  type CinematicClockInput,
} from "./cinematic-clock"
import { computeOverlayStageStyle } from "./cinematic-geometry"
import { LottiePlayer } from "./lottie-player"

export interface CinematicOverlayProps {
  overlay: CinematicOverlayAnimation
  clock: CinematicClockInput
  /** Optional inline JSON map for instant preview / tests without network fetch */
  inlineLottieMap?: Record<string, Record<string, unknown> | string>
  /** Editor-only interactive mode allowing selection & drag positioning */
  interactiveEditorMode?: boolean
  isSelected?: boolean
  onSelectOverlay?: (id: string) => void
  onDragStartOverlay?: (
    id: string,
    e: React.PointerEvent<HTMLElement>,
  ) => void
  onOverlayKeyDown?: (
    id: string,
    e: React.KeyboardEvent<HTMLElement>,
  ) => void
  /** Local visual-layer completion callback (NEVER advances scene) */
  onOverlayCompleted?: (id: string) => void
  /** Legacy compatibility testId when migrated from single lottieUrl */
  legacyPlayerTestId?: string
}

export const CinematicOverlay: React.FC<CinematicOverlayProps> = ({
  overlay,
  clock,
  inlineLottieMap,
  interactiveEditorMode = false,
  isSelected = false,
  onSelectOverlay,
  onDragStartOverlay,
  onOverlayKeyDown,
  onOverlayCompleted,
  legacyPlayerTestId,
}) => {
  const [intrinsicDurationMs, setIntrinsicDurationMs] = useState<
    number | undefined
  >(undefined)

  const playback = evaluateOverlayPlaybackState(
    overlay,
    clock,
    intrinsicDurationMs,
  )

  const handleReady = useCallback(
    (info: { durationMs: number; totalFrames: number }) => {
      if (info.durationMs > 0) {
        setIntrinsicDurationMs(info.durationMs)
      }
    },
    [],
  )

  const handleComplete = useCallback(() => {
    onOverlayCompleted?.(overlay.id)
  }, [onOverlayCompleted, overlay.id])

  const stageStyle = computeOverlayStageStyle(
    overlay,
    playback.visible ? playback.effectiveOpacity : 0,
  )

  const inlineData = inlineLottieMap?.[overlay.assetUrl]

  return (
    <PlatformButton type="button" size="sm" classNameContent="contents" disabled={!interactiveEditorMode}
      data-testid={`cinematic-overlay-${overlay.id}`}
      data-overlay-id={overlay.id}
      data-overlay-layer={overlay.layer}
      data-overlay-order={String(overlay.order)}
      data-overlay-timebase={overlay.timeBase}
      data-overlay-visible={playback.visible ? "true" : "false"}
      data-overlay-phase={playback.phase}
      aria-hidden={interactiveEditorMode ? undefined : "true"}
      aria-label={
        interactiveEditorMode
          ? overlay.label || `Overlay ${overlay.order + 1}`
          : undefined
      }
      onClick={
        interactiveEditorMode
          ? (e) => {
              e.stopPropagation()
              onSelectOverlay?.(overlay.id)
            }
          : undefined
      }
      onPointerDown={
        interactiveEditorMode
          ? (e) => {
              e.stopPropagation()
              onSelectOverlay?.(overlay.id)
              onDragStartOverlay?.(overlay.id, e)
            }
          : undefined
      }
      onKeyDown={
        interactiveEditorMode
          ? (e) => {
              onOverlayKeyDown?.(overlay.id, e)
            }
          : undefined
      }
      className={`p-0 border-0 rounded-none bg-transparent disabled:opacity-100 ${(
        interactiveEditorMode
          ? `transition-shadow select-none ${
              isSelected
                ? "cursor-move shadow-[0_0_0_2px_rgba(0,0,0,0.6)] ring-2 ring-amber-400"
                : "cursor-pointer hover:ring-1 hover:ring-white/50"
            }`
          : "pointer-events-none select-none"
      )}`}
      style={{
        ...stageStyle,
        visibility:
          playback.visible || (interactiveEditorMode && isSelected)
            ? "visible"
            : "hidden",
        opacity: playback.visible
          ? playback.effectiveOpacity
          : interactiveEditorMode && isSelected
            ? 0.35
            : 0,
        pointerEvents: interactiveEditorMode ? "auto" : "none",
      }}
    >
      <LottiePlayer
        testId={legacyPlayerTestId ?? `cinematic-overlay-player-${overlay.id}`}
        src={inlineData ? undefined : overlay.assetUrl}
        data={inlineData}
        loop={overlay.loop}
        speed={overlay.speed}
        fit={overlay.fit}
        finish={overlay.finish}
        paused={playback.paused || !playback.visible}
        seekTimeMs={playback.seekTimeMs}
        onReady={handleReady}
        onComplete={handleComplete}
        className="h-full w-full"
      />
      {interactiveEditorMode && isSelected && (
        <span
          data-testid={`cinematic-overlay-handle-${overlay.id}`}
          className="pointer-events-none absolute -top-5 left-0 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950 shadow"
        >
          {overlay.label || `#${overlay.order + 1}`}{" "}
          {Math.round(overlay.position.x * 100)}%,
          {Math.round(overlay.position.y * 100)}%
        </span>
      )}
    </PlatformButton>
  )
}
