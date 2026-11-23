import { describe, expect, it } from "vitest"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
  createDefaultRosterExtras,
  generateQuestionIds,
} from "../core/index"
import { ExtensionGameSession } from "./game/session"

describe("ExtensionGameSession Lifecycle & State Authority (INT01-02, MEDIA03, SEC01)", () => {
  const quizId = "quiz-test-1"
  const qIds = generateQuestionIds(3)
  const digest = computeCanonicalBaseDigest({ subject: "Test Quiz" })
  const extras = createDefaultQuizExtras(quizId, qIds, digest)

  // Configure rich extras
  extras.teams = {
    enabled: true,
    teams: [
      { id: "team-a", name: "Alpha", color: "#f00" },
      { id: "team-b", name: "Beta", color: "#00f" },
    ],
    autoAssign: "roundRobin",
  }

  extras.perQuestion[qIds[0]] = {
    reveal: {
      effect: "blur",
      durationMs: 3000,
      trigger: "automatic",
      audience: "all",
    },
    interlude: {
      kind: "title",
      title: "Round 1 Interlude",
      durationMs: 5000,
      advance: "auto",
    },
    answerVisuals: [
      {
        answerIndex: 0,
        display: "image",
        url: "/media/pic.png",
        alt: "Picture",
      },
    ],
  }

  // Audience is manager only for question 1
  extras.perQuestion[qIds[1]] = {
    reveal: {
      effect: "tiles",
      durationMs: 2000,
      trigger: "manual",
      audience: "manager",
    },
  }

  it("maintains monotonic seq and per-question epoch across state transitions", () => {
    const session = new ExtensionGameSession("game-1", extras)

    expect(session.currentSeq).toBe(0)
    expect(session.currentEpoch).toBe(0)
    expect(session.currentPhase).toBe("lobby")

    // Question 1 start
    session.onQuestionStart(0)

    expect(session.currentEpoch).toBe(1)
    expect(session.currentSeq).toBe(1)
    expect(session.currentPhase).toBe("question")

    // Phase transition to answers
    session.setPhase("answers")

    expect(session.currentSeq).toBe(2)
    expect(session.currentEpoch).toBe(1)

    // Phase transition to responses
    session.setPhase("responses")

    expect(session.currentSeq).toBe(3)

    // Question 2 start
    session.onQuestionStart(1)

    expect(session.currentEpoch).toBe(2)
    expect(session.currentSeq).toBe(4)
  })

  it("filters state snapshot appropriately for manager vs player (audience safety)", () => {
    const session = new ExtensionGameSession("game-1", extras)

    // Q1 has reveal audience: 'manager' only
    session.onQuestionStart(1)

    const managerSnapshot = session.getStateSnapshot("manager", [])
    const playerSnapshot = session.getStateSnapshot("player", [])

    // Manager sees reveal info
    expect(managerSnapshot.extras.reveal).toBeDefined()

    // Player does NOT see reveal info when audience is manager only
    expect(playerSnapshot.extras.reveal).toBeUndefined()
  })

  it("SEC01: rejects unauthorized manager commands", () => {
    const session = new ExtensionGameSession("game-1", extras)

    let thrown: unknown = null

    try {
      session.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "SHOW_LEADERBOARD",
          requestId: "req-1",
        },
        false,
        false,
      )
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeDefined()
    expect((thrown as Error).message).toContain("unauthorized")
  })

  it("MEDIA03 & Deduplication: processes manager commands idempotently", () => {
    const session = new ExtensionGameSession("game-1", extras)

    session.onQuestionStart(0)
    const initialSeq = session.currentSeq

    // Reveal media
    const res1 = session.handleCommand(
      {
        v: 1,
        gameId: "game-1",
        action: "REVEAL_MEDIA",
        payload: { questionId: qIds[0] },
        requestId: "req-reveal-1",
      },
      true,
      false,
    )

    expect(res1.success).toBe(true)
    expect(res1.deduplicated).toBeUndefined()
    expect(session.currentSeq).toBe(initialSeq + 1)

    // Duplicate command with same requestId
    const res2 = session.handleCommand(
      {
        v: 1,
        gameId: "game-1",
        action: "REVEAL_MEDIA",
        payload: { questionId: qIds[0] },
        requestId: "req-reveal-1",
      },
      true,
      false,
    )

    expect(res2.success).toBe(true)
    expect(res2.deduplicated).toBe(true)

    // Seq should not change on duplicate command
    expect(session.currentSeq).toBe(initialSeq + 1)

    // Verify snapshot reflects revealed media
    const snap = session.getStateSnapshot("manager", [])
    const revealExtra = snap.extras.reveal as
      { isRevealed?: boolean } | undefined

    expect(revealExtra?.isRevealed).toBe(true)
  })

  it("INT01-02: handles interlude phase transitions and snapshot on reconnect", () => {
    const session = new ExtensionGameSession("game-1", extras)

    session.onQuestionStart(0)
    session.setPhase("interlude")

    const snap = session.getStateSnapshot("player", [])
    const interludeExtra = snap.extras.interlude as
      { title?: string } | undefined

    expect(snap.phase).toBe("interlude")
    expect(interludeExtra?.title).toBe("Round 1 Interlude")

    // On reconnect, player gets authoritative snapshot with exact current phase
    const reconnectSnap = session.getStateSnapshot("player", [])

    expect(reconnectSnap.phase).toBe("interlude")
    expect(reconnectSnap.seq).toBe(session.currentSeq)
  })

  it("V2 Studio: attaches StudioShowCoordinator, protects player snapshot, and routes ADVANCE_TIMELINE_SCENE", () => {
    const v2Extras = {
      ...extras,
      schemaVersion: 2 as const,
      timeline: [
        { id: "s-open", kind: "opening" as const, sceneId: "scene-1" },
        { id: "s-q1", kind: "question" as const, questionId: qIds[0] },
      ],
      scenes: {
        "scene-1": {
          id: "scene-1",
          kind: "opening" as const,
          title: "Opening Scene",
          durationMs: 4000,
          advance: "auto" as const,
        },
      },
      defaults: {
        newQuestionMode: "quiz" as const,
        leaderboardPolicy: "cardOnly" as const,
        advanceMode: "auto" as const,
      },
      roster: createDefaultRosterExtras(),
    }

    const session = new ExtensionGameSession("game-v2", v2Extras)
    let advanced = false
    let skipped = false

    session.setDelegate({
      advanceTimelineScene: () => {
        advanced = true

        return true
      },
      skipTimelineScene: () => {
        skipped = true

        return true
      },
    })

    // Player snapshot: safe active step, NO full future timeline or scenes
    const playerSnap = session.getStateSnapshot("player", [])
    expect(playerSnap.extras.timeline).toBeUndefined()
    expect(playerSnap.extras.scenes).toBeUndefined()

    // Manager snapshot: has full timeline and scenes
    const managerSnap = session.getStateSnapshot("manager", [])
    expect(managerSnap.extras.timeline).toBeDefined()
    expect(managerSnap.extras.scenes).toBeDefined()

    // Command handling: ADVANCE_TIMELINE_SCENE
    const advRes = session.handleCommand(
      {
        v: 1,
        gameId: "game-v2",
        action: "ADVANCE_TIMELINE_SCENE",
        payload: { sceneId: "scene-1" },
        requestId: "adv-1",
      },
      true,
      false,
    )
    expect(advRes.success).toBe(true)
    expect(advanced).toBe(true)

    // Command handling: SKIP_TIMELINE_SCENE
    const skipRes = session.handleCommand(
      {
        v: 1,
        gameId: "game-v2",
        action: "SKIP_TIMELINE_SCENE",
        payload: { sceneId: "scene-1" },
        requestId: "skip-1",
      },
      true,
      false,
    )
    expect(skipRes.success).toBe(true)
    expect(skipped).toBe(true)
  })
})
