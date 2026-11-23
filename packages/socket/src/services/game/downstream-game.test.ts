// oxlint-disable max-nested-callbacks -- Keep the inherited regression suite grouping and assertion callbacks.
import { QUIZZ_MODES } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import { setup, MANAGER, TICK_MS } from "@razzia/socket/test/game-setup"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("downstream roster identity", () => {
  it("retains earlier question scores after reconnect and checkpoint replay", async () => {
    const first = createQuestion({ solutions: [0], maxPoints: 1000 })
    const second = createQuestion({ solutions: [0], maxPoints: 500 })
    const { game, sockets, createSocket, start, reachAnswers } = setup(
      createQuizz([first, second]),
    )
    const [alice, bob] = sockets
    await start()
    game.selectAnswer(alice, [0])
    game.selectAnswer(bob, [1])
    game.advance()
    await vi.advanceTimersByTimeAsync(TICK_MS)
    const firstScore = game.players.find((p) => p.clientId === "alice")?.points
    expect(firstScore).toBe(1000)
    game.advance()
    game.advance()
    await reachAnswers(second, false)

    // The Q1 checkpoint already contains Q0's scored ledger with the old ID.
    const reconnected = createSocket("alice-new-socket", "alice")
    game.reconnect(reconnected)
    game.selectAnswer(reconnected, [0])
    game.selectAnswer(bob, [1])
    game.advance()
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(game.players.find((p) => p.clientId === "alice")?.points).toBe(1500)

    expect(game.roundManager.replayFromCheckpoint(1)).toBe(true)
    await reachAnswers(second, false)
    expect(game.players.find((p) => p.clientId === "alice")?.points).toBe(1000)
    game.selectAnswer(reconnected, [0])
    game.selectAnswer(bob, [1])
    game.advance()
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(game.players.find((p) => p.clientId === "alice")?.points).toBe(1500)
    game.dispose()
  })

  it("binds a browser representative to the configured table row by exact name", () => {
    const { game, createSocket } = setup(createQuizz([createQuestion()]), [])
    const rosterPlayerId = crypto.randomUUID()
    game.replaceRosterParticipants(
      [
        {
          rosterPlayerId,
          displayName: "Table Representative",
          phoneE164: null,
        },
      ],
      false,
    )

    expect(
      game.join(createSocket("representative"), "table representative"),
    ).toBeNull()
    const presence = game.getHostPresenceSnapshot()

    expect(presence.registeredTotal).toBe(1)
    expect(presence.connectedNow).toBe(1)
    expect(presence.players[0]).toMatchObject({
      rosterPlayerId,
      displayName: "Table Representative",
      status: "connected",
    })
  })
})

