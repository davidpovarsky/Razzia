import type { TeamDefinition } from "../core/index"

export interface PlayerScoreInfo {
  clientId: string
  score: number
  isKicked?: boolean
  isConnected?: boolean
}

export interface TeamScoreProjection {
  id: string
  name: string
  color: string
  points: number
  memberCount: number
  memberClientIds: string[]
}

/**
 * Assigns players to teams in a deterministic round-robin order by join order (TEAM01).
 * Association is keyed by stable `player.clientId` (never ephemeral socket.id).
 */
export const assignRoundRobin = (
  teams: TeamDefinition[],
  playerClientIds: string[],
): Map<string, string> => {
  const assignments = new Map<string, string>()

  if (teams.length === 0 || playerClientIds.length === 0) {
    return assignments
  }

  for (let i = 0; i < playerClientIds.length; i += 1) {
    const team = teams[i % teams.length]

    assignments.set(playerClientIds[i], team.id)
  }

  return assignments
}

export interface ManualAssignmentParams {
  teams: TeamDefinition[]
  currentAssignments: Map<string, string>
  clientId: string
  teamId: string
}

/**
 * Reassigns a player to a team manually during the lobby phase.
 * Validates that the target teamId exists.
 */
export const assignManual = (
  params: ManualAssignmentParams,
): Map<string, string> => {
  const { teams, currentAssignments, clientId, teamId } = params
  const teamExists = teams.some((t) => t.id === teamId)

  if (!teamExists) {
    throw new Error(`Cannot assign to non-existent team ID: ${teamId}`)
  }

  const updated = new Map(currentAssignments)

  updated.set(clientId, teamId)

  return updated
}

/**
 * Projects team scores as a pure function from canonical individual player scores.
 *
 * Rules:
 * - Never mutates original player scores.
 * - Kicked members are removed from projection (TEAM03).
 * - Disconnected members retain earned scores and remain in their team (TEAM03).
 * - Zero-member teams receive 0 points.
 * - Sort descending by points.
 * - Ties broken by case-insensitive team name, then team ID (TEAM02).
 */
export const projectTeamScores = (
  teams: TeamDefinition[],
  players: PlayerScoreInfo[],
  assignments: Map<string, string>,
): TeamScoreProjection[] => {
  const teamMap = new Map<string, TeamScoreProjection>()

  for (const team of teams) {
    teamMap.set(team.id, {
      id: team.id,
      name: team.name,
      color: team.color,
      points: 0,
      memberCount: 0,
      memberClientIds: [],
    })
  }

  // Active players (excluding kicked members)
  const activePlayers = players.filter((p) => !p.isKicked)

  for (const player of activePlayers) {
    const teamId = assignments.get(player.clientId)

    if (teamId) {
      const projection = teamMap.get(teamId)

      if (projection) {
        projection.points += player.score
        projection.memberCount += 1
        projection.memberClientIds.push(player.clientId)
      }
    }
  }

  const result = Array.from(teamMap.values())

  result.sort((a, b) => {
    // 1. Sort by points descending
    if (b.points !== a.points) {
      return b.points - a.points
    }

    // 2. Tie break: case-insensitive name ascending
    const nameDiff = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    })

    if (nameDiff !== 0) {
      return nameDiff
    }

    // 3. Tie break: team ID ascending
    return a.id.localeCompare(b.id)
  })

  return result
}
