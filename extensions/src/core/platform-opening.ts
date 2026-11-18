/** Product opening: independent of any quiz, show manifest or theme palette. */
export const PLATFORM_CURTAIN_DURATION_MS = 2180
export const PLATFORM_OPENING_VIDEO_DURATION_MS = 7933
export const PLATFORM_OPENING_DURATION_MS =
  PLATFORM_CURTAIN_DURATION_MS + PLATFORM_OPENING_VIDEO_DURATION_MS

export const PLATFORM_CURTAIN_LEFT_URL =
  "/tadazz-show/second-library/curtain-left.png"
export const PLATFORM_CURTAIN_RIGHT_URL =
  "/tadazz-show/second-library/curtain-right.png"

export interface PlatformOpeningSnapshot {
  stage: "standby" | "opening" | "lobby" | "running"
  startedAt: number | null
}

export function readPlatformOpening(
  value: unknown,
): PlatformOpeningSnapshot | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (
    !["standby", "opening", "lobby", "running"].includes(String(record.stage))
  ) {
    return null
  }
  if (
    record.startedAt !== null &&
    (typeof record.startedAt !== "number" || !Number.isFinite(record.startedAt))
  )
    return null
  return {
    stage: record.stage as PlatformOpeningSnapshot["stage"],
    startedAt: record.startedAt as number | null,
  }
}

/** The same server timestamp drives host, projector and reconnects. */
export function platformOpeningFrame(
  launch: PlatformOpeningSnapshot,
  now: number,
  pausedRemainingMs?: number | null,
) {
  const elapsedMs =
    launch.stage !== "opening" || launch.startedAt === null
      ? 0
      : Math.max(
          0,
          Math.min(
            PLATFORM_OPENING_DURATION_MS,
            typeof pausedRemainingMs === "number"
              ? PLATFORM_OPENING_DURATION_MS - pausedRemainingMs
              : now - launch.startedAt,
          ),
        )
  const progress = Math.min(1, elapsedMs / PLATFORM_CURTAIN_DURATION_MS)
  return {
    elapsedMs,
    curtainProgress: progress * progress * (3 - 2 * progress),
    videoElapsedMs: Math.max(0, elapsedMs - PLATFORM_CURTAIN_DURATION_MS),
    videoVisible:
      launch.stage === "opening" && elapsedMs >= PLATFORM_CURTAIN_DURATION_MS,
  }
}
