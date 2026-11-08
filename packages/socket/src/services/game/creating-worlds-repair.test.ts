import {
  createDefaultGameSettings,
  QUIZZ_MODES,
} from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import Game from "@razzia/socket/services/game"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { RoundManager } from "@razzia/socket/services/game/round-manager"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function timerFixture(withTimeline = false) {
  const fake = createFakeIo()
  const players = new PlayerManager({
    io: fake.io,
    gameId: "g",
    gameMode: QUIZZ_MODES.SURVEY,
    getManagerId: () => "manager",
    isStarted: () => false,
  })
  const player = fake.createSocket("p")
  players.join(player, "Representative")
  const statuses: Array<{ name: string; data: Record<string, unknown> }> = []
  const round = new RoundManager({
    io: fake.io,
    gameId: "g",
    players,
    quizz: createQuizz([createQuestion({ time: 20 })], QUIZZ_MODES.SURVEY),
    cooldown: new CooldownTimer(fake.io, "g"),
    getManagerId: () => "manager",
    getSettings: createDefaultGameSettings,
    broadcast: (name, data) => {
      statuses.push({ name, data })
    },
    send: (target, name, data) => {
      if (target === "manager") {
        statuses.push({ name, data })
      }
    },
    onNewQuestion: () => undefined,
    onGameFinished: () => undefined,
    skipQuestionPreview: () => true,
    votingEntranceMs: () => 4000,
    skipShowStartCountdown: () => true,
    onShowStart: (proceed) => proceed(),
    ...(withTimeline
      ? {
          canPreviousTimelineStep: () => ({
            can: true,
            willReopenQuestion: true,
          }),
          onPreviousTimelineStep: () => true,
        }
      : {}),
  })
  void round.start(fake.createSocket("manager"))

  return { round, player, players, statuses }
}

it("opens the complete 20-second window after entrance when nobody answers", async () => {
  const { round, statuses } = timerFixture()
  const start = Date.now()
  expect(statuses.at(-1)?.data).toMatchObject({
    votingStartsAt: start + 4000,
    votingEndsAt: start + 24000,
    time: 20,
  })
  expect(round.isCurrentlyAcceptingAnswers).toBe(false)
  await vi.advanceTimersByTimeAsync(3999)
  expect(round.isCurrentlyAcceptingAnswers).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(round.isCurrentlyAcceptingAnswers).toBe(true)
  expect(round.getRemainingSeconds()).toBe(20)
  await vi.advanceTimersByTimeAsync(19999)
  expect(round.isCurrentlyAcceptingAnswers).toBe(true)
  expect(statuses.at(-1)?.name).toBe(STATUS.SELECT_ANSWER)
  await vi.advanceTimersByTimeAsync(1)
  expect(round.isCurrentlyAcceptingAnswers).toBe(false)
  expect(statuses.at(-1)?.name).toBe(STATUS.SHOW_RESPONSES)
  round.dispose()
})

