import { generateRosterPlayerId, normalizePhoneE164 } from "../../../core/index"
import type { RosterEntry, RosterState } from "./types"

export interface BrowserJoinClaims {
  rosterPlayerId?: string
  phoneE164?: string
  source?: "web" | "phone"
}

export interface BrowserJoinInput {
  clientId: string
  username?: string
  claimsExtra?: BrowserJoinClaims
  isCreatingWorldsShow: boolean
  temporaryGuestsAllowed: boolean
  phoneInviteOnly: boolean
}

export function resolveBrowserJoin(
  state: RosterState,
  {
    clientId,
    username,
    claimsExtra,
    isCreatingWorldsShow,
    temporaryGuestsAllowed,
    phoneInviteOnly,
  }: BrowserJoinInput,
): { entry?: RosterEntry; normalizedPhone: string | null; error?: string } {
  const normalizedPhone = claimsExtra?.phoneE164
    ? normalizePhoneE164(claimsExtra.phoneE164)
    : null

  // 1. Resolve matching roster entry by explicit rosterPlayerId or phoneE164
  let rosterEntry = claimsExtra?.rosterPlayerId
    ? state.entries.get(claimsExtra.rosterPlayerId)
    : undefined

  if (!rosterEntry && normalizedPhone) {
    const matchedId = state.phoneIndex.get(normalizedPhone)

    if (matchedId) {
      rosterEntry = state.entries.get(matchedId)
    }
  }

  // Browser representatives identify their existing public table row by the
  // configured display name. Match only one not-yet-bound pre-registered row;
  // phone/explicit IDs above remain authoritative and connected rows cannot
  // be taken over by another browser.
  if (!rosterEntry && !normalizedPhone && username?.trim()) {
    const normalizedName = username.trim().toLocaleLowerCase()
    const matches = [...state.entries.values()].filter(
      (entry) =>
        entry.preRegistered &&
        entry.displayName.trim().toLocaleLowerCase() === normalizedName,
    )

    if (matches.length === 1) {
      ;[rosterEntry] = matches

      if (
        rosterEntry.status === "connected" &&
        rosterEntry.clientId !== clientId
      ) {
        return { error: "errors:game.playerAlreadyConnected", normalizedPhone }
      }
    }
  }

  // 2. Enforce phoneInviteOnly for unknown phone callers
  if (
    !rosterEntry &&
    isCreatingWorldsShow &&
    !temporaryGuestsAllowed &&
    [...state.entries.values()].some((entry) => entry.preRegistered)
  ) {
    return { error: "errors:game.locked", normalizedPhone }
  }

  if (
    !rosterEntry &&
    (claimsExtra?.source === "phone" || normalizedPhone) &&
    phoneInviteOnly
  ) {
    return { error: "errors:game.locked", normalizedPhone }
  }

  return { entry: rosterEntry, normalizedPhone }
}

export interface BrowserBindingInput {
  rosterEntry?: RosterEntry
  clientId: string
  finalUsername: string
  normalizedPhone: string | null
  claimsExtra?: BrowserJoinClaims
}

export function recordBrowserJoin(
  state: RosterState,
  {
    rosterEntry,
    clientId,
    finalUsername,
    normalizedPhone,
    claimsExtra,
  }: BrowserBindingInput,
): void {
  const now = Date.now()

  if (rosterEntry) {
    rosterEntry.clientId = clientId
    rosterEntry.displayName = finalUsername

    if (normalizedPhone && !rosterEntry.phoneE164) {
      rosterEntry.phoneE164 = normalizedPhone
      state.phoneIndex.set(normalizedPhone, rosterEntry.rosterPlayerId)
    }

    rosterEntry.source =
      claimsExtra?.source ?? (rosterEntry.phoneE164 ? "phone" : "web")
    rosterEntry.status = "connected"
    rosterEntry.timedOut = false
    rosterEntry.lastSeenAt = now
    state.clientIndex.set(clientId, rosterEntry.rosterPlayerId)
  } else {
    const rId = claimsExtra?.rosterPlayerId ?? generateRosterPlayerId()
    const source = claimsExtra?.source ?? (normalizedPhone ? "phone" : "web")
    state.entries.set(rId, {
      rosterPlayerId: rId,
      clientId,
      displayName: finalUsername,
      phoneE164: normalizedPhone,
      source,
      status: "connected",
      timedOut: false,
      points: 0,
      lastSeenAt: now,
      preRegistered: false,
    })
    state.clientIndex.set(clientId, rId)

    if (normalizedPhone) {
      state.phoneIndex.set(normalizedPhone, rId)
    }
  }
}
