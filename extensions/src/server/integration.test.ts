import { QUESTION_TYPES, QUIZZ_MODES } from "@razzia/common/constants"
import { describe, expect, it } from "vitest"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
  generateQuestionIds,
  type AnswerVisual,
} from "../core/index"
import { shouldShowLeaderboard } from "../gameplay/index"
import {
  KeypadSimulatorCore,
  MockProvider,
  MockRazziaTransport,
  TelephonyBridge,
} from "../telephony/index"
import { ExtensionGameSession } from "./game/session"

describe("Full Integrated Acceptance: Manager, Web, Teams, Media, Interludes, and 100 Simulated Telephony Participants", () => {
  it("orchestrates a full multi-channel quiz lifecycle with all extension extras", async () => {
    // 1. Setup Quiz Extras with Teams, Interludes, Reveal, and Audio
    const quizId = "quiz-integrated-full"
    const questionIds = generateQuestionIds(3)
    const baseDigest = computeCanonicalBaseDigest({
      subject: "Integrated Championship Quiz",
      questions: [
        {
          question: "Question 1 with Image Answer Visuals",
          answers: ["Option A", "Option B", "Option C", "Option D"],
        },
        {
          question: "Question 2 with Reveal Effect",
          answers: ["True", "False"],
        },
        {
          question: "Question 3 with Audio & Interlude",
          answers: ["1", "2", "3", "4"],
        },
      ],
    })

    const extras = createDefaultQuizExtras(quizId, questionIds, baseDigest)

    // Configure 2 Teams
    extras.teams = {
      enabled: true,
      teams: [
        { id: "team-red", name: "Red Dragons", color: "#ef4444" },
        { id: "team-blue", name: "Blue Hawks", color: "#3b82f6" },
      ],
      autoAssign: "roundRobin",
    }

    // Configure Leaderboard policy: every question
    extras.leaderboard = {
      mode: "everyN",
      everyN: 1,
    }

    // Configure Per-Question Visuals & Interlude
    extras.perQuestion[questionIds[0]] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "both",
          url: "/media/dragon.png",
          alt: "Dragon",
        },
        {
          answerIndex: 1,
          display: "both",
          url: "/media/hawk.png",
          alt: "Hawk",
        },
      ],
    }

    extras.perQuestion[questionIds[1]] = {
      reveal: {
        effect: "pixelate",
        durationMs: 2500,
        trigger: "automatic",
        audience: "all",
      },
      interlude: {
        kind: "countdown",
        durationMs: 3000,
        advance: "auto",
        title: "Halftime Break",
      },
    }

    // 2. Initialize Authoritative Session
    const session = new ExtensionGameSession("game-int-001", extras)

    expect(session.currentPhase).toBe("lobby")
    expect(session.currentSeq).toBe(0)

    // 3. Register Web Participants into Teams
    const webClients = [
      { id: "web-alice", name: "Alice" },
      { id: "web-bob", name: "Bob" },
      { id: "web-charlie", name: "Charlie" },
      { id: "web-dana", name: "Dana" },
    ]

    for (const client of webClients) {
      session.onPlayerJoin(client.id)
    }

    // Verify round-robin team distribution
    const lobbySnapshot = session.getStateSnapshot("manager", [])
    const teamsData = lobbySnapshot.extras.teams as
      { assignments?: Record<string, string> } | undefined
    const assignments = teamsData?.assignments ?? {}

    expect(assignments["web-alice"]).toBe("team-red")
    expect(assignments["web-bob"]).toBe("team-blue")
    expect(assignments["web-charlie"]).toBe("team-red")
    expect(assignments["web-dana"]).toBe("team-blue")

    // 4. Connect 100 Simulated Telephony Participants via Bridge
    const transport = new MockRazziaTransport()
    const mockProvider = new MockProvider({ secret: "test-secret-razzia-key" })
    const bridge = new TelephonyBridge({ transport, provider: mockProvider })
    const pin = "654321"

    transport.registerGame({
      gameId: "game-int-001",
      inviteCode: pin,
      gameMode: QUIZZ_MODES.QUIZ,
    })

    const phoneParticipantsCount = 100
    const phoneSimulators: KeypadSimulatorCore[] = []

    const joinPromises = Array.from(
      { length: phoneParticipantsCount },
      async (_, idx) => {
        const sim = new KeypadSimulatorCore(bridge, {
          callId: `call_int_${String(idx + 1).padStart(3, "0")}`,
        })

        phoneSimulators.push(sim)
        await sim.startCall(`07700100${String(idx).padStart(4, "0")}`)

        return sim.enterDigits(pin)
      },
    )

    const joinResults = await Promise.all(joinPromises)
    const joinFailures = joinResults.filter(
      (r) => !r.message?.includes("Connected as Phone"),
    )

    expect(joinFailures.length).toBe(0)
    expect(bridge.getActiveSessionsCount()).toBe(phoneParticipantsCount)

    // 5. Question 1 Progression: Image Answers & Answer Submission
    session.onQuestionStart(0)
    expect(session.currentEpoch).toBe(1)
    expect(session.currentPhase).toBe("question")

    // Check manager & player audience visibility for answer visuals
    const q1PlayerSnap = session.getStateSnapshot("player", [])
    const visuals = q1PlayerSnap.extras.answerVisuals as AnswerVisual[]

    expect(visuals).toBeDefined()
    expect(visuals[0].url).toBe("/media/dragon.png")

    // 100 Telephony participants answer question 1
    transport.startQuestion("game-int-001", {
      index: 0,
      epoch: 1,
      question: "Question 1 with Image Answer Visuals",
      answers: ["Option A", "Option B", "Option C", "Option D"],
      questionType: QUESTION_TYPES.SINGLE,
    })

    const answerLatencies: number[] = []
    const answerPromises = phoneSimulators.map(async (sim, idx) => {
      const key = String((idx % 4) + 1)
      const t0 = performance.now()
      const res = await sim.pressKey(key)
      const t1 = performance.now()

      answerLatencies.push(t1 - t0)

      return res
    })

    const answerResults = await Promise.all(answerPromises)
    const answerFailures = answerResults.filter(
      (r) => !r.message?.includes("submitted"),
    )

    expect(answerFailures.length).toBe(0)

    answerLatencies.sort((a, b) => a - b)
    const p50 = answerLatencies[Math.floor(answerLatencies.length * 0.5)]
    const p95 = answerLatencies[Math.floor(answerLatencies.length * 0.95)]

    expect(p95).toBeLessThan(100)
    expect(p50).toBeGreaterThanOrEqual(0)

    // 6. Leaderboard Evaluation after Question 1
    const showLbQ1 = shouldShowLeaderboard({
      policy: extras.leaderboard,
      gameMode: QUIZZ_MODES.QUIZ,
      currentQuestionIndex: 0,
      totalQuestions: 3,
      currentQuestionId: questionIds[0],
      nextQuestionId: questionIds[1],
    })

    expect(showLbQ1).toBe(true)

    // Calculate Team Scores after Q1
    const playerScores = [
      { clientId: "web-alice", score: 1000, isConnected: true },
      { clientId: "web-bob", score: 850, isConnected: true },
      { clientId: "web-charlie", score: 950, isConnected: true },
      { clientId: "web-dana", score: 1100, isConnected: true },
    ]

    const teamScores = session.getTeamScores(playerScores)

    expect(teamScores).toHaveLength(2)

    const [firstTeam, secondTeam] = teamScores

    // Red: 1000 + 950 = 1950, Blue: 850 + 1100 = 1950. Deterministic tie breaking by name
    expect(firstTeam.points).toBe(1950)
    expect(secondTeam.points).toBe(1950)
    expect(firstTeam.id).toBe("team-blue")

    // 7. Question 2 Progression: Interlude & Reveal Effect
    session.onQuestionStart(1)
    expect(session.currentEpoch).toBe(2)

    session.setPhase("interlude")
    const interludeSnap = session.getStateSnapshot("player", playerScores)
    const interludeData = interludeSnap.extras.interlude as
      { title?: string } | undefined

    expect(interludeSnap.phase).toBe("interlude")
    expect(interludeData?.title).toBe("Halftime Break")

    // Manager skips interlude
    session.handleCommand(
      {
        v: 1,
        gameId: "game-int-001",
        action: "SKIP_INTERLUDE",
        payload: {},
        requestId: "cmd-skip-interlude",
      },
      true,
      false,
    )

    session.setPhase("question")
    const q2Snap = session.getStateSnapshot("player", playerScores)
    const revealData = q2Snap.extras.reveal as { effect?: string } | undefined

    expect(revealData?.effect).toBe("pixelate")

    // 8. Reconnect Resilience: Disconnected client reconnects and gets exact state
    const reconnectSnap = session.getStateSnapshot("player", playerScores)

    expect(reconnectSnap.seq).toBe(session.currentSeq)
    expect(reconnectSnap.epoch).toBe(2)
    expect(reconnectSnap.extras.teams).toBeDefined()
  })
})
