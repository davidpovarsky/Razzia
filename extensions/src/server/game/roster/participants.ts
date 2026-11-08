import {
  generateRosterPlayerId,
  normalizePhoneE164,
  type RosterParticipant,
} from "../../../core/index"
import type { RosterPorts, RosterState } from "./types"

export function upsertRosterParticipant(
  state: RosterState,
  ports: RosterPorts,
  input: {
    rosterPlayerId?: string
    displayName: string
    phone?: string | null
  },
): RosterParticipant {
  const trimmedName = input.displayName.trim()

  if (!trimmedName || trimmedName.length > 40) {
    throw new Error("errors:auth.usernameTooShort")
  }

  let phoneE164: string | null = null

  if (input.phone?.trim()) {
    phoneE164 = normalizePhoneE164(input.phone)

    if (!phoneE164) {
      throw new Error("errors:invalidRequest")
    }
  }

  // Check duplicate phone across other entries
  if (phoneE164) {
    const existingOwner = state.phoneIndex.get(phoneE164)

    if (existingOwner && existingOwner !== input.rosterPlayerId) {
      throw new Error("errors:game.playerAlreadyConnected")
    }
  }

  const rId = input.rosterPlayerId ?? generateRosterPlayerId()
  const existing = state.entries.get(rId)

  if (existing) {
    if (existing.phoneE164 && existing.phoneE164 !== phoneE164) {
      state.phoneIndex.delete(existing.phoneE164)
    }

    existing.displayName = trimmedName
    existing.phoneE164 = phoneE164
    existing.phoneRaw = input.phone ?? undefined

    if (phoneE164) {
      state.phoneIndex.set(phoneE164, rId)
    }

    // Also update live Player username if already joined
    if (existing.clientId) {
      const livePlayer = ports.players.findByClientId(existing.clientId)

      if (livePlayer) {
        livePlayer.username = trimmedName
        ports.onPlayerRenamed(livePlayer)
      }
    }
  } else {
    state.entries.set(rId, {
      rosterPlayerId: rId,
      clientId: null,
      displayName: trimmedName,
      phoneE164,
      phoneRaw: input.phone ?? undefined,
      source: phoneE164 ? "phone" : "web",
      status: "not_joined",
      points: 0,
      preRegistered: true,
    })

    if (phoneE164) {
      state.phoneIndex.set(phoneE164, rId)
    }
  }

  ports.onChange()

  return {
    rosterPlayerId: rId,
    displayName: trimmedName,
    phoneE164,
    phoneRaw: input.phone ?? undefined,
  }
}

export function removeRosterParticipant(
  state: RosterState,
  ports: RosterPorts,
  rosterPlayerId: string,
): boolean {
  const existing = state.entries.get(rosterPlayerId)

  if (!existing) {
    return false
  }

  if (existing.phoneE164) {
    state.phoneIndex.delete(existing.phoneE164)
  }

  if (existing.clientId) {
    state.clientIndex.delete(existing.clientId)
    const livePlayer = ports.players.findByClientId(existing.clientId)

    if (livePlayer) {
      ports.kickPlayer(livePlayer.id)
    }
  }

  state.entries.delete(rosterPlayerId)
  ports.onChange()

  return true
}

export function replaceRosterParticipants(
  state: RosterState,
  ports: RosterPorts,
  input: { participants: RosterParticipant[]; phoneInviteOnly?: boolean },
): void {
  const { participants, phoneInviteOnly } = input

  if (phoneInviteOnly !== undefined) {
    ports.setPhoneInviteOnly(phoneInviteOnly)
  }

  // A replacement removes omitted pre-registrations and their stale indices.
  // Ad-hoc players are retained; callers must explicitly kick those if wanted.
  const incomingIds = new Set(participants.map((item) => item.rosterPlayerId))
  const incomingPhones = new Set(
    participants.flatMap((item) =>
      item.phoneE164 ? [normalizePhoneE164(item.phoneE164)] : [],
    ),
  )
  for (const entry of [...state.entries.values()]) {
    if (
      entry.preRegistered &&
      !incomingIds.has(entry.rosterPlayerId) &&
      !incomingPhones.has(entry.phoneE164)
    ) {
      removeRosterParticipant(state, ports, entry.rosterPlayerId)
    }
  }
  for (const item of participants) {
    const normalized = item.phoneE164
      ? normalizePhoneE164(item.phoneE164)
      : null
    const existingByPhone = normalized
      ? state.phoneIndex.get(normalized)
      : undefined
    const targetId = existingByPhone ?? item.rosterPlayerId
    const current = state.entries.get(targetId)

    if (current) {
      if (current.phoneE164 && current.phoneE164 !== normalized) {
        state.phoneIndex.delete(current.phoneE164)
      }

      current.displayName = item.displayName
      current.phoneE164 = normalized
      current.phoneRaw = item.phoneRaw
      current.tableNumber = item.tableNumber
      current.phoneNeedsReview = item.phoneNeedsReview
      current.preRegistered = true

      if (normalized) {
        state.phoneIndex.set(normalized, targetId)
      }

      if (current.clientId) {
        const livePlayer = ports.players.findByClientId(current.clientId)

        if (livePlayer) {
          livePlayer.username = item.displayName
        }
      }
    } else {
      state.entries.set(targetId, {
        rosterPlayerId: targetId,
        clientId: null,
        displayName: item.displayName,
        phoneE164: normalized,
        phoneRaw: item.phoneRaw,
        tableNumber: item.tableNumber,
        phoneNeedsReview: item.phoneNeedsReview,
        source: normalized ? "phone" : "web",
        status: "not_joined",
        points: 0,
        preRegistered: true,
      })

      if (normalized) {
        state.phoneIndex.set(normalized, targetId)
      }
    }
  }

  ports.onChange()
}
