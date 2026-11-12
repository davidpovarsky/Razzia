import { inviteCodeValidator } from "@razzia/common/validators/auth"

export type JoinRole = "manager" | "player" | "spectator"

export interface RoomJoinInput {
  origin: string
  inviteCode?: unknown
  role: JoinRole
  locked?: boolean
  directory?: unknown
  connectedCount?: number
  rosterCount?: number
}

export interface RoomJoin {
  role: JoinRole
  lockState: "checking" | "locked" | "open"
  pending: boolean
  locked: boolean
  pin?: string
  displayPin: string
  webUrl: string
  host: string
  joinUrl?: string
  qrUrl?: string
  dialNumber?: string
  connectedCount?: number
  rosterCount?: number
}

export const validRoomPin = (value: unknown) => {
  const parsed = inviteCodeValidator.safeParse(value)

  return parsed.success ? parsed.data : undefined
}

const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined

/** Whitelist presentation fields. Participant contact fields are never inspected. */
export function resolveRoomJoin(input: RoomJoinInput): RoomJoin {
  const pin = validRoomPin(input.inviteCode)
  let webUrl = "",
    host = "",
    joinUrl: string | undefined = undefined

  try {
    const url = new URL("/game", input.origin)

    if (url.protocol === "https:" || url.protocol === "http:") {
      webUrl = url.href
      host = `${url.host}${url.pathname}`

      if (pin) {
        url.searchParams.set("pin", pin)
        joinUrl = url.href
      }
    }
  } catch {
    /* No URL or QR is fabricated before the browser origin is known. */
  }

  const pending = !pin || !webUrl || input.locked === undefined
  const locked = pending || input.locked === true
  let lockState: RoomJoin["lockState"] = "open"

  if (pending) {
    lockState = "checking"
  } else if (locked) {
    lockState = "locked"
  }

  let displayPin = "—"

  if (pin && !pending) {
    displayPin = locked ? Array.from(pin, () => "#").join("") : pin
  }

  const directory =
    input.directory && typeof input.directory === "object"
      ? (input.directory as { dialNumber?: unknown })
      : undefined
  const dial =
    typeof directory?.dialNumber === "string" ? directory.dialNumber.trim() : ""

  return {
    role: input.role,
    lockState,
    pending,
    locked,
    pin: pending ? undefined : pin,
    displayPin,
    webUrl,
    host,
    joinUrl: locked ? undefined : joinUrl,
    qrUrl: locked ? undefined : joinUrl,
    ...(dial && dial.length <= 100 ? { dialNumber: dial } : {}),
    connectedCount: count(input.connectedCount),
    ...(input.role === "manager"
      ? { rosterCount: count(input.rosterCount) }
      : {}),
  }
}
