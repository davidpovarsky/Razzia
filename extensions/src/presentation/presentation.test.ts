import { describe, expect, it } from "vitest"
import {
  assignRoundRobin,
  calculateInterludeRemainingMs,
  processInterludeSkip,
  projectTeamScores,
  resolveAudioCue,
  shouldAutoAdvanceInterlude,
  shouldDuckMusic,
} from "./index"

describe("PRESENTATION & AUDIO Acceptance Cases & Unit Tests", () => {
  describe("AUDIO01 & AUDIO02: Audio Cues & Ducking", () => {
    it("AUDIO01: resolveAudioCue uses default when no custom extras", () => {
      const cue = resolveAudioCue("start")
      expect(cue.url).toBe("/sfx/start.mp3")
      expect(cue.enabled).toBe(true)
      expect(cue.volume).toBe(0.8)
      expect(cue.isDefault).toBe(true)
    })

    it("AUDIO01: resolveAudioCue respects volume=0 or enabled=false (mute)", () => {
      const mutedExtras = {
        cues: {
          start: {
            source: "default" as const,
            volume: 0,
            enabled: true,
            loop: false,
          },
          answersMusic: {
            source: "default" as const,
            volume: 0.8,
            enabled: false,
            loop: true,
          },
          showQuestion: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          answerPressed: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          revealResults: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          leaderboard: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium1: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium2: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium3: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
        },
      }

      const startCue = resolveAudioCue("start", mutedExtras)
      expect(startCue.enabled).toBe(false)
      expect(startCue.volume).toBe(0)

      const musicCue = resolveAudioCue("answersMusic", mutedExtras)
      expect(musicCue.enabled).toBe(false)
    })

    it("AUDIO01: custom safe media URL is respected", () => {
      const customExtras = {
        cues: {
          start: {
            source: "media" as const,
            url: "/media/custom-start.mp3",
            volume: 0.9,
            enabled: true,
            loop: false,
          },
          answersMusic: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: true,
          },
          showQuestion: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          answerPressed: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          revealResults: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          leaderboard: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium1: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium2: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium3: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
        },
      }

      const startCue = resolveAudioCue("start", customExtras)
      expect(startCue.url).toBe("/media/custom-start.mp3")
      expect(startCue.isDefault).toBe(false)
      expect(startCue.volume).toBe(0.9)
    })

    it("AUDIO02: ducks background music when question media has competing audio/video", () => {
      // Background music ducks when video/audio is active
      expect(shouldDuckMusic(true, "answersMusic")).toBe(true)

      // Background music does not duck when question has image or no media
      expect(shouldDuckMusic(false, "answersMusic")).toBe(false)

      // Other cues (like answer button chime) are not ducked
      expect(shouldDuckMusic(true, "answerPressed")).toBe(false)
    })
  })

  describe("INT01 & INT02: Interlude Lifecycle & Snapshot Resume", () => {
    it("INT01: enforces skipping interlude exactly once (idempotent)", () => {
      const initial = { hasSkipped: false }

      // First skip invocation: should emit
      const step1 = processInterludeSkip(initial, 1000)
      expect(step1.shouldEmitSkip).toBe(true)
      expect(step1.state.hasSkipped).toBe(true)

      // Second skip invocation: must NOT emit again
      const step2 = processInterludeSkip(step1.state, 1500)
      expect(step2.shouldEmitSkip).toBe(false)
      expect(step2.state.hasSkipped).toBe(true)
    })

    it("INT01: shouldAutoAdvanceInterlude evaluates accurately", () => {
      const autoInterlude = {
        kind: "countdown" as const,
        durationMs: 5000,
        advance: "auto" as const,
      }

      const manualInterlude = {
        kind: "title" as const,
        durationMs: 5000,
        advance: "manual" as const,
      }

      const startedAt = 10000

      // At 12000 (2000 elapsed < 5000): should not advance
      expect(shouldAutoAdvanceInterlude(autoInterlude, startedAt, 12000)).toBe(
        false,
      )

      // At 15000 (5000 elapsed >= 5000): auto advances
      expect(shouldAutoAdvanceInterlude(autoInterlude, startedAt, 15000)).toBe(
        true,
      )

      // Manual interlude never auto-advances even when duration elapsed
      expect(
        shouldAutoAdvanceInterlude(manualInterlude, startedAt, 16000),
      ).toBe(false)
    })

    it("INT02: reconnect mid-interlude resumes from server startedAt without resetting", () => {
      const startedAt = 100000
      const durationMs = 10000 // 10 seconds total

      // Client reconnects at 104000 (4 seconds elapsed)
      const reconnectTime = 104000
      const remaining = calculateInterludeRemainingMs(
        startedAt,
        durationMs,
        reconnectTime,
      )

      // Remaining must be exactly 6000ms (not reset back to 10000ms!)
      expect(remaining).toBe(6000)
    })

    it("INT02: clamp remaining to 0 if reconnected after interlude ended", () => {
      const startedAt = 100000
      const durationMs = 5000
      const lateReconnect = 110000 // 10s elapsed > 5s

      expect(
        calculateInterludeRemainingMs(startedAt, durationMs, lateReconnect),
      ).toBe(0)
    })
  })

  describe("TEAM01, TEAM02, TEAM03: Team Assignment & Score Projection", () => {
    const teams = [
      { id: "team-red", name: "Red Dragons", color: "#ef4444" },
      { id: "team-blue", name: "Blue Hawks", color: "#3b82f6" },
      { id: "team-green", name: "Green Vipers", color: "#22c55e" },
    ]

    it("TEAM01: 3 teams, 8 players assigned round-robin -> counts 3/3/2", () => {
      const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]
      const assignments = assignRoundRobin(teams, players)

      const redCount = Object.values(assignments).filter(
        (t) => t === "team-red",
      ).length
      const blueCount = Object.values(assignments).filter(
        (t) => t === "team-blue",
      ).length
      const greenCount = Object.values(assignments).filter(
        (t) => t === "team-green",
      ).length

      expect(redCount).toBe(3)
      expect(blueCount).toBe(3)
      expect(greenCount).toBe(2)
    })

    it("TEAM02: handles point ties deterministically (tie by case-insensitive name then ID)", () => {
      const twoTeams = [
        { id: "team-b", name: "Bravo Team", color: "#3b82f6" },
        { id: "team-a", name: "Alpha Team", color: "#ef4444" },
      ]

      const players = [
        { id: "p1", clientId: "c1", username: "Alice", points: 50 },
        { id: "p2", clientId: "c2", username: "Bob", points: 50 },
      ]

      const assignments = {
        c1: "team-b",
        c2: "team-a",
      }

      const result = projectTeamScores(twoTeams, players, assignments)

      expect(result).toHaveLength(2)
      expect(result[0].totalPoints).toBe(50)
      expect(result[1].totalPoints).toBe(50)

      // Both have 50 points -> "Alpha Team" comes before "Bravo Team" alphabetically
      expect(result[0].team.name).toBe("Alpha Team")
      expect(result[1].team.name).toBe("Bravo Team")
      expect(result[0].rank).toBe(1)
      expect(result[1].rank).toBe(1) // Rank tie
    })

    it("TEAM02: stable assignment by clientId across socket reconnect", () => {
      const twoTeams = [{ id: "t1", name: "Team 1", color: "#000" }]
      const assignments = { "stable-client-uuid": "t1" }

      // Player reconnects: new socket id "socket-999", but same clientId
      const player = {
        id: "socket-999",
        clientId: "stable-client-uuid",
        username: "Player 1",
        points: 100,
      }

      const result = projectTeamScores(twoTeams, [player], assignments)
      expect(result[0].totalPoints).toBe(100)
      expect(result[0].memberCount).toBe(1)
    })

    it("TEAM03: disconnected players keep earned points; kicked players are removed", () => {
      const twoTeams = [{ id: "t1", name: "Team 1", color: "#000" }]
      const assignments = {
        c1: "t1",
        c2: "t1",
      }

      // c1 is active (50 pts), c2 is disconnected (40 pts)
      const players = [
        {
          id: "p1",
          clientId: "c1",
          username: "Alice",
          points: 50,
          connected: true,
        },
        {
          id: "p2",
          clientId: "c2",
          username: "Bob",
          points: 40,
          connected: false,
        },
      ]

      const resultWithDisconnected = projectTeamScores(
        twoTeams,
        players,
        assignments,
      )
      // Disconnected Bob retains earned points -> 50 + 40 = 90
      expect(resultWithDisconnected[0].totalPoints).toBe(90)
      expect(resultWithDisconnected[0].memberCount).toBe(2)
      expect(resultWithDisconnected[0].connectedCount).toBe(1)

      // When Bob is kicked, he is removed from player list before next projection
      const playersAfterKick = [players[0]]
      const resultAfterKick = projectTeamScores(
        twoTeams,
        playersAfterKick,
        assignments,
      )
      expect(resultAfterKick[0].totalPoints).toBe(50)
      expect(resultAfterKick[0].memberCount).toBe(1)
    })
  })
})
