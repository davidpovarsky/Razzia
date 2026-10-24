import type { TeamDefinition } from "@razzia/extensions/core"
import { useState } from "react"
import {
  projectTeamScores,
  type PlayerScoreSnapshot,
  type ProjectedTeamScore,
} from "./team-scoring"

export interface TeamLeaderboardPanelProps {
  teams: TeamDefinition[]
  players: PlayerScoreSnapshot[]
  teamAssignments: Record<string, string>
  myPlayerId?: string
  myClientId?: string
  individualView?: React.ReactNode
  className?: string
}

const clsx = (...classes: unknown[]): string =>
  classes
    .flatMap((c) => {
      if (!c) return []
      if (typeof c === "string") return [c]
      if (Array.isArray(c)) return [clsx(...c)]
      if (typeof c === "object") {
        return Object.entries(c)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
      }
      return []
    })
    .join(" ")

/**
 * TeamLeaderboardPanel displays team standings with dynamic projection from individual scores.
 * Features:
 * - Individual / Teams toggle button
 * - Team rank, name, color swatch, members, and total score
 * - Non-blocking player team badge
 */
export const TeamLeaderboardPanel = ({
  teams,
  players,
  teamAssignments,
  myPlayerId,
  myClientId,
  individualView,
  className,
}: TeamLeaderboardPanelProps) => {
  const [viewMode, setViewMode] = useState<"teams" | "individual">("teams")

  const projectedScores: ProjectedTeamScore[] = projectTeamScores(
    teams,
    players,
    teamAssignments,
  )

  // Find player's current team
  const myKey = myClientId ?? myPlayerId
  const myTeamId = myKey ? teamAssignments[myKey] : undefined
  const myTeamStanding = projectedScores.find((s) => s.team.id === myTeamId)

  return (
    <div
      className={clsx(
        "relative mx-auto flex w-full max-w-4xl flex-col items-center justify-center px-4",
        className,
      )}
      data-testid="team-leaderboard-panel"
    >
      {/* View Toggle: Individual vs Teams */}
      {individualView && (
        <div className="mb-6 flex rounded-xl bg-white/20 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setViewMode("individual")}
            className={clsx(
              "rounded-lg px-6 py-2 font-bold transition-colors",
              viewMode === "individual"
                ? "bg-white text-black shadow-md"
                : "text-white hover:text-white/80",
            )}
            data-testid="toggle-individual-view"
          >
            Individual
          </button>
          <button
            type="button"
            onClick={() => setViewMode("teams")}
            className={clsx(
              "rounded-lg px-6 py-2 font-bold transition-colors",
              viewMode === "teams"
                ? "bg-white text-black shadow-md"
                : "text-white hover:text-white/80",
            )}
            data-testid="toggle-teams-view"
          >
            Teams
          </button>
        </div>
      )}

      {/* Render Individual Leaderboard View if selected */}
      {viewMode === "individual" && individualView ? (
        <div className="w-full">{individualView}</div>
      ) : (
        <div className="flex w-full flex-col gap-3">
          {/* Participant Team Identity Banner */}
          {myTeamStanding && (
            <div
              className="mb-4 flex w-full items-center justify-between rounded-xl border-2 border-white/40 bg-black/40 p-4 text-white shadow-lg backdrop-blur-md"
              data-testid="participant-team-banner"
            >
              <div className="flex items-center gap-3">
                <span
                  className="size-4 rounded-full ring-2 ring-white"
                  style={{ backgroundColor: myTeamStanding.team.color }}
                  aria-hidden="true"
                />
                <div>
                  <span className="text-xs tracking-wider text-white/70 uppercase">
                    Your Team
                  </span>
                  <p className="text-xl font-extrabold">
                    {myTeamStanding.team.name}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs tracking-wider text-white/70 uppercase">
                  Rank #{myTeamStanding.rank}
                </span>
                <p className="text-2xl font-black tabular-nums">
                  {myTeamStanding.totalPoints} pts
                </p>
              </div>
            </div>
          )}

          {/* Team Leaderboard List */}
          <div className="flex flex-col gap-2.5">
            {projectedScores.map(({ team, totalPoints, memberCount, rank }) => (
              <div
                key={team.id}
                className="flex w-full items-center justify-between rounded-xl bg-white/90 p-4 text-black shadow-md transition-all hover:bg-white"
                data-testid={`team-score-row-${team.id}`}
              >
                <div className="flex items-center gap-4">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-black/10 text-lg font-black text-black">
                    #{rank}
                  </span>
                  <span
                    className="size-5 rounded-full ring-2 ring-black/10"
                    style={{ backgroundColor: team.color }}
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-xl font-bold">{team.name}</h3>
                    <span className="text-xs text-neutral-600">
                      {memberCount} {memberCount === 1 ? "member" : "members"}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-3xl font-black text-black tabular-nums">
                    {totalPoints}
                  </span>
                  <span className="ml-1 text-sm font-bold text-neutral-600">
                    pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
