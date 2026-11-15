import type { DemoClockSnapshot } from "../../core/show-library/preview-schemas"

/** Translate a trusted relative demo clock at a transition or resume boundary. */
export function previewVotingDeadline(clock: Pick<DemoClockSnapshot, "elapsedMs" | "deadlineMs">, wallNow: number) {
  if (!Number.isFinite(wallNow) || !Number.isFinite(clock.elapsedMs)) {
    throw new Error("show-preview:invalid-clock")
  }
  if (clock.deadlineMs === null) return null
  if (!Number.isFinite(clock.deadlineMs)) {
    throw new Error("show-preview:invalid-clock")
  }
  const remainingMs = Math.max(0, clock.deadlineMs - clock.elapsedMs)
  return { remainingMs, wallDeadlineMs: wallNow + remainingMs }
}
