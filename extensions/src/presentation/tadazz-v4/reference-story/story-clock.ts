export interface StoryClock {
  sceneStartedAt?: number
  sceneElapsedMs?: number
  scenePaused?: boolean
}

/** Server pause snapshots survive reconnects; resumed startedAt includes paused time. */
export function storyElapsedSeconds(clock: StoryClock, now = Date.now()) {
  const elapsed = clock.scenePaused
    ? (clock.sceneElapsedMs ?? 0)
    : clock.sceneStartedAt === undefined
      ? (clock.sceneElapsedMs ?? 0)
      : now - clock.sceneStartedAt
  return Math.max(0, elapsed / 1000)
}
