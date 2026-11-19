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
  stage: "standby" | "opening" | "lobby" | "running" | "closing" | "closed"
  startedAt: number | null
}

export function readPlatformOpening(
  value: unknown,
): PlatformOpeningSnapshot | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const record = value as Record<string, unknown>

  if (
    !["standby", "opening", "lobby", "running", "closing", "closed"].includes(
      String(record.stage),
    )
  ) {
    return null
  }

  if (
    record.startedAt !== null &&
    (typeof record.startedAt !== "number" || !Number.isFinite(record.startedAt))
  ) {
    return null
  }

  return {
    stage: record.stage as PlatformOpeningSnapshot["stage"],
    startedAt: record.startedAt,
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

/** Preserve the established Creating Worlds finale hold and curtain movement. */
export const PLATFORM_CLOSING_HOLD_MS = 6500
export const PLATFORM_CLOSING_DURATION_MS =
  PLATFORM_CLOSING_HOLD_MS + PLATFORM_CURTAIN_DURATION_MS

/** Only the final built-in finale hands its curtain to the platform owner. */
export function readTerminalFinaleStartedAt(value: unknown): number | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const step = value as Record<string, unknown>
  const scene = step.scene as Record<string, unknown> | undefined

  return scene?.kind === "animation" &&
    scene.preset === "grand-finale" &&
    typeof step.stepIndex === "number" &&
    Number.isInteger(step.stepIndex) &&
    typeof step.totalSteps === "number" &&
    step.totalSteps > 0 &&
    step.stepIndex === step.totalSteps - 1 &&
    typeof step.startedAt === "number" &&
    Number.isFinite(step.startedAt)
    ? step.startedAt
    : null
}

/** CSS cubic-bezier(.62,.02,.13,1), evaluated so reconnects and pauses seek exactly. */
export function platformClosingFrame(elapsed: number) {
  const elapsedMs = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0)
  const progress = Math.max(
    0,
    Math.min(
      1,
      (elapsedMs - PLATFORM_CLOSING_HOLD_MS) / PLATFORM_CURTAIN_DURATION_MS,
    ),
  )
  let curtainProgress = progress

  if (progress > 0 && progress < 1) {
    let low = 0
    let high = 1

    for (let iteration = 0; iteration < 18; iteration += 1) {
      const t = (low + high) / 2
      const x =
        3 * (1 - t) * (1 - t) * t * 0.62 +
        3 * (1 - t) * t * t * 0.13 +
        t * t * t

      if (x < progress) {
        low = t
      } else {
        high = t
      }
    }

    const t = (low + high) / 2
    curtainProgress =
      3 * (1 - t) * (1 - t) * t * 0.02 + 3 * (1 - t) * t * t + t * t * t
  }

  return {
    elapsedMs,
    curtainProgress,
    closed: elapsedMs >= PLATFORM_CLOSING_DURATION_MS,
  }
}
