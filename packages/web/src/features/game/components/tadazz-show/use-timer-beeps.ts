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

    if (!enabled || paused) {
      stop()
    }

    return stop
  }, [enabled, paused, questionKey, epoch])

  useEffect(() => {
    if (!enabled || paused || !questionKey || !endsAt) {
      return
    }

    let timer: ReturnType<typeof setTimeout> | undefined = undefined
    const tick = () => {
      const now = Date.now()

      if (startsAt && now < startsAt) {
        timer = setTimeout(tick, startsAt - now)

        return
      }

      const remaining = endsAt - now
      const seconds = Math.ceil(remaining / 1000)

      if (seconds <= 0) {
        return
      }

      window.dispatchEvent(
        new CustomEvent("tadazz:sfx", {
          detail: {
            name: (() => {
              if (seconds <= 3) {
                return "timer-final"
              }

              if (seconds <= 5) {
                return "timer-urgent"
              }

              return "timer-tick"
            })(),
            identity: `${gameId}:${epoch}:${questionKey}:timer:${seconds}`,
            volume: (() => {
              if (seconds <= 3) {
                return 0.42
              }

              if (seconds <= 5) {
                return 0.34
              }

              return 0.27
            })(),
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
