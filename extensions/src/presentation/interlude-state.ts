import type { Interlude } from "@razzia/extensions/core"

/**
 * Calculates remaining duration in milliseconds for an interlude.
 * Resumes accurately from authoritative server startedAt.
 */
export const calculateInterludeRemainingMs = (
  startedAt: number | undefined,
  durationMs: number,
  now: number = Date.now(),
): number => {
  if (!startedAt) {
    return durationMs
  }

  const elapsed = Math.max(0, now - startedAt)
  const remaining = durationMs - elapsed

  return Math.max(0, remaining)
}

/**
 * Pure state transition for skipping an interlude.
 * Enforces that skip occurs exactly once and cannot be replayed or triggered twice.
 */
export interface InterludeSkipState {
  hasSkipped: boolean
  skipTimestamp?: number
}

export const processInterludeSkip = (
  state: InterludeSkipState,
  now: number = Date.now(),
): { state: InterludeSkipState; shouldEmitSkip: boolean } => {
  if (state.hasSkipped) {
    return {
      state,
      shouldEmitSkip: false,
    }
  }

  return {
    state: {
      hasSkipped: true,
      skipTimestamp: now,
    },
    shouldEmitSkip: true,
  }
}

/**
 * Evaluates whether an interlude should automatically transition at the given time.
 */
export const shouldAutoAdvanceInterlude = (
  interlude: Interlude,
  serverStartedAt: number | undefined,
  now: number = Date.now(),
): boolean => {
  if (interlude.advance !== "auto") {
    return false
  }

  const remaining = calculateInterludeRemainingMs(
    serverStartedAt,
    interlude.durationMs,
    now,
  )

  return remaining <= 0
}
