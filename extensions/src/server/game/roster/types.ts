import type { Player } from "@razzia/common/types/game"

export interface RosterEntry {
  rosterPlayerId: string
  clientId: string | null
  displayName: string
  phoneE164: string | null
  phoneRaw?: string
  tableNumber?: number
  phoneNeedsReview?: boolean
  source: "web" | "phone"
  status: "not_joined" | "connected" | "disconnected"
  timedOut?: boolean
  points: number
  lastSeenAt?: number
  preRegistered: boolean
  activeCallId?: string
}

export interface RosterState {
  entries: Map<string, RosterEntry>
  phoneIndex: Map<string, string>
  clientIndex: Map<string, string>
}

export interface RosterPorts {
  players: {
    getAll(): Player[]
    findByClientId(clientId: string): Player | undefined
  }
  onPlayerRenamed(player: Player): void
  kickPlayer(playerId: string): void
  onChange(): void
  setPhoneInviteOnly(enabled: boolean): void
}