describe("mixed quiz + survey gameplay and finish semantics", () => {
  it("in a mixed show ending with a survey question, preserves quiz scoreboard and delivers STATUS.FINISHED podium", async () => {
    const q1 = createQuestion({ solutions: [0], playMode: "quiz" })
    // Last question is survey
    const q2 = createQuestion({ solutions: [], playMode: "survey" })
    const quizz = createQuizz([q1, q2], QUIZZ_MODES.QUIZ)

    const { game, sockets, start, reachAnswers, lastStatus } = setup(quizz, [
      "Alice",
      "Bob",
    ])
    const [alice, bob] = sockets

    // Start game -> reach Q1 answers
    await start()
    // Alice correct
    game.selectAnswer(alice, [0])
    // Bob wrong
    game.selectAnswer(bob, [1])
    // Reveal
    game.advance()
    await vi.advanceTimersByTimeAsync(TICK_MS)
    // Leaderboard
    game.advance()
    await vi.advanceTimersByTimeAsync(TICK_MS)

    // Advance to Q2 (Survey)
    game.advance()
    await reachAnswers(q2, false)

    // Alice and Bob answer survey
    game.selectAnswer(alice, [0])
    game.selectAnswer(bob, [1])
    // Survey reveal
    game.advance()
    await vi.advanceTimersByTimeAsync(TICK_MS)

    // Advance Q2 to finish
    game.advance()
    await vi.advanceTimersByTimeAsync(TICK_MS)

    // Crucial assertion: Manager and Alice receive STATUS.FINISHED with podium, NOT STATUS.SUMMARY!
    expect(lastStatus(MANAGER)?.name).toBe(STATUS.FINISHED)
    expect(lastStatus("alice")?.name).toBe(STATUS.FINISHED)
    const finishedData = lastStatus(MANAGER)?.data as {
      top: Array<{ username: string; points: number }>
    }
    expect(finishedData.top[0].username).toBe("Alice")
    expect(finishedData.top[0].points).toBeGreaterThan(0)
  })

  it("in a pure survey show, delivers STATUS.SUMMARY", async () => {
    const q1 = createQuestion({ solutions: [], playMode: "survey" })
    const quizz = createQuizz([q1], QUIZZ_MODES.SURVEY)

    const { game, sockets, start, lastStatus } = setup(quizz, ["Alice"])
    const [alice] = sockets

    await start()
    game.selectAnswer(alice, [0])
    // Reveal
    game.advance()
    await vi.advanceTimersByTimeAsync(TICK_MS)
    // Finish
    game.advance()
    await vi.advanceTimersByTimeAsync(TICK_MS)

    expect(lastStatus(MANAGER)?.name).toBe(STATUS.SUMMARY)
  })

  describe("P0: True Revote and Rescoring via Previous Screen", () => {
    it("reopens question for fresh vote, resets initial votes to 0, restarts timer, and recomputes scores", async () => {
      const q0 = createQuestion({
        time: 20,
        solutions: [0],
        answers: ["Option A", "Option B", "Option C", "Option D", "Option E"],
      })
      const q1 = createQuestion({
        time: 15,
        solutions: [1],
        answers: ["Option 1", "Option 2"],
      })
      const quizz = createQuizz([q0, q1])

      const { game, sockets, start, reachAnswers } = setup(quizz, [
        "Alice",
        "Bob",
      ])
      const [alice, bob] = sockets

      await start()
      expect(game.roundManager.currentQuestionIndex).toBe(0)
      expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(true)

      // Q0 Initial Play: Alice correct (opt 0), Bob wrong (opt 1)
      game.selectAnswer(alice, [0])
      game.selectAnswer(bob, [1])
      expect(game.roundManager.getAnswerCount()).toBe(2)

      // Advance to reveal
      game.advance()
      await vi.advanceTimersByTimeAsync(TICK_MS)
      expect(game.roundManager.currentStepName).toBe("reveal")

      // Test 1: Navigating back from reveal reopens the current question (Q0) for fresh vote!
      const canPrevReveal = game.roundManager.canPrevious()
      expect(canPrevReveal.can).toBe(true)
      expect(canPrevReveal.willReopenQuestion).toBe(true)

      const reopenedReveal = game.roundManager.previousScreen()
      expect(reopenedReveal).toBe(true)

      // Q0 is now reopened for fresh vote!
      await reachAnswers(q0, false)
      expect(game.roundManager.currentQuestionIndex).toBe(0)
      expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(true)
      expect(game.roundManager.getAnswerCount()).toBe(0)

      // Alice and Bob revote on Q0: Alice wrong, Bob correct
      game.selectAnswer(bob, [0])
      game.selectAnswer(alice, [1])
      expect(game.roundManager.getAnswerCount()).toBe(2)

      // Advance Q0 reveal and leaderboard
      game.advance()
      await vi.advanceTimersByTimeAsync(TICK_MS)
      expect(game.roundManager.currentStepName).toBe("reveal")
      game.advance()
      await vi.advanceTimersByTimeAsync(TICK_MS)
      expect(game.roundManager.currentStepName).toBe("leaderboard")

      const bobScoreAfterQ0Revote =
        game.players.find((p) => p.username === "Bob")?.points ?? 0
      expect(bobScoreAfterQ0Revote).toBeGreaterThan(0)

      // Advance to Q1
      game.advance()
      await reachAnswers(q1, false)
      expect(game.roundManager.currentQuestionIndex).toBe(1)
      expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(true)

      // Q1 Play: Alice votes
      game.selectAnswer(alice, [1])
      expect(game.roundManager.getAnswerCount()).toBe(1)

      // Test 2: Navigating back during active Q1 voting cancels Q1 vote and reopens Q0!
      const canPrevActive = game.roundManager.canPrevious()
      expect(canPrevActive.can).toBe(true)
      expect(canPrevActive.willReopenQuestion).toBe(true)
      expect(canPrevActive.answersReceived).toBe(1)

      const reopenedFromActive = game.roundManager.previousScreen()
      expect(reopenedFromActive).toBe(true)

      // Q0 is reopened again!
      await reachAnswers(q0, false)
      expect(game.roundManager.currentQuestionIndex).toBe(0)
      expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(true)
      expect(game.roundManager.getAnswerCount()).toBe(0)

      // Bob's score for Q0 was reset during reopen
      const bobScoreDuringReopen =
        game.players.find((p) => p.username === "Bob")?.points ?? 0
      expect(bobScoreDuringReopen).toBe(0)

      // Final Revote on Q0: Both Alice and Bob correct
      game.selectAnswer(alice, [0])
      game.selectAnswer(bob, [0])
      expect(game.roundManager.getAnswerCount()).toBe(2)

      // Advance to reveal
      game.advance()
      await vi.advanceTimersByTimeAsync(TICK_MS)
      expect(game.roundManager.currentStepName).toBe("reveal")

      // Both now have points
      expect(
        game.players.find((p) => p.username === "Alice")?.points,
      ).toBeGreaterThan(0)
      expect(
        game.players.find((p) => p.username === "Bob")?.points,
      ).toBeGreaterThan(0)
    })
  })
})
