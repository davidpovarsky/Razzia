import {
  EVENTS,
  NO_TIME_LIMIT,
  QUESTION_LEAD_IN_SECONDS,
} from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { RoundManager } from "@razzia/socket/services/game/round-manager"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import { SECOND_MS } from "@razzia/socket/utils/sleep"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createDefaultQuizExtras, generateQuestionIds } from "../core/index"
import { ExtensionGameSession } from "./game/session"

const activeRounds: RoundManager[] = []

function setup({
  time = 10,
  endOnAllAnswered = false,
  enterVoting = true,
} = {}) {
  const preparationMs = (2 + QUESTION_LEAD_IN_SECONDS) * SECOND_MS
  const fake = createFakeIo()
  const quizz = createQuizz([
    createQuestion({ time, cooldown: 1 }),
    createQuestion({ time, cooldown: 1 }),
  ])
  const ids = generateQuestionIds(quizz.questions.length)
  const session = new ExtensionGameSession(
    "timer-game",
    createDefaultQuizExtras("timer-quiz", ids, "a".repeat(64)),
  )
  let currentRound: RoundManager | null = null
  const players = new PlayerManager({
    io: fake.io,
    gameId: "timer-game",
    gameMode: quizz.gameMode,
    getManagerId: () => "manager",
    isStarted: () => currentRound?.isStarted() ?? false,
  })
  const alice = fake.createSocket("alice")
  const bob = fake.createSocket("bob")
  players.join(alice, "Alice")
  players.join(bob, "Bob")
  const cooldown = new CooldownTimer(fake.io, "timer-game")
  const round = new RoundManager({
    quizz,
    players,
    cooldown,
    io: fake.io,
    gameId: "timer-game",
    getManagerId: () => "manager",
    broadcast: (name, data) => {
      fake.io.to("timer-game").emit(EVENTS.GAME.STATUS, { name, data })

      if (name === STATUS.SELECT_ANSWER) {
        session.setPhase("question")
      }
    },
    send: (target, name, data) => {
      fake.io.to(target).emit(EVENTS.GAME.STATUS, { name, data })

      if (name === STATUS.SHOW_RESPONSES) {
        session.setPhase("responses")
      }
    },
    onNewQuestion: () => session.onQuestionStart(round.currentQuestionIndex),
    onGameFinished: vi.fn(),
    getSettings: () => ({
      answersOnly: false,
      generatedUsernames: false,
      endOnAllAnswered,
      autoAdvance: { enable: false, responsesDelay: 5, leaderboardDelay: 5 },
    }),
    getQuestionId: (index) => ids[index],
    onResultsCalculated: (distribution) =>
      session.setRevealDistribution(distribution),
  })
  currentRound = round
  session.setDelegate({
    endAnswerTimer: () => round.endTimer(),
    getPauseSnapshot: () => round.getPauseSnapshot(),
    isAcceptingAnswers: () => round.isCurrentlyAcceptingAnswers,
  })
  activeRounds.push(round)
  const end = (requestId = "end-timer") =>
    session.handleCommand(
      {
        v: 1,
        gameId: "timer-game",
        action: "END_ANSWER_TIMER",
        payload: { epoch: session.currentEpoch },
        requestId,
      },
      true,
    )
  const results = () =>
    fake
      .events("manager", EVENTS.GAME.STATUS)
      .filter(
        ({ data }) => (data as { name: string }).name === STATUS.SHOW_RESPONSES,
      )

  return {
    round,
    cooldown,
    session,
    players,
    alice,
    bob,
    fake,
    end,
    results,
    preparationMs,
    start: async () => {
      round.startQuestionAtIndex(0)

      if (enterVoting) {
        await vi.advanceTimersByTimeAsync(preparationMs)
        expect(round.isCurrentlyAcceptingAnswers).toBe(true)
        expect(round.getRemainingSeconds()).toBe(
          time === NO_TIME_LIMIT ? 0 : time,
        )
      }
    },
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  activeRounds.splice(0).forEach((round) => {
    round.dispose()
  })
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe("End Answer Timer — Asana 1219846387458576", () => {
  it.each([10, NO_TIME_LIMIT])(
    "locks answers synchronously and reveals before time advances (time=%s)",
    async (time) => {
      const game = setup({ time })
      await game.start()
      game.round.selectAnswer(game.alice, [0])
      const epoch = game.session.currentEpoch
      const now = Date.now()

      expect(game.end()).toMatchObject({ success: true })
      expect(game.round.isCurrentlyAcceptingAnswers).toBe(false)
      expect(game.round.selectAnswer(game.bob, [0])).toMatchObject({
        accepted: false,
        reason: "not_accepting_answers",
      })
      expect(game.cooldown.remaining).toBeNull()
      expect(vi.getTimerCount()).toBe(0)

      await Promise.resolve()
      expect(Date.now()).toBe(now)
      expect(game.results()).toHaveLength(1)
      expect(game.round.currentStepName).toBe("reveal")
      expect(game.round.getVoteCompletionReason()).toBe("manual")
      expect(game.session.currentEpoch).toBe(epoch)
      expect(game.players.findById("alice")?.points).toBeGreaterThan(0)
      expect(game.round.getHistory()).toHaveLength(1)
      expect(game.round.getQuestionLedgerEntry(0)?.answers).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(20 * SECOND_MS)
      expect(game.results()).toHaveLength(1)
      expect(game.round.currentQuestionIndex).toBe(0)
    },
  )

  it("deduplicates the same command and rejects a second click without scoring twice", async () => {
    const game = setup()
    await game.start()
    game.round.selectAnswer(game.alice, [0])
    expect(game.end()).toMatchObject({ success: true })
    expect(game.end()).toMatchObject({ success: true, deduplicated: true })
    expect(() => game.end("second-click")).toThrow("endTimerFailed")
    expect(game.round.endTimer()).toBe(false)

    await Promise.resolve()
    const score = game.players.findById("alice")?.points
    expect(game.results()).toHaveLength(1)
    expect(() => game.end("after-reveal")).toThrow(
      "cannotEndTimerOutsideAnswerPhase",
    )
    await vi.advanceTimersByTimeAsync(SECOND_MS)
    expect(game.results()).toHaveLength(1)
    expect(game.players.findById("alice")?.points).toBe(score)
    expect(game.round.getHistory()).toHaveLength(1)
  })

  it.each(["all-answered-first", "manager-first"] as const)(
    "resolves the %s race exactly once before the next tick",
    async (order) => {
      const game = setup({ endOnAllAnswered: true })
      await game.start()
      game.round.selectAnswer(game.alice, [0])

      if (order === "all-answered-first") {
        game.round.selectAnswer(game.bob, [1])
        expect(game.round.getVoteCompletionReason()).toBe("allAnswered")
        expect(vi.getTimerCount()).toBe(1)
      }

      expect(game.end()).toMatchObject({ success: true })

      if (order === "manager-first") {
        expect(game.round.selectAnswer(game.bob, [1]).accepted).toBe(false)
      }

      expect(vi.getTimerCount()).toBe(0)
      await Promise.resolve()
      expect(game.results()).toHaveLength(1)
      expect(game.round.getQuestionLedgerEntry(0)?.answers).toHaveLength(
        order === "all-answered-first" ? 2 : 1,
      )
      const history = structuredClone(game.round.getHistory())
      await vi.advanceTimersByTimeAsync(2 * SECOND_MS)
      expect(game.results()).toHaveLength(1)
      expect(game.round.getHistory()).toEqual(history)
    },
  )

  it("wins immediately before the natural deadline without a duplicate reveal", async () => {
    const game = setup({ time: 2 })
    await game.start()
    await vi.advanceTimersByTimeAsync(2 * SECOND_MS - 1)
    expect(game.end()).toMatchObject({ success: true })
    const endedAt = Date.now()
    await Promise.resolve()
    expect(game.results()).toHaveLength(1)
    expect(Date.now()).toBe(endedAt)
    await vi.advanceTimersByTimeAsync(SECOND_MS + 1)
    expect(game.results()).toHaveLength(1)
    expect(game.round.getVoteCompletionReason()).toBe("manual")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("leaves a natural completion authoritative when its reveal wins first", async () => {
    const game = setup({ time: 2 })
    await game.start()
    await vi.advanceTimersByTimeAsync(2 * SECOND_MS)
    expect(game.results()).toHaveLength(1)
    expect(game.round.endTimer()).toBe(false)
    expect(() => game.end()).toThrow("cannotEndTimerOutsideAnswerPhase")
    await vi.advanceTimersByTimeAsync(SECOND_MS)
    expect(game.results()).toHaveLength(1)
    expect(game.round.getVoteCompletionReason()).toBe("elapsed")
  })

  it("rejects ending while paused and completes promptly after resume", async () => {
    const game = setup()
    await game.start()
    await vi.advanceTimersByTimeAsync(SECOND_MS / 2)
    expect(game.round.pauseGame()).toBe(true)
    const remaining = game.cooldown.remainingMs
    expect(game.round.endTimer()).toBe(false)
    expect(() => game.end()).toThrow("gamePaused")
    await vi.advanceTimersByTimeAsync(20 * SECOND_MS)
    expect(game.cooldown.remainingMs).toBe(remaining)
    expect(game.results()).toHaveLength(0)
    expect(game.round.resumeGame()).toBe(true)
    expect(game.end()).toMatchObject({ success: true })
    await Promise.resolve()
    expect(game.results()).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not end the lobby, preparation, or question-preview countdown", async () => {
    const game = setup({ enterVoting: false })
    expect(game.round.endTimer()).toBe(false)
    expect(() => game.end()).toThrow("cannotEndTimerOutsideAnswerPhase")
    await game.start()
    expect(game.round.endTimer()).toBe(false)
    await vi.advanceTimersByTimeAsync(2 * SECOND_MS)
    expect(game.fake.lastStatus("timer-game")?.name).toBe(STATUS.SHOW_QUESTION)
    expect(game.round.endTimer()).toBe(false)
    expect(game.results()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(QUESTION_LEAD_IN_SECONDS * SECOND_MS)
    expect(game.round.isCurrentlyAcceptingAnswers).toBe(true)
    expect(game.end()).toMatchObject({ success: true })
    await Promise.resolve()
    expect(game.results()).toHaveLength(1)
  })

  it("does not reveal or score after disposal in the completion microtask race", async () => {
    const game = setup()
    await game.start()
    game.round.selectAnswer(game.alice, [0])
    game.end()
    game.round.dispose()
    await Promise.resolve()
    expect(game.results()).toHaveLength(0)
    expect(game.round.getHistory()).toHaveLength(0)
    expect(game.players.findById("alice")?.points).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(2 * SECOND_MS)
    expect(game.results()).toHaveLength(0)
  })

  it("does not let a completed old waiter close a newly opened question", async () => {
    const game = setup()
    await game.start()
    const epoch = game.session.currentEpoch
    game.end()
    game.round.startQuestionAtIndex(1)
    expect(game.round.isCurrentlyAcceptingAnswers).toBe(false)
    await vi.advanceTimersByTimeAsync(game.preparationMs)
    expect(game.round.isCurrentlyAcceptingAnswers).toBe(true)
    await Promise.resolve()
    expect(game.round.currentQuestionIndex).toBe(1)
    expect(game.session.currentEpoch).toBe(epoch + 1)
    expect(game.round.isCurrentlyAcceptingAnswers).toBe(true)
    expect(game.results()).toHaveLength(0)
    expect(game.round.getHistory(0)).toBeNull()
    expect(game.round.selectAnswer(game.bob, [0]).accepted).toBe(true)
    expect(game.end("new-question-end")).toMatchObject({ success: true })
    await Promise.resolve()
    expect(game.results()).toHaveLength(1)
    expect(game.round.getQuestionLedgerEntry(1)?.answers).toHaveLength(1)
  })

  it("settles a natural-tick/manual race in the same turn without double results", async () => {
    const game = setup({ time: 1 })
    await game.start()
    // Execute the deadline callback, leaving its promise continuation queued.
    vi.advanceTimersByTime(SECOND_MS)
    expect(game.results()).toHaveLength(0)
    expect(game.end()).toMatchObject({ success: true })
    expect(game.round.isCurrentlyAcceptingAnswers).toBe(false)
    await Promise.resolve()
    expect(game.results()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(SECOND_MS)
    expect(game.results()).toHaveLength(1)
    expect(game.round.getHistory()).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps an older deferred abort separate from a newly started countdown", async () => {
    const game = setup({ endOnAllAnswered: true })
    await game.start()
    game.round.selectAnswer(game.alice, [0])
    game.round.selectAnswer(game.bob, [1])
    expect(game.round.getVoteCompletionReason()).toBe("allAnswered")
    game.round.startQuestionAtIndex(1)
    await vi.advanceTimersByTimeAsync(game.preparationMs + SECOND_MS)
    expect(game.results()).toHaveLength(0)
    expect(game.round.isCurrentlyAcceptingAnswers).toBe(true)
    expect(game.cooldown.remaining).toBe(9)
    expect(game.round.selectAnswer(game.bob, [0]).accepted).toBe(true)
    expect(game.end()).toMatchObject({ success: true })
    await Promise.resolve()
    expect(game.results()).toHaveLength(1)
    expect(game.round.getHistory(0)).toBeNull()
    expect(game.round.getQuestionLedgerEntry(1)?.answers).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("preserves the historical deferred abort for ordinary manager advance", async () => {
    const game = setup()
    await game.start()
    game.round.advance()
    expect(game.round.isCurrentlyAcceptingAnswers).toBe(false)
    await Promise.resolve()
    expect(game.results()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(SECOND_MS - 1)
    expect(game.results()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(game.results()).toHaveLength(1)
  })
})