it("ends early after the only connected player answers", async () => {
  const { round, player, statuses } = timerFixture()
  await vi.advanceTimersByTimeAsync(4000)
  expect(round.selectAnswer(player, [0]).accepted).toBe(true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(round.isCurrentlyAcceptingAnswers).toBe(false)
  expect(statuses.at(-1)?.name).toBe(STATUS.SHOW_RESPONSES)
  round.dispose()
})

it("waits for other connected players but excludes a disconnected player", async () => {
  const { round, player, players, statuses } = timerFixture()
  players.join(createFakeIo().createSocket("second"), "Second")
  await vi.advanceTimersByTimeAsync(4000)
  round.selectAnswer(player, [0])
  await vi.advanceTimersByTimeAsync(1000)
  expect(round.isCurrentlyAcceptingAnswers).toBe(true)
  players.setDisconnected("second")
  round.endIfEveryoneAnswered()
  await vi.advanceTimersByTimeAsync(1000)
  expect(round.isCurrentlyAcceptingAnswers).toBe(false)
  expect(statuses.at(-1)?.name).toBe(STATUS.SHOW_RESPONSES)
  round.dispose()
})

it("pauses both entrance and voting and publishes the new server deadline on resume", async () => {
  const { round, statuses } = timerFixture()
  await vi.advanceTimersByTimeAsync(1000)
  round.pauseGame()
  await vi.advanceTimersByTimeAsync(9000)
  round.resumeGame()
  expect(statuses.at(-1)?.data.votingStartsAt).toBe(Date.now() + 3000)
  await vi.advanceTimersByTimeAsync(3000)
  expect(round.getRemainingSeconds()).toBe(20)
  await vi.advanceTimersByTimeAsync(5000)
  round.pauseGame()
  await vi.advanceTimersByTimeAsync(11000)
  expect(round.getRemainingSeconds()).toBe(15)
  round.resumeGame()
  expect(statuses.at(-1)?.data.votingEndsAt).toBe(Date.now() + 15000)
  await vi.advanceTimersByTimeAsync(15000)
  expect(round.isCurrentlyAcceptingAnswers).toBe(false)
  round.dispose()
})

it("cancels pending entrance when voting is cancelled", async () => {
  const { round } = timerFixture()
  await vi.advanceTimersByTimeAsync(1000)
  round.cancelActiveVote()
  await vi.advanceTimersByTimeAsync(10000)
  expect(round.isCurrentlyAcceptingAnswers).toBe(false)
  round.dispose()
})

it("allows timeline back during question entrance and cancels the pending vote", async () => {
  const { round } = timerFixture(true)
  expect(round.canPrevious().can).toBe(true)
  expect(round.previousScreen()).toBe(true)
  await vi.advanceTimersByTimeAsync(10000)
  expect(round.isCurrentlyAcceptingAnswers).toBe(false)
  round.dispose()
})

it("replaces 40 dummy registrations with 37 real-shaped records, preserves shared tables and rejects duplicate browsers", () => {
  const fake = createFakeIo()
  const game = new Game(fake.io, "manager", createQuizz([createQuestion()]))
  game.replaceRosterParticipants(
    Array.from({ length: 40 }, (_, index) => ({
      rosterPlayerId: `dummy-${index}`,
      displayName: `Dummy ${index}`,
      phoneE164: null,
    })),
  )
  const roster = Array.from({ length: 37 }, (_, index) => ({
    rosterPlayerId: `real-${index}`,
    displayName: `Representative ${index}`,
    phoneE164: `+44770090${String(index).padStart(4, "0")}`,
    tableNumber: index < 31 ? index + 1 : index - 30,
  }))
  game.replaceRosterParticipants(roster, true)
  let presence = game.getHostPresenceSnapshot()
  expect(presence.registeredTotal).toBe(37)
  expect(
    presence.players.every((person) =>
      person.rosterPlayerId.startsWith("real-"),
    ),
  ).toBe(true)
  expect(
    new Set(presence.players.map((person) => person.tableNumber)).size,
  ).toBe(31)
  expect(
    game.join(fake.createSocket("first"), roster[0].displayName),
  ).toBeNull()
  expect(game.join(fake.createSocket("duplicate"), roster[0].displayName)).toBe(
    "errors:game.playerAlreadyConnected",
  )
  expect(
    game.joinOrRebindPhoneCaller({
      callId: "a",
      phoneRaw: roster[31].phoneE164,
    }).ok,
  ).toBe(true)
  expect(
    game.joinOrRebindPhoneCaller({
      callId: "b",
      phoneRaw: roster[31].phoneE164,
    }).reconnected,
  ).toBe(true)
  expect(
    game.joinOrRebindPhoneCaller({
      callId: "unknown",
      phoneRaw: "+447700999999",
    }).ok,
  ).toBe(false)
  presence = game.getHostPresenceSnapshot()
  expect(presence.registeredTotal).toBe(37)
  expect(presence.connectedNow).toBe(2)
  expect(
    presence.players
      .filter((person) => person.status === "connected")
      .map((person) => person.tableNumber),
  ).toEqual([1, 1])
})
