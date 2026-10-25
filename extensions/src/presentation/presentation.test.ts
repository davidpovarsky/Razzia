import { describe, expect, it } from "vitest"
import {
  assignRoundRobin,
  calculateInterludeRemainingMs,
  formatHistoryItem,
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
      expect(cue.url).toBe("/sounds/boump.mp3")
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
      // 10 seconds total
      const durationMs = 10000

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
      // 10s elapsed > 5s
      const lateReconnect = 110000

      expect(
        calculateInterludeRemainingMs(startedAt, durationMs, lateReconnect),
      ).toBe(0)
    })

    it("INT03: validates all 4 interlude screen kinds (title, image, video, countdown)", () => {
      const kinds = ["title", "image", "video", "countdown"] as const
      for (const kind of kinds) {
        const item = {
          kind,
          title: `Interlude ${kind}`,
          url:
            kind === "image" || kind === "video"
              ? `/media/test.${kind === "image" ? "png" : "mp4"}`
              : undefined,
          durationMs: 5000,
          advance: "auto" as const,
        }
        expect(item.kind).toBe(kind)
        expect(item.durationMs).toBe(5000)
      }
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

      let redCount = 0
      let blueCount = 0
      let greenCount = 0

      for (const t of Object.values(assignments)) {
        if (t === "team-red") {
          redCount += 1
        } else if (t === "team-blue") {
          blueCount += 1
        } else if (t === "team-green") {
          greenCount += 1
        }
      }

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
      // Rank tie
      expect(result[1].rank).toBe(1)
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

      // C1 is active (50 pts), c2 is disconnected (40 pts)
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

  describe("HIST01: formatHistoryItem Data Contract Robustness", () => {
    it("safely handles null, undefined, primitives, or empty objects", () => {
      expect(formatHistoryItem(null)).toBeNull()
      expect(formatHistoryItem(undefined)).toBeNull()
      expect(formatHistoryItem("invalid")).toBeNull()
      expect(formatHistoryItem(42)).toBeNull()

      const empty = formatHistoryItem({}, 2)
      expect(empty).not.toBeNull()
      expect(empty?.questionText).toBe("")
      expect(empty?.questionType).toBe("single")
      expect(empty?.playerAnswersCount).toBe(0)
      expect(empty?.questionIndex).toBe(2)
    })

    it("formats raw backend QuestionResult (question, type, playerAnswers array)", () => {
      const rawQuestionResult = {
        question: "What is the capital of France?",
        type: "single",
        answers: ["Paris", "Lyon", "Marseille", "Toulouse"],
        solutions: [0],
        playerAnswers: [
          { playerName: "Alice", answerIds: [0], correct: true, points: 100 },
          { playerName: "Bob", answerIds: [1], correct: false, points: 0 },
          { playerName: "Charlie", answerIds: [0], correct: true, points: 90 },
        ],
        skipped: false,
      }

      const formatted = formatHistoryItem(rawQuestionResult, 0)
      expect(formatted).not.toBeNull()
      expect(formatted?.questionText).toBe("What is the capital of France?")
      expect(formatted?.questionType).toBe("single")
      expect(formatted?.playerAnswersCount).toBe(3)
      expect(formatted?.answers).toEqual([
        "Paris",
        "Lyon",
        "Marseille",
        "Toulouse",
      ])
      expect(formatted?.solutions).toEqual([0])
      expect(formatted?.skipped).toBe(false)
      expect(formatted?.playerAnswers).toHaveLength(3)
    })

    it("formats HistorySummaryItem contract (questionText, questionType, playerAnswersCount)", () => {
      const summaryItem = {
        questionIndex: 3,
        questionText: "Which elements are noble gases?",
        questionType: "multi",
        playerAnswersCount: 8,
        skipped: true,
        skipReason: "host_skip",
      }

      const formatted = formatHistoryItem(summaryItem)
      expect(formatted?.questionIndex).toBe(3)
      expect(formatted?.questionText).toBe("Which elements are noble gases?")
      expect(formatted?.questionType).toBe("multi")
      expect(formatted?.playerAnswersCount).toBe(8)
      expect(formatted?.skipped).toBe(true)
      expect(formatted?.skipReason).toBe("host_skip")
    })
  })

  describe("INT04: Interlude Drift, Reconnect, Double-Click & Epoch Resilience", () => {
    it("handles clock drift: client clock ahead or behind server", () => {
      const startedAt = 50000
      const durationMs = 10000

      // Client clock is behind server (now < startedAt) -> clamps to full duration
      const behindNow = 48000
      expect(
        calculateInterludeRemainingMs(startedAt, durationMs, behindNow),
      ).toBe(10000)

      // Client clock is far ahead of server (now > startedAt + durationMs) -> clamps to 0
      const aheadNow = 65000
      expect(
        calculateInterludeRemainingMs(startedAt, durationMs, aheadNow),
      ).toBe(0)

      // Normal mid-flight
      const midNow = 54000
      expect(calculateInterludeRemainingMs(startedAt, durationMs, midNow)).toBe(
        6000,
      )
    })

    it("double-click skip idempotency: emits skip action exactly once", () => {
      const state = { hasSkipped: false }

      // First click
      const first = processInterludeSkip(state, 1000)
      expect(first.shouldEmitSkip).toBe(true)
      expect(first.state.hasSkipped).toBe(true)
      const { state: updatedState } = first

      // Second click (double click)
      const second = processInterludeSkip(updatedState, 1050)
      expect(second.shouldEmitSkip).toBe(false)
      expect(second.state.hasSkipped).toBe(true)
    })

    it("manual skip near timeout: safe single invocation", () => {
      const startedAt = 10000
      const durationMs = 5000
      // 50ms before expiry
      const nearTimeout = 14950

      const remaining = calculateInterludeRemainingMs(
        startedAt,
        durationMs,
        nearTimeout,
      )
      expect(remaining).toBe(50)

      const skipResult = processInterludeSkip(
        { hasSkipped: false },
        nearTimeout,
      )
      expect(skipResult.shouldEmitSkip).toBe(true)
      expect(skipResult.state.hasSkipped).toBe(true)
    })
  })
})
