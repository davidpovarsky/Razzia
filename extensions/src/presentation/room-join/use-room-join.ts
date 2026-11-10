import { useEffect, useState } from "react"
import type { ExtensionStateEnvelope } from "../../core"
import { resolveRoomJoin, validRoomPin, type RoomJoinInput } from "./contract"

type Input = Omit<RoomJoinInput, "origin" | "role" | "locked"> & {
  origin?: string
  role?: RoomJoinInput["role"]
  managerLocked?: boolean
  envelope?: ExtensionStateEnvelope | null
}
/** Existing public check only; no player join, manager command or accepted cookie. */
export function useRoomJoin({ managerLocked, envelope, ...input }: Input) {
  const origin =
    input.origin ??
    (typeof window === "undefined" ? "" : window.location.origin)
  const pin = validRoomPin(input.inviteCode)
  const [observed, setObserved] = useState<{
    pin?: string
    origin?: string
    locked?: boolean
  }>({})
  useEffect(() => {
    if (managerLocked !== undefined || !pin || !origin) return
    let alive = true,
      inFlight = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const probe = async () => {
      if (!alive || inFlight) return
      if (document.hidden) {
        timer = setTimeout(() => void probe(), 3000)
        return
      }
      inFlight = true
      controller = new AbortController()
      const deadline = setTimeout(() => controller?.abort(), 8000)
      let locked: boolean | undefined
      try {
        const response = await fetch(new URL("/api/games/check", origin), {
          method: "POST",
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteCode: pin }),
        })
        if (response.ok) locked = false
        else if (response.status === 403) {
          const body = (await response.json()) as { error?: string }
          if (body.error === "errors:game.locked") locked = true
        }
      } catch {
        /* Unknown is explicit and never reuses a previous room's QR. */
      } finally {
        clearTimeout(deadline)
        inFlight = false
      }
      if (alive) {
        setObserved({ pin, origin, locked })
        timer = setTimeout(
          () => void probe(),
          locked === undefined ? 5000 : 3000,
        )
      }
    }
    const visible = () => {
      clearTimeout(timer)
      if (!document.hidden) {
        setObserved({ pin, origin })
        void probe()
      }
    }
    document.addEventListener("visibilitychange", visible)
    setObserved({ pin, origin })
    void probe()
    return () => {
      alive = false
      controller?.abort()
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [managerLocked, pin, origin])
  const participation = envelope?.extras.participation as
    { connected?: unknown } | undefined
  return resolveRoomJoin({
    ...input,
    origin,
    role: input.role ?? (managerLocked === undefined ? "spectator" : "manager"),
    locked:
      managerLocked ??
      (observed.pin === pin && observed.origin === origin
        ? observed.locked
        : undefined),
    directory: input.directory ?? envelope?.extras.lobbyFullShow,
    connectedCount:
      input.connectedCount ??
      (typeof participation?.connected === "number"
        ? participation.connected
        : undefined),
  })
}
