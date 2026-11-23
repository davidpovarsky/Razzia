import type { PreviewPhase, PreviewRole } from "./primitives"

const revealPhases: readonly PreviewPhase[] = ["results"]
const bindingRules: Partial<
  Record<
    string,
    { roles: readonly PreviewRole[]; phases: readonly PreviewPhase[] }
  >
> = {
  "choice-results": {
    roles: ["manager", "player", "spectator"],
    phases: revealPhases,
  },
  "selected-choices": { roles: ["player"], phases: ["voting", "voteLocked"] },
  "personal-result": { roles: ["player"], phases: ["personalResult"] },
  "vote-progress": {
    roles: ["manager", "spectator"],
    phases: ["voting", "voteLocked", "results"],
  },
  question: {
    roles: ["manager", "player", "spectator"],
    phases: ["question", "answerCards", "voting", "voteLocked", "results"],
  },
  choices: {
    roles: ["manager", "player", "spectator"],
    phases: ["answerCards", "voting", "voteLocked", "results"],
  },
  join: {
    roles: ["manager", "player", "spectator"],
    phases: ["opening", "lobby"],
  },
  "phone-instructions": {
    roles: ["manager", "player", "spectator"],
    phases: ["opening", "lobby", "interlude"],
  },
  clock: {
    roles: ["manager", "player", "spectator"],
    phases: ["question", "answerCards", "voting", "voteLocked", "interlude"],
  },
  leaderboard: {
    roles: ["manager", "player", "spectator"],
    phases: ["leaderboard", "closing"],
  },
  story: { roles: ["manager", "spectator"], phases: ["interlude", "closing"] },
  recap: { roles: ["manager", "spectator"], phases: ["interlude", "results"] },
  tie: { roles: ["manager", "spectator"], phases: ["interlude", "results"] },
  estimation: {
    roles: ["manager", "player", "spectator"],
    phases: ["answerCards", "voting", "voteLocked", "results"],
  },
}

export function bindingAllowed(
  binding: string,
  role: PreviewRole,
  phase: PreviewPhase,
): boolean {
  const rule = bindingRules[binding]

  return !rule || (rule.roles.includes(role) && rule.phases.includes(phase))
}
