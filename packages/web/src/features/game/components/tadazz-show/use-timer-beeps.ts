import { useEffect } from "react"

/** Server-adjusted deadline, never animation completion or a second stopwatch. */
export function useTimerBeeps({
  enabled,
  gameId,
  questionKey,
  epoch,
  startsAt,
  endsAt,
  paused,
}: {
  enabled: boolean
  gameId: string
  questionKey: string | null
  epoch: number
  startsAt?: number
  endsAt?: number
  paused: boolean
}) {
  useEffect(() => {
    const stop = () => {
      window.dispatchEvent(new Event("tadazz:timer-stop"))
    }
    if (!enabled || paused) stop()
    return stop
  }, [enabled, paused, questionKey, epoch])

  useEffect(() => {
    if (!enabled || paused || !questionKey || !endsAt) return
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const now = Date.now()
      if (startsAt && now < startsAt) {
        timer = setTimeout(tick, startsAt - now)
        return
      }
      const remaining = endsAt - now
      const seconds = Math.ceil(remaining / 1000)
      if (seconds <= 0) return
      window.dispatchEvent(
        new CustomEvent("tadazz:sfx", {
          detail: {
            name:
              seconds <= 3
                ? "timer-final"
                : seconds <= 5
                  ? "timer-urgent"
                  : "timer-tick",
            identity: `${gameId}:${epoch}:${questionKey}:timer:${seconds}`,
            volume: seconds <= 3 ? 0.42 : seconds <= 5 ? 0.34 : 0.27,
          },
        }),
      )
      // Skip missed seconds after background throttling; never replay a burst.
      timer = setTimeout(
        tick,
        Math.max(20, remaining - (seconds - 1) * 1000 + 5),
      )
    }
    tick()
    return () => {
      clearTimeout(timer)
    }
  }, [enabled, gameId, questionKey, epoch, startsAt, endsAt, paused])
}
