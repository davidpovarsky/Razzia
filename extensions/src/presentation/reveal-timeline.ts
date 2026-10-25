export interface RevealTimelineState {
  stage: "animating" | "paused" | "revealed"
  // Value between 0 and 1
  progress: number
  isRevealed: boolean
  displayPercentages: Record<number, number>
}

export interface RevealTimelineOptions {
  timelineKey: string
  targetPercentages: Record<number, number>
  // Range: 650..1000 ms, default 800ms
  barDurationMs?: number
  // Range: 200..350 ms, default 250ms
  pauseDurationMs?: number
  startedAt?: number
  isSurvey?: boolean
  reducedMotion?: boolean
}

/**
 * Ease-out cubic calculation for smooth percentage bar expansion.
 */
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3

/**
 * Pure calculator for reveal animation state based on immutable epoch/seq and elapsed time.
 */
export function calculateRevealState(
  options: RevealTimelineOptions,
  now = Date.now(),
): RevealTimelineState {
  const {
    targetPercentages,
    barDurationMs = 800,
    pauseDurationMs = 250,
    startedAt = now,
    reducedMotion = false,
  } = options

  // Reduced motion: immediate final result
  if (reducedMotion) {
    return {
      stage: "revealed",
      progress: 1,
      isRevealed: true,
      displayPercentages: { ...targetPercentages },
    }
  }

  const elapsed = Math.max(0, now - startedAt)
  const totalRevealDelay = barDurationMs + pauseDurationMs

  // Reconnect or elapsed past total reveal time: snapshot immediately in final revealed state
  if (elapsed >= totalRevealDelay) {
    return {
      stage: "revealed",
      progress: 1,
      isRevealed: true,
      displayPercentages: { ...targetPercentages },
    }
  }

  // Stage 1: Bar & percentage animation 0 -> final (0..barDurationMs)
  if (elapsed < barDurationMs) {
    const rawRatio = barDurationMs > 0 ? elapsed / barDurationMs : 1
    const easedProgress = easeOutCubic(Math.min(1, Math.max(0, rawRatio)))
    const displayPercentages: Record<number, number> = {}

    for (const [key, target] of Object.entries(targetPercentages)) {
      displayPercentages[Number(key)] = Math.round(target * easedProgress)
    }

    return {
      stage: "animating",
      progress: easedProgress,
      isRevealed: false,
      displayPercentages,
    }
  }

  // Stage 2: Brief pause holding final percentages before revealing correctness
  return {
    stage: "paused",
    progress: 1,
    isRevealed: false,
    displayPercentages: { ...targetPercentages },
  }
}

/**
 * Calculates target percentages from raw response counts.
 * Handles multiple-choice (relative to total participants, can exceed 100%),
 * single-choice, and 0-responder scenarios.
 */
export function calculateAggregatePercentages(
  responses: Record<number, number> | number[],
  totalResponders?: number,
): Record<number, number> {
  const responseEntries = Array.isArray(responses)
    ? responses.map((count, idx) => [idx, count] as const)
    : Object.entries(responses).map(
        ([idx, count]) => [Number(idx), count] as const,
      )

  const sumVotes = responseEntries.reduce(
    (acc, [, count]) => acc + (count || 0),
    0,
  )
  const denominator =
    totalResponders !== undefined && totalResponders > 0
      ? totalResponders
      : sumVotes

  const result: Record<number, number> = {}

  if (denominator <= 0) {
    for (const [idx] of responseEntries) {
      result[idx] = 0
    }

    return result
  }

  for (const [idx, count] of responseEntries) {
    const safeCount = count || 0
    result[idx] = Math.round((safeCount / denominator) * 100)
  }

  return result
}
