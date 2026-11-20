import type { DemoClockSnapshot } from "../../core/show-library/preview-schemas"

/** One monotonic elapsed-time owner; the caller schedules renders, never another timer. */
export function createDemoClock(now: () => number = () => performance.now()) {
  let epoch = 0
  let sequence = 0
  let elapsed = 0
  let anchor = now()
  let paused = true
  let deadline: number | null = null
  const currentElapsed = () =>
    elapsed + (paused ? 0 : Math.max(0, now() - anchor))
  const snapshot = (): DemoClockSnapshot => ({
    epoch,
    sequence,
    elapsedMs: currentElapsed(),
    deadlineMs: deadline,
    paused,
  })

  return {
    snapshot,
    play() {
      if (paused) {
        anchor = now()
        paused = false
        sequence += 1
      }

      return snapshot()
    },
    pause() {
      if (!paused) {
        elapsed = currentElapsed()
        paused = true
        sequence += 1
      }

      return snapshot()
    },
    startVoting(seconds: number, startsAtMs = currentElapsed()) {
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) {
        throw new Error("show-preview:invalid-duration")
      }

      if (!Number.isFinite(startsAtMs) || startsAtMs < 0) {
        throw new Error("show-preview:invalid-time")
      }
      deadline = startsAtMs + seconds * 1000
      sequence += 1

      return snapshot()
    },
    replay() {
      epoch += 1
      sequence += 1
      elapsed = 0
      anchor = now()
      paused = true
      deadline = null

      return snapshot()
    },
    seek(milliseconds: number) {
      if (
        !Number.isFinite(milliseconds) ||
        milliseconds < 0 ||
        milliseconds > 86400000
      ) {
        throw new Error("show-preview:invalid-time")
      }

      elapsed = milliseconds
      anchor = now()
      paused = true
      sequence += 1

      return snapshot()
    },
  }
}
