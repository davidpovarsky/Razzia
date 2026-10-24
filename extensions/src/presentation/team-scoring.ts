import type { TeamDefinition } from "@razzia/extensions/core"

export interface PlayerScoreSnapshot {
  id: string
  clientId?: string
  username: string
  points: number
  connected?: boolean
}

export interface ProjectedTeamScore {
  team: TeamDefinition
  totalPoints: number
  memberCount: number
  connectedCount: number
  members: Array<{
    id: string
    username: string
    points: number
    connected: boolean
  }>
  rank: number
}

/**
 * Projects team scores from canonical individual player scores.
 * - Team score is the SUM of points of all assigned members (including disconnected ones).
 * - Sorts teams descending by totalPoints.
 * - Ties broken case-insensitively by team name, then team ID (TEAM02).
 * - Teams with 0 members are permitted with 0 points.
 * - Pure function: never mutates input structures.
 */
export const projectTeamScores = (
  teams: TeamDefinition[],
  players: PlayerScoreSnapshot[],
  // Key: player.clientId (or player.id), value: teamId
  teamAssignments: Record<string, string>,
): ProjectedTeamScore[] => {
  // Initialize projection accumulator for each defined team
  const teamMap = new Map<
    string,
    {
      team: TeamDefinition
      totalPoints: number
      members: Array<{
        id: string
        username: string
        points: number
        connected: boolean
      }>
    }
  >()

  for (const team of teams) {
    teamMap.set(team.id, {
      team,
      totalPoints: 0,
      members: [],
    })
  }

  // Map each player to their assigned team
  for (const player of players) {
    // Prefer stable clientId over ephemeral socket id
    const lookupKey = player.clientId ?? player.id
    const assignedTeamId = teamAssignments[lookupKey]

    if (assignedTeamId) {
      const entry = teamMap.get(assignedTeamId)

      if (entry) {
        entry.totalPoints += player.points
        entry.members.push({
          id: player.id,
          username: player.username,
          points: player.points,
          connected: player.connected ?? true,
        })
      }
    }
  }

  // Sort teams descending by points, tie-break by name then ID
  const projected: ProjectedTeamScore[] = Array.from(teamMap.values())
    .map(({ team, totalPoints, members }) => ({
      team,
      totalPoints,
      memberCount: members.length,
      connectedCount: members.filter((m) => m.connected).length,
      members,
      // Will be computed next
      rank: 1,
    }))
    .sort((a, b) => {
      // 1. Total points descending
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints
      }

      // 2. Case-insensitive team name ascending
      const nameCompare = a.team.name.localeCompare(b.team.name, undefined, {
        sensitivity: "base",
      })

      if (nameCompare !== 0) {
        return nameCompare
      }

      // 3. Team ID ascending
      return a.team.id.localeCompare(b.team.id)
    })

  // Assign ranks (handling ties)
  for (let i = 0; i < projected.length; i += 1) {
    if (i === 0) {
      projected[i].rank = 1
    } else {
      const prev = projected[i - 1]
      const curr = projected[i]

      if (curr.totalPoints === prev.totalPoints) {
        curr.rank = prev.rank
      } else {
        curr.rank = i + 1
      }
    }
  }

  return projected
}

/**
 * Deterministic round-robin team assignment by join order (TEAM01).
 * Assigns players across the defined teams sequentially in round-robin fashion.
 */
export const assignRoundRobin = (
  teams: TeamDefinition[],
  playerKeys: string[],
): Record<string, string> => {
  const assignments: Record<string, string> = {}

  if (teams.length === 0 || playerKeys.length === 0) {
    return assignments
  }

  for (let i = 0; i < playerKeys.length; i += 1) {
    const teamIndex = i % teams.length
    assignments[playerKeys[i]] = teams[teamIndex].id
  }

  return assignments
}
