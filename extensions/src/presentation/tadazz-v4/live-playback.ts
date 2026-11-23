import type { TadazzV4LivePlayback, TadazzV4Scene } from "./types"

/** Live authority takes precedence over the separate imperative preview clock. */
export function pausedCountdownRemainingMsFor(
  livePlayback: TadazzV4LivePlayback | undefined,
  imperativeRemainingMs: number | undefined,
): number | undefined {
  if (livePlayback) {
    return livePlayback.paused ? livePlayback.countdownRemainingMs : undefined
  }

  return imperativeRemainingMs
}

/**
 * A newly committed live scene is a snapshot when its game is already paused.
 * Finish its decoration so the director can reconstruct all authoritative
 * content. The real countdown remains a paused clock, including at zero.
 * Preview pause/seek deliberately retains its explicit reconstruction lifecycle.
 */
export function scenePlaybackFor(
  scene: TadazzV4Scene,
  options: {
    reducedMotion: boolean
    livePlayback?: TadazzV4LivePlayback
    imperativeRemainingMs?: number
  },
) {
  const livePaused = options.livePlayback?.paused === true
  const countdownRemainingMs = pausedCountdownRemainingMsFor(
    options.livePlayback,
    options.imperativeRemainingMs,
  )

  return {
    reducedMotion: options.reducedMotion || livePaused,
    settleScene: livePaused && scene !== "countdown",
    pauseAfterCommit: options.livePlayback
      ? livePaused && scene === "countdown"
      : countdownRemainingMs !== undefined,
    countdownRemainingMs,
  }
}
