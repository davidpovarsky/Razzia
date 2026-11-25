// oxlint-disable react/set-state-in-effect -- The browser samples the authoritative room clock.
import { useEffect, useState } from "react"
import { useSocket } from "../contexts/socket-context"

/** Shared by product opening and closing, including late audience connections. */
export function usePlatformClock(active: boolean, paused: boolean) {
  const { socket, isConnected } = useSocket()
  const [now, setNow] = useState(Date.now)
  const [clockOffset, setClockOffset] = useState(0)

  useEffect(() => {
    let alive = true
    let bestRtt = Infinity
    const sample = () => {
      const sent = Date.now()
      socket.emit("extensions:clock", (serverNow) => {
        const received = Date.now()
        const rtt = received - sent

        if (alive && Number.isFinite(serverNow) && rtt < bestRtt) {
          bestRtt = rtt
          setClockOffset(serverNow - (sent + received) / 2)
        }
      })
    }

    if (isConnected) {
      sample()
    }

    const retry = setTimeout(sample, 500)

    return () => {
      alive = false
      clearTimeout(retry)
    }
  }, [socket, isConnected])

  useEffect(() => {
    if (!active || paused) {
      return
    }

    let animationFrame = 0
    const tick = () => {
      setNow(Date.now())
      animationFrame = requestAnimationFrame(tick)
    }
    setNow(Date.now())
    animationFrame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(animationFrame)
  }, [active, paused])

  return { now: now + clockOffset, clockOffset }
}
