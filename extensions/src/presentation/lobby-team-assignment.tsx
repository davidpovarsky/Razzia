import type { TeamDefinition } from "@razzia/extensions/core"
import { useState } from "react"
import type { PlayerScoreSnapshot } from "./team-scoring"

export interface LobbyTeamAssignmentProps {
  teams: TeamDefinition[]
  players: PlayerScoreSnapshot[]
  teamAssignments: Record<string, string>
  isManager?: boolean
  isLocked?: boolean
  onReassignTeam?: (_payload: { playerId: string; teamId: string }) => void
  className?: string
}

const clsx = (...classes: unknown[]): string =>
  classes
    .flatMap((c) => {
      if (!c) {
        return []
      }

      if (typeof c === "string") {
        return [c]
      }

      if (Array.isArray(c)) {
        return [clsx(...(c as unknown[]))]
      }

      if (typeof c === "object") {
        return Object.entries(c)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
      }

      return []
    })
    .join(" ")

/**
 * LobbyTeamAssignment renders team rosters in the game lobby.
 * Allows the manager to reassign players between teams prior to game start.
 * Respects locked state once the game has started.
 */
export const LobbyTeamAssignment = ({
  teams,
  players,
  teamAssignments,
  isManager = false,
  isLocked = false,
  onReassignTeam,
  className,
}: LobbyTeamAssignmentProps) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  // Group players by assigned team
  const teamRosters = teams.map((team) => {
    const members = players.filter((p) => {
      const lookup = p.clientId ?? p.id

      return teamAssignments[lookup] === team.id
    })

    return {
      team,
      members,
    }
  })

  // Unassigned players (if any)
  const unassignedPlayers = players.filter((p) => {
    const lookup = p.clientId ?? p.id

    return !teamAssignments[lookup]
  })

  const handlePlayerClick = (playerId: string) => {
    if (!isManager || isLocked) {
      return
    }

    setSelectedPlayerId((current) => (current === playerId ? null : playerId))
  }

  const handleAssignToTeam = (teamId: string) => {
    if (!selectedPlayerId || !isManager || isLocked) {
      return
    }

    onReassignTeam?.({
      playerId: selectedPlayerId,
      teamId,
    })
    setSelectedPlayerId(null)
  }

  return (
    <div
      className={clsx(
        "my-6 flex w-full max-w-5xl flex-col gap-4 rounded-2xl bg-black/30 p-6 backdrop-blur-md",
        className,
      )}
      data-testid="lobby-team-assignment"
    >
      <div className="flex items-center justify-between border-b border-white/20 pb-3">
        <h3 className="text-2xl font-bold text-white">Teams</h3>
        {isManager && !isLocked && (
          <p className="text-xs text-white/70">
            {selectedPlayerId
              ? "Select a team below to reassign"
              : "Click a player to reassign team"}
          </p>
        )}
      </div>

      {/* Grid of Teams */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {teamRosters.map(({ team, members }) => (
          <div
            key={team.id}
            className={clsx(
              "flex flex-col rounded-xl border border-white/10 bg-white/10 p-4 transition-all",
              selectedPlayerId &&
                isManager &&
                !isLocked &&
                "cursor-pointer hover:border-white/50 hover:bg-white/20",
            )}
            onClick={() => {
              if (selectedPlayerId) {
                handleAssignToTeam(team.id)
              }
            }}
            data-testid={`lobby-team-card-${team.id}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="size-3.5 rounded-full ring-2 ring-white/30"
                  style={{ backgroundColor: team.color }}
                  aria-hidden="true"
                />
                <span className="font-extrabold text-white">{team.name}</span>
              </div>
              <span className="text-xs font-semibold text-white/60">
                {members.length} {members.length === 1 ? "player" : "players"}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {members.map((member) => (
                <span
                  key={member.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePlayerClick(member.id)
                  }}
                  className={clsx(
                    "rounded-md px-2 py-0.5 text-sm font-semibold text-white transition-all",
                    selectedPlayerId === member.id
                      ? "bg-amber-500 font-bold text-black ring-2 ring-white"
                      : "bg-black/30 hover:bg-black/50",
                    isManager && !isLocked && "cursor-pointer",
                  )}
                  data-testid={`player-chip-${member.id}`}
                >
                  {member.username}
                </span>
              ))}

              {members.length === 0 && (
                <span className="text-xs text-white/40 italic">Empty team</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Unassigned chips */}
      {unassignedPlayers.length > 0 && (
        <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-3 text-sm text-white/70">
          <span>Unassigned:</span>
          <div className="flex flex-wrap gap-1.5">
            {unassignedPlayers.map((player) => (
              <span
                key={player.id}
                onClick={() => handlePlayerClick(player.id)}
                className={clsx(
                  "rounded-md bg-white/20 px-2 py-0.5 text-xs font-semibold text-white",
                  selectedPlayerId === player.id &&
                    "bg-amber-500 font-bold text-black",
                  isManager && !isLocked && "cursor-pointer",
                )}
              >
                {player.username}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
