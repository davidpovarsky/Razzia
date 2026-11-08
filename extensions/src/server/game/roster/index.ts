import type { Player } from "@razzia/common/types/game"
import { normalizePhoneE164, type RosterParticipant } from "../../../core/index"
import {
  upsertRosterParticipant,
  removeRosterParticipant,
  replaceRosterParticipants,
} from "./participants"
import { projectHostPresence } from "./presence"
import type { RosterEntry, RosterPorts, RosterState } from "./types"

/** Per-game downstream identity state. The game supplies authorized player operations. */
export class GameRoster implements RosterState {
  readonly entries = new Map<string, RosterEntry>()
  readonly phoneIndex = new Map<string, string>()
  readonly clientIndex = new Map<string, string>()
  readonly verdicts = new Map<
    string,
    { epoch: number; correct: boolean; points: number }
  >()
  sequence = 0

  private readonly ports: RosterPorts

  constructor(ports: RosterPorts) {
    this.ports = ports
  }

  seed(participants: RosterParticipant[]): void {
    for (const item of participants) {
      const normalized = item.phoneE164
        ? normalizePhoneE164(item.phoneE164)
        : null
      this.entries.set(item.rosterPlayerId, {
        rosterPlayerId: item.rosterPlayerId,
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
        this.phoneIndex.set(normalized, item.rosterPlayerId)
      }
    }
  }

  findByPhone(rawOrE164: string): {
    rosterPlayerId: string
    displayName: string
    phoneE164: string
    clientId: string | null
    status: "not_joined" | "connected" | "disconnected"
    points: number
  } | null {
    const normalized = normalizePhoneE164(rawOrE164)

    if (!normalized) {
      return null
    }

    const rId = this.phoneIndex.get(normalized)

    if (!rId) {
      return null
    }

    const entry = this.entries.get(rId)

    if (!entry?.phoneE164) {
      return null
    }

    return {
      rosterPlayerId: entry.rosterPlayerId,
      displayName: entry.displayName,
      phoneE164: entry.phoneE164,
      clientId: entry.clientId,
      status: entry.status,
      points: entry.points,
    }
  }

  get(rosterPlayerId: string) {
    return this.entries.get(rosterPlayerId) ?? null
  }

  syncScores(): void {
    for (const player of this.ports.players.getAll()) {
      const rId = this.clientIndex.get(player.clientId)

      if (rId) {
        const entry = this.entries.get(rId)

        if (entry) {
          entry.points = player.points
          entry.status = player.connected ? "connected" : "disconnected"
        }
      }
    }
  }

  recordScores(
    players: Array<
      Pick<Player, "clientId" | "points"> & {
        lastCorrect: boolean
        lastPoints: number
      }
    >,
    epoch: number,
  ): void {
    for (const player of players) {
      const id = this.clientIndex.get(player.clientId)

      if (!id) {
        continue
      }

      const entry = this.entries.get(id)

      if (entry) {
        entry.points = player.points
      }

      this.verdicts.set(id, {
        epoch,
        correct: player.lastCorrect,
        points: player.lastPoints,
      })
    }
  }

  upsert(
    input: Parameters<typeof upsertRosterParticipant>[2],
  ): RosterParticipant {
    return upsertRosterParticipant(this, this.ports, input)
  }

  remove(id: string): boolean {
    return removeRosterParticipant(this, this.ports, id)
  }

  replace(participants: RosterParticipant[], phoneInviteOnly?: boolean): void {
    replaceRosterParticipants(this, this.ports, {
      participants,
      phoneInviteOnly,
    })
  }

  snapshot(
    gameId: string,
    phoneInviteOnly: boolean,
    answeredIds: ReadonlySet<string>,
  ) {
    this.syncScores()

    return projectHostPresence(this, this.ports, {
      gameId,
      phoneInviteOnly,
      answeredIds,
      seq: this.sequence,
    })
  }
}
