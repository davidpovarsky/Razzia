import {PlatformButton} from "../../presentation/platform-controls"
import type { QuizExtrasV1, TeamDefinition } from "@razzia/extensions/core"
import { Plus, Trash2 } from "lucide-react"
import { DEFAULT_TEAM_PALETTE } from "./utils"

interface Props {
  extras: QuizExtrasV1
  onChange: (_updated: QuizExtrasV1) => void
  tr: (_key: string, _fallback: string) => string
}

export const TeamsSection = ({ extras, onChange, tr }: Props) => {
  const { teams: teamsData } = extras
  const isEnabled = teamsData.enabled
  const teamsList: TeamDefinition[] = teamsData.teams

  const handleToggleTeams = (enabled: boolean) => {
    onChange({
      ...extras,
      teams: {
        enabled,
        autoAssign: "roundRobin",
        teams:
          teamsList.length >= 2
            ? teamsList
            : [
                {
                  id: "team-1",
                  name: tr("teams.redTeam", "Red Team"),
                  color: DEFAULT_TEAM_PALETTE[0],
                },
                {
                  id: "team-2",
                  name: tr("teams.blueTeam", "Blue Team"),
                  color: DEFAULT_TEAM_PALETTE[1],
                },
              ],
      },
    })
  }

  const handleAddTeam = () => {
    if (teamsList.length >= 12) {
      return
    }

    const nextIdx = teamsList.length + 1
    const newTeam: TeamDefinition = {
      id: `team-${Date.now()}-${nextIdx}`,
      name: tr("teams.teamNumbered", `Team ${nextIdx}`).replace(
        "{{num}}",
        String(nextIdx),
      ),
      color: DEFAULT_TEAM_PALETTE[(nextIdx - 1) % DEFAULT_TEAM_PALETTE.length],
    }

    onChange({
      ...extras,
      teams: {
        enabled: true,
        autoAssign: "roundRobin",
        teams: [...teamsList, newTeam],
      },
    })
  }

  const handleRemoveTeam = (teamId: string) => {
    if (teamsList.length <= 2) {
      return
    }

    onChange({
      ...extras,
      teams: {
        enabled: isEnabled,
        autoAssign: "roundRobin",
        teams: teamsList.filter((t) => t.id !== teamId),
      },
    })
  }

  const handleUpdateTeam = (
    teamId: string,
    updates: Partial<TeamDefinition>,
  ) => {
    onChange({
      ...extras,
      teams: {
        enabled: isEnabled,
        autoAssign: "roundRobin",
        teams: teamsList.map((t) =>
          t.id === teamId ? { ...t, ...updates } : t,
        ),
      },
    })
  }

  return (
    <div className="flex flex-col gap-6" data-testid="panel-teams">
      <div>
        <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          {tr("teams.title", "Team Configuration")}
        </h3>
        <p className="text-xs text-neutral-500">
          {tr(
            "teams.description",
            "Configure 2 to 12 teams. Scores are dynamically projected from individual player scores.",
          )}
        </p>
      </div>

      <div className="border-border bg-card/60 flex flex-col gap-4 rounded-xl border p-4">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => handleToggleTeams(e.target.checked)}
            className="accent-primary size-4 rounded"
            data-testid="toggle-teams"
          />
          <span className="text-foreground text-sm font-bold">
            {tr("teams.enableTeams", "Enable Team Mode")}
          </span>
        </label>

        {isEnabled && (
          <div className="border-border flex flex-col gap-4 border-t pt-4">
            <div className="flex flex-col gap-3">
              {teamsList.map((team, idx) => (
                <div
                  key={team.id}
                  className="border-border bg-background flex items-center gap-3 rounded-lg border p-3"
                  data-testid={`team-row-${team.id}`}
                >
                  <input
                    type="color"
                    value={team.color}
                    onChange={(e) =>
                      handleUpdateTeam(team.id, { color: e.target.value })
                    }
                    className="border-accent size-8 cursor-pointer rounded border"
                    title={tr("teams.teamColor", "Color")}
                  />
                  <input
                    type="text"
                    value={team.name}
                    onChange={(e) =>
                      handleUpdateTeam(team.id, { name: e.target.value })
                    }
                    className="focus:ring-primary border-accent bg-background text-foreground flex-1 rounded-lg border p-1.5 text-xs font-bold focus:ring-2 focus:outline-none"
                    placeholder={tr(
                      "teams.teamNumbered",
                      `Team ${idx + 1}`,
                    ).replace("{{num}}", String(idx + 1))}
                  />
                  {teamsList.length > 2 && (
                    <PlatformButton size="sm"
                      type="button"
                      onClick={() => handleRemoveTeam(team.id)}
                      className="hover:bg-accent rounded-md p-1.5 text-red-500 hover:text-red-700"
                      title={tr("teams.removeTeam", "Remove Team")}
                      aria-label={tr("teams.removeTeam", "Remove Team")}
                    >
                      <Trash2 className="size-4" />
                    </PlatformButton>
                  )}
                </div>
              ))}
            </div>

            {teamsList.length < 12 && (
              <PlatformButton size="sm"
                type="button"
                onClick={handleAddTeam}
                className="hover:bg-accent border-primary/30 bg-primary/10 text-primary flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold shadow-sm transition-all"
                data-testid="add-team-button"
              >
                <Plus className="size-4" />
                {tr("teams.addTeam", "Add Team")}
              </PlatformButton>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
