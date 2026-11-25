// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import { PlatformButton } from "./platform-controls"
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
  t?: (
    _key: string,
    _optionsOrFallback?: Record<string, unknown> | string,
    _fallback?: string,
  ) => string
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
 * - Keyboard operable: proper buttons with Enter/Space support and focus indicators
 * - Accessible aria-pressed and aria-disabled semantics
 * - Fully localized across all 8 languages via i18next
 */
export const LobbyTeamAssignment = ({
  teams,
  players,
  teamAssignments,
  isManager = false,
  isLocked = false,
  onReassignTeam,
  className,
  t,
}: LobbyTeamAssignmentProps) => {
  const tr = (
    key: string,
    optionsOrFallback?: Record<string, unknown> | string,
    fallback?: string,
  ): string => {
    if (!t) {
      if (typeof optionsOrFallback === "string") {
        return optionsOrFallback
      }

      return fallback ?? key
    }

    if (typeof optionsOrFallback === "string") {
      return t(`extensions:${key}`, optionsOrFallback)
    }

    return t(`extensions:${key}`, optionsOrFallback, fallback)
  }

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

  // Unassigned players
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
        <h3 className="text-2xl font-bold text-white">
          {tr("tabs.teams", "Teams")}
        </h3>
        {isManager && !isLocked && (
          <p className="text-xs text-white/70">
            {selectedPlayerId
              ? tr("teams.reassignHint", "Select a team below to reassign")
              : tr("teams.clickPlayerHint", "Click a player to reassign team")}
          </p>
        )}
      </div>

      {/* Grid of Teams */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {teamRosters.map(({ team, members }) => {
          const isTargetable = Boolean(
            selectedPlayerId && isManager && !isLocked,
          )

          return (
            <div
              key={team.id}
              className={clsx(
                "relative flex flex-col rounded-xl border border-white/10 bg-white/10 p-4 transition-all",
                isTargetable &&
                  "hover:border-primary/60 focus:ring-primary cursor-pointer hover:bg-white/20 focus:ring-2 focus:outline-none",
              )}
              data-testid={`lobby-team-card-${team.id}`}
            >
              {isTargetable && (
                <PlatformButton
                  type="button"
                  size="sm"
                  className="absolute inset-0 size-full border-0 bg-transparent p-0 hover:bg-white/10"
                  data-testid={`lobby-team-target-${team.id}`}
                  onClick={() => handleAssignToTeam(team.id)}
                  aria-label={
                    isTargetable
                      ? tr(
                          "teams.assignToTeam",
                          { teamName: team.name },
                          `Assign selected player to ${team.name}`,
                        )
                      : undefined
                  }
                />
              )}
              <div className="pointer-events-none relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="size-3.5 rounded-full ring-2 ring-white/30"
                    style={{ backgroundColor: team.color }}
                    aria-hidden="true"
                  />
                  <span className="font-extrabold text-white">{team.name}</span>
                </div>
                <span className="text-xs font-semibold text-white/60">
                  {members.length}{" "}
                  {members.length === 1
                    ? tr("teams.player", "player")
                    : tr("teams.players", "players")}
                </span>
              </div>

              <div className="pointer-events-none relative mt-3 flex flex-wrap gap-1.5">
                {members.map((member) => {
                  const isSelected = selectedPlayerId === member.id

                  return (
                    <PlatformButton
                      size="sm"
                      key={member.id}
                      type="button"
                      disabled={!isManager || isLocked}
                      aria-pressed={isSelected}
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePlayerClick(member.id)
                      }}
                      className={clsx(
                        "focus:ring-primary pointer-events-auto rounded-md px-2.5 py-1 text-sm font-semibold text-white transition-all focus:ring-2 focus:outline-none disabled:opacity-100",
                        isSelected
                          ? "bg-primary font-bold text-white ring-2 ring-white"
                          : "bg-black/30 hover:bg-black/50",
                        isManager && !isLocked
                          ? "cursor-pointer"
                          : "cursor-default",
                      )}
                      data-testid={`player-chip-${member.id}`}
                    >
                      {member.username}
                    </PlatformButton>
                  )
                })}

                {members.length === 0 && (
                  <span className="text-xs text-white/40 italic">
                    {tr("teams.emptyTeam", "Empty team")}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Unassigned chips */}
      {unassignedPlayers.length > 0 && (
        <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-3 text-sm text-white/70">
          <span>{tr("teams.unassignedPrefix", "Unassigned:")}</span>
          <div className="flex flex-wrap gap-1.5">
            {unassignedPlayers.map((player) => {
              const isSelected = selectedPlayerId === player.id

              return (
                <PlatformButton
                  size="sm"
                  key={player.id}
                  type="button"
                  disabled={!isManager || isLocked}
                  aria-pressed={isSelected}
                  onClick={() => handlePlayerClick(player.id)}
                  className={clsx(
                    "focus:ring-primary rounded-md bg-white/20 px-2.5 py-1 text-xs font-semibold text-white transition-all focus:ring-2 focus:outline-none",
                    isSelected
                      ? "bg-primary font-bold text-white ring-2 ring-white"
                      : "hover:bg-white/30",
                    isManager && !isLocked
                      ? "cursor-pointer"
                      : "cursor-default",
                  )}
                  data-testid={`unassigned-chip-${player.id}`}
                >
                  {player.username}
                </PlatformButton>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
