import {
  generateRosterPlayerId,
  type HostPlayerStatus,
  type HostPresenceSnapshot,
} from "../../../core/index"
import type { RosterPorts, RosterState } from "./types"

export function projectHostPresence(
  state: RosterState,
  ports: RosterPorts,
  input: {
    gameId: string
    seq: number
    phoneInviteOnly: boolean
    answeredIds: ReadonlySet<string>
  },
): HostPresenceSnapshot {
  const { answeredIds } = input
  const playersList: HostPlayerStatus[] = []

  // Ensure any player in playerManager that wasn't indexed yet is indexed
  for (const p of ports.players.getAll()) {
    let rId = state.clientIndex.get(p.clientId)

    if (!rId) {
      rId = generateRosterPlayerId()
      state.clientIndex.set(p.clientId, rId)
      state.entries.set(rId, {
        rosterPlayerId: rId,
        clientId: p.clientId,
        displayName: p.username,
        phoneE164: null,
        source: "web",
        status: p.connected ? "connected" : "disconnected",
        points: p.points,
        lastSeenAt: Date.now(),
        preRegistered: false,
      })
    }
  }

  let connectedNow = 0
  let disconnectedNow = 0
  let notJoinedNow = 0

  for (const entry of state.entries.values()) {
    const livePlayer = entry.clientId
      ? ports.players.findByClientId(entry.clientId)
      : undefined
    let status: "not_joined" | "connected" | "disconnected" = entry.status

    if (livePlayer) {
      status = livePlayer.connected ? "connected" : "disconnected"
    }

    const points = livePlayer ? livePlayer.points : entry.points
    const answeredCurrentQuestion = livePlayer
      ? answeredIds.has(livePlayer.id)
      : false

    if (status === "connected") {
      connectedNow += 1
    } else if (status === "disconnected") {
      disconnectedNow += 1
    } else {
      notJoinedNow += 1
    }

    playersList.push({
      rosterPlayerId: entry.rosterPlayerId,
      clientId: entry.clientId,
      displayName: livePlayer ? livePlayer.username : entry.displayName,
      phoneE164: entry.phoneE164,
      tableNumber: entry.tableNumber,
      phoneNeedsReview: entry.phoneNeedsReview,
      source: entry.source,
      status,
      timedOut: entry.timedOut,
      points,
      answeredCurrentQuestion,
      lastSeenAt: entry.lastSeenAt,
    })
  }

  return {
    v: 1,
    gameId: input.gameId,
    seq: input.seq,
    phoneInviteOnly: input.phoneInviteOnly,
    registeredTotal: playersList.length,
    connectedNow,
    disconnectedNow,
    notJoinedNow,
    players: playersList,
  }
}
