// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import type { CinematicOverlayAnimation } from "../core/cinematic-overlays"

export interface CinematicClockInput {
  /** Whether the scene has an active foreground video backdrop */
  hasVideoBackdrop: boolean
  /** Current video playback position in milliseconds (from video.currentTime * 1000) */
  videoTimeMs: number
  /** Whether the foreground video is currently paused or buffering */
  isVideoPaused: boolean
  /** Elapsed scene time in milliseconds (derived from serverStartedAt or local preview clock) */
  sceneTimeMs: number
  /** Whether the scene clock is paused (e.g. in editor preview) */
  isScenePaused?: boolean
}

export type OverlayPlaybackPhase =
  | "disabled"
  | "beforeStart"
  | "playing"
  | "holdingLastFrame"
  | "finishedHidden"
  | "afterWindow"

export interface OverlayPlaybackState {
  visible: boolean
  localElapsedMs: number
  seekTimeMs: number
  effectiveOpacity: number
  paused: boolean
  phase: OverlayPlaybackPhase
}

/**
 * Pure, deterministic evaluator for a single `CinematicOverlayAnimation` layer
 * at a given point on the video or scene clock.
 *
 * Rules:
 * - `timeBase: "video"` anchors to `videoTimeMs` when `hasVideoBackdrop` is true,
 *   and automatically freezes (`paused: true`) when the video pauses or buffers.
 * - `timeBase: "scene"` (or when no video backdrop exists) anchors to `sceneTimeMs`.
 * - Before `startMs`: `visible: false`.
 * - When `durationMs` is set: the overlay visibility window is `[startMs, startMs + durationMs)`.
 *   Once `localElapsedMs >= durationMs`, `visible` becomes `false` (even if `finish: "holdLastFrame"`,
 *   because `holdLastFrame` holds the end frame *until* the visibility window expires at `startMs + durationMs`).
 * - Within the visibility window, if `!loop` and `intrinsicDurationMs` is reached:
 *   - `finish === "holdLastFrame"` keeps `visible: true` and clamps `seekTimeMs` to the final frame.
 *   - `finish === "hide"` sets `visible: false`.
 */
export function evaluateOverlayPlaybackState(
  overlay: CinematicOverlayAnimation,
  clock: CinematicClockInput,
  intrinsicDurationMs?: number,
): OverlayPlaybackState {
  if (!overlay.enabled || !overlay.assetUrl?.trim()) {
    return {
      visible: false,
      localElapsedMs: 0,
      seekTimeMs: 0,
      effectiveOpacity: 0,
      paused: true,
      phase: "disabled",
    }
  }

  const useVideoClock = overlay.timeBase === "video" && clock.hasVideoBackdrop
  const activeClockMs = Math.max(
    0,
    useVideoClock ? clock.videoTimeMs : clock.sceneTimeMs,
  )
  const isClockPaused = useVideoClock
    ? clock.isVideoPaused
    : Boolean(clock.isScenePaused)

  if (activeClockMs < overlay.startMs) {
    return {
      visible: false,
      localElapsedMs: 0,
      seekTimeMs: 0,
      effectiveOpacity: 0,
      paused: true,
      phase: "beforeStart",
    }
  }

  const localElapsedMs = activeClockMs - overlay.startMs

  if (
    overlay.durationMs !== undefined &&
    localElapsedMs >= overlay.durationMs
  ) {
    return {
      visible: false,
      localElapsedMs: overlay.durationMs,
      seekTimeMs: overlay.durationMs,
      effectiveOpacity: 0,
      paused: true,
      phase: "afterWindow",
    }
  }

  const clampedSpeed = Math.max(0.25, Math.min(3, overlay.speed || 1))
  const effectiveAnimDurationMs =
    intrinsicDurationMs && intrinsicDurationMs > 0
      ? intrinsicDurationMs / clampedSpeed
      : undefined

  let phase: OverlayPlaybackPhase = "playing"
  let seekTimeMs = localElapsedMs

  if (
    !overlay.loop &&
    effectiveAnimDurationMs !== undefined &&
    localElapsedMs >= effectiveAnimDurationMs
  ) {
    if (overlay.finish === "hide") {
      return {
        visible: false,
        localElapsedMs,
        seekTimeMs: effectiveAnimDurationMs,
        effectiveOpacity: 0,
        paused: true,
        phase: "finishedHidden",
      }
    }

    phase = "holdingLastFrame"
    seekTimeMs = effectiveAnimDurationMs
  }

  let effectiveOpacity = Math.max(0, Math.min(1, overlay.opacity ?? 1))

  if (
    overlay.fadeInMs &&
    overlay.fadeInMs > 0 &&
    localElapsedMs < overlay.fadeInMs
  ) {
    effectiveOpacity *= Math.max(
      0,
      Math.min(1, localElapsedMs / overlay.fadeInMs),
    )
  }

  if (
    overlay.fadeOutMs &&
    overlay.fadeOutMs > 0 &&
    overlay.durationMs !== undefined
  ) {
    const remainingMs = overlay.durationMs - localElapsedMs

    if (remainingMs < overlay.fadeOutMs) {
      effectiveOpacity *= Math.max(
        0,
        Math.min(1, remainingMs / overlay.fadeOutMs),
      )
    }
  }

  return {
    visible: effectiveOpacity > 0.001,
    localElapsedMs,
    seekTimeMs,
    effectiveOpacity: Number(effectiveOpacity.toFixed(4)),
    paused: isClockPaused || phase === "holdingLastFrame",
    phase,
  }
}

/**
 * Computes the bounded initial video seek offset in seconds when a client joins
 * or reconnects to an active video scene started at `serverStartedAt`.
 */
export function computeLateJoinVideoSeekSeconds(params: {
  serverStartedAt?: number
  nowMs?: number
  videoDurationSeconds?: number
  loop?: boolean
}): number {
  const {
    serverStartedAt,
    nowMs = Date.now(),
    videoDurationSeconds,
    loop,
  } = params

  if (!serverStartedAt || serverStartedAt <= 0) {
    return 0
  }

  const elapsedSec = Math.max(0, (nowMs - serverStartedAt) / 1000)

  // Ignore tiny < 0.35s startup jitter so normal scene start begins cleanly at 0
  if (elapsedSec < 0.35) {
    return 0
  }

  if (
    videoDurationSeconds === undefined ||
    !Number.isFinite(videoDurationSeconds) ||
    videoDurationSeconds <= 0
  ) {
    return elapsedSec
  }

  if (loop) {
    return elapsedSec % videoDurationSeconds
  }

  return Math.min(Math.max(0, videoDurationSeconds - 0.1), elapsedSec)
}

/**
 * Formats milliseconds into `mm:ss.d` for the editor timeline scrub bar and badges.
 */
export function formatTimelineMs(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms))
  const totalSec = Math.floor(safeMs / 1000)
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  const tenths = Math.floor((safeMs % 1000) / 100)

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`
}
