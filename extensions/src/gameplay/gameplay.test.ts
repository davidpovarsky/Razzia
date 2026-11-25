import { describe, expect, it } from "vitest"
import { shouldShowLeaderboard } from "./leaderboard"
import {
  assignManual,
  assignRoundRobin,
  projectTeamScores,
  type PlayerScoreInfo,
} from "./teams"

describe("Gameplay Rules & Projections (GAME01-04, TEAM01-03)", () => {
  describe("Leaderboard Decisions (GAME01-04)", () => {
    const defaultPolicy = { mode: "upstream" as const }

    it("GAME01: upstream policy skips between same category, never shows after final question", () => {
      // Category run A, A: should skip between Q0 (cat A) and Q1 (cat A)
      const shouldShowSameCat = shouldShowLeaderboard({
        policy: defaultPolicy,
        gameMode: "quiz",
        currentQuestionIndex: 0,
        totalQuestions: 3,
        currentQuestionId: "q0",
        nextQuestionId: "q1",
        currentCategory: "CatA",
        nextCategory: "CatA",
      })

      expect(shouldShowSameCat).toBe(false)

      // Category change A -> B: should show between Q1 (cat A) and Q2 (cat B)
      const shouldShowDiffCat = shouldShowLeaderboard({
        policy: defaultPolicy,
        gameMode: "quiz",
        currentQuestionIndex: 1,
        totalQuestions: 3,
        currentQuestionId: "q1",
        nextQuestionId: "q2",
        currentCategory: "CatA",
        nextCategory: "CatB",
      })

      expect(shouldShowDiffCat).toBe(true)

      // After final question: never show intermediate leaderboard (final podium handles it)
      const shouldShowAfterFinal = shouldShowLeaderboard({
        policy: defaultPolicy,
        gameMode: "quiz",
        currentQuestionIndex: 2,
        totalQuestions: 3,
        currentQuestionId: "q2",
      })

      expect(shouldShowAfterFinal).toBe(false)
    })

    it("GAME02: everyN=2 across 5 questions displays after q2, q4 only, not q5", () => {
      const everyNPolicy = { mode: "everyN" as const, everyN: 2 }

      // Q1 (index 0) -> false
      expect(
        shouldShowLeaderboard({
          policy: everyNPolicy,
          gameMode: "quiz",
          currentQuestionIndex: 0,
          totalQuestions: 5,
          currentQuestionId: "q1",
        }),
      ).toBe(false)

      // Q2 (index 1) -> true
      expect(
        shouldShowLeaderboard({
          policy: everyNPolicy,
          gameMode: "quiz",
          currentQuestionIndex: 1,
          totalQuestions: 5,
          currentQuestionId: "q2",
        }),
      ).toBe(true)

      // Q3 (index 2) -> false
      expect(
        shouldShowLeaderboard({
          policy: everyNPolicy,
          gameMode: "quiz",
          currentQuestionIndex: 2,
          totalQuestions: 5,
          currentQuestionId: "q3",
        }),
      ).toBe(false)

      // Q4 (index 3) -> true
      expect(
        shouldShowLeaderboard({
          policy: everyNPolicy,
          gameMode: "quiz",
          currentQuestionIndex: 3,
          totalQuestions: 5,
          currentQuestionId: "q4",
        }),
      ).toBe(true)

      // Q5 (index 4, last) -> false (final question never has intermediate board!)
      expect(
        shouldShowLeaderboard({
          policy: everyNPolicy,
          gameMode: "quiz",
          currentQuestionIndex: 4,
          totalQuestions: 5,
          currentQuestionId: "q5",
        }),
      ).toBe(false)
    })

    it("GAME03: selected IDs and manual post-result trigger exact requested stages", () => {
      const selectedPolicy = {
        mode: "selected" as const,
        afterQuestionIds: ["q-special"],
      }

      // Ordinary question
      expect(
        shouldShowLeaderboard({
          policy: selectedPolicy,
          gameMode: "quiz",
          currentQuestionIndex: 0,
          totalQuestions: 4,
          currentQuestionId: "q-regular",
        }),
      ).toBe(false)

      // Selected question
      expect(
        shouldShowLeaderboard({
          policy: selectedPolicy,
          gameMode: "quiz",
          currentQuestionIndex: 1,
          totalQuestions: 4,
          currentQuestionId: "q-special",
        }),
      ).toBe(true)

      // Manual override by manager on ordinary question
      expect(
        shouldShowLeaderboard({
          policy: { mode: "manual" as const },
          gameMode: "quiz",
          currentQuestionIndex: 0,
          totalQuestions: 4,
          currentQuestionId: "q-regular",
          isManualRequested: true,
        }),
      ).toBe(true)
    })

    it("GAME04: survey mode with teams configured never shows scored leaderboard", () => {
      expect(
        shouldShowLeaderboard({
          policy: { mode: "everyN" as const, everyN: 1 },
          gameMode: "survey",
          currentQuestionIndex: 0,
          totalQuestions: 5,
          currentQuestionId: "q0",
        }),
      ).toBe(false)
    })
  })

  describe("Team Balancing & Score Projections (TEAM01-03)", () => {
    const teams = [
      { id: "team-red", name: "Red Dragons", color: "#ff0000" },
      { id: "team-blue", name: "Blue Hawks", color: "#0000ff" },
      { id: "team-green", name: "Green Serpents", color: "#00ff00" },
    ]

    it("TEAM01: 3 teams, 8 players gives deterministic counts 3/3/2 in join order", () => {
      const playerIds = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]

      const assignments = assignRoundRobin(teams, playerIds)

      expect(assignments.get("p1")).toBe("team-red")
      expect(assignments.get("p2")).toBe("team-blue")
      expect(assignments.get("p3")).toBe("team-green")
      expect(assignments.get("p4")).toBe("team-red")
      expect(assignments.get("p5")).toBe("team-blue")
      expect(assignments.get("p6")).toBe("team-green")
      expect(assignments.get("p7")).toBe("team-red")
      expect(assignments.get("p8")).toBe("team-blue")

      const counts = { "team-red": 0, "team-blue": 0, "team-green": 0 }

      for (const tId of assignments.values()) {
        counts[tId as keyof typeof counts] += 1
      }

      expect(counts["team-red"]).toBe(3)
      expect(counts["team-blue"]).toBe(3)
      expect(counts["team-green"]).toBe(2)

      // Test manual assignment update
      const updated = assignManual({
        teams,
        currentAssignments: assignments,
        clientId: "p1",
        teamId: "team-green",
      })

      expect(updated.get("p1")).toBe("team-green")
    })

    it("TEAM02: handles ties deterministically by case-insensitive name then ID", () => {
      const players: PlayerScoreInfo[] = [
        { clientId: "c1", score: 50 },
        { clientId: "c2", score: 50 },
      ]

      const twoTeams = [
        { id: "team-b", name: "Alpha Team", color: "#111" },
        { id: "team-a", name: "alpha team", color: "#222" },
      ]

      const assignments = new Map([
        ["c1", "team-b"],
        ["c2", "team-a"],
      ])

      const projection = projectTeamScores(twoTeams, players, assignments)

      expect(projection[0].points).toBe(50)
      expect(projection[1].points).toBe(50)
      // Same points and case-insensitive name tie: broken by team id ascending ('team-a' < 'team-b')
      expect(projection[0].id).toBe("team-a")
      expect(projection[1].id).toBe("team-b")
    })

    it("TEAM03: retains disconnected player points but removes kicked members from projection", () => {
      const players: PlayerScoreInfo[] = [
        { clientId: "c1", score: 100, isConnected: true },
        // Disconnected, retains earned score
        { clientId: "c2", score: 80, isConnected: false },
        // Kicked, removed from projection
        { clientId: "c3", score: 60, isKicked: true },
      ]

      const twoTeams = [
        { id: "team-red", name: "Red", color: "#ff0000" },
        { id: "team-blue", name: "Blue", color: "#0000ff" },
      ]

      const assignments = new Map([
        ["c1", "team-red"],
        ["c2", "team-red"],
        ["c3", "team-blue"],
      ])

      const projection = projectTeamScores(twoTeams, players, assignments)
      const [red, blue] = projection

      // Red has c1 (100) + c2 (80) = 180 points
      expect(red.id).toBe("team-red")
      expect(red.points).toBe(180)
      expect(red.memberCount).toBe(2)

      // Blue had c3 (60), but c3 was kicked, so Blue has 0 points and 0 active members
      expect(blue.id).toBe("team-blue")
      expect(blue.points).toBe(0)
      expect(blue.memberCount).toBe(0)
    })
  })
})
