export interface StoryClock {
  sceneStartedAt?: number
  sceneElapsedMs?: number
  scenePaused?: boolean
}

/** Server pause snapshots survive reconnects; resumed startedAt includes paused time. */
export function storyElapsedSeconds(clock: StoryClock, now = Date.now()) {
  const elapsed = (() => {
    if (clock.scenePaused) {
      return clock.sceneElapsedMs ?? 0
    }

    if (clock.sceneStartedAt === undefined) {
      return clock.sceneElapsedMs ?? 0
    }

    return now - clock.sceneStartedAt
  })()

  return Math.max(0, elapsed / 1000)
}
