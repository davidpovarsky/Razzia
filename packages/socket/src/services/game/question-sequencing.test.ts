import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDefaultGameSettings,
  QUESTION_LEAD_IN_MS,
  QUIZZ_MODES,
} from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import type { Question } from "@razzia/common/types/game"
import { RoundManager } from "./round-manager"
import { CooldownTimer } from "./cooldown-timer"
import { PlayerManager } from "./player-manager"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"

const active: RoundManager[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1000000)
})
afterEach(() => {
  active.splice(0).forEach((round) => {
    round.dispose()
  })
  vi.clearAllTimers()
  vi.useRealTimers()
})

function fixture(cooldown = 15, time = 20, overrides: Partial<Question> = {}) {
  const fake = createFakeIo()
  const players = new PlayerManager({
    io: fake.io,
    gameId: "sequence",
    gameMode: QUIZZ_MODES.QUIZ,
    getManagerId: () => "manager",
    isStarted: () => false,
  })
  const player = fake.createSocket("player")
  players.join(player, "Player")
  const events: Array<{
    name: string
    data: Record<string, unknown>
    at: number
  }> = []
  const round = new RoundManager({
    io: fake.io,
    gameId: "sequence",
    players,
    quizz: createQuizz([
      createQuestion({ cooldown, time, ...overrides }),
      createQuestion({ cooldown, time, ...overrides }),
    ]),
    cooldown: new CooldownTimer(fake.io, "sequence"),
    getManagerId: () => "manager",
    getSettings: createDefaultGameSettings,
    broadcast: (name, data) => {
      events.push({ name, data, at: Date.now() })
    },
    send: () => undefined,
    onNewQuestion: () => undefined,
    onGameFinished: () => undefined,
  })
  active.push(round)
  round.startQuestionAtIndex(0)

  return { round, player, events }
}

describe("system question-to-voting authority", () => {
  it.each([
    { type: "estimation" },
    {
      type: "single",
      media: {
        type: "video",
        url: "https://example.invalid/private-video.mp4",
      },
    },
    {
      type: "multi",
      media: {
        type: "audio",
        url: "https://example.invalid/private-audio.mp3",
      },
    },
    {
      type: "single",
      media: { type: "image", url: "https://example.invalid/question.png" },
    },
  ] satisfies Array<Partial<Question>>)(
    "publishes renderer metadata without early answer or protected media content: %j",
    async (overrides) => {
      const { events } = fixture(15, 20, overrides)
      await vi.advanceTimersByTimeAsync(2000)
      const question = events.at(-1)!
      const media = "media" in overrides ? overrides.media : undefined
      expect(question.name).toBe(STATUS.SHOW_QUESTION)
      expect(question.data.questionType).toBe(overrides.type)
      expect(question.data.questionMediaType).toBe(media?.type)
      expect(question.data).not.toHaveProperty("answers")
      expect(question.data).not.toHaveProperty("solutions")
      expect(question.data).not.toHaveProperty("options")

      if (media?.type === "image") {
        expect(question.data.media).toEqual(media)
      } else {
        expect(question.data.media).toBeUndefined()

        if (media) {
          expect(JSON.stringify(question.data)).not.toContain(media.url)
        }
      }
    },
  )
  it.each([2, 3, 15])(
    "ignores legacy authored cooldown%s and opens exactly2s after the question",
    async (cooldown) => {
      const { round, player, events } = fixture(cooldown)
      await vi.advanceTimersByTimeAsync(2000)
      const question = events.at(-1)!
      expect(question.name).toBe(STATUS.SHOW_QUESTION)
      expect(question.data.cooldown).toBe(2)
      expect(question.data).not.toHaveProperty("answers")
      expect(question.data).not.toHaveProperty("votingEndsAt")
      expect(round.selectAnswer(player, [0]).accepted).toBe(false)
      await vi.advanceTimersByTimeAsync(QUESTION_LEAD_IN_MS - 1)
      expect(events.at(-1)?.name).toBe(STATUS.SHOW_QUESTION)
      expect(round.isCurrentlyAcceptingAnswers).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      const voting = events.at(-1)!
      expect(voting.name).toBe(STATUS.SELECT_ANSWER)
      expect(voting.at - question.at).toBe(QUESTION_LEAD_IN_MS)
      expect(voting.data.votingStartsAt).toBe(voting.at)
      expect(voting.data.votingEndsAt).toBe(voting.at + 20000)
      expect(round.getRemainingSeconds()).toBe(20)
      expect(round.selectAnswer(player, [0]).accepted).toBe(true)
    },
  )

  it("pauses the reading interval without spending voting time", async () => {
    const { round, player, events } = fixture()
    await vi.advanceTimersByTimeAsync(2750)
    expect(round.pauseGame()).toBe(true)
    await vi.advanceTimersByTimeAsync(10000)
    expect(events.at(-1)?.name).toBe(STATUS.SHOW_QUESTION)
    expect(round.selectAnswer(player, [0]).accepted).toBe(false)
    expect(round.resumeGame()).toBe(true)
    await vi.advanceTimersByTimeAsync(1249)
    expect(round.isCurrentlyAcceptingAnswers).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(round.isCurrentlyAcceptingAnswers).toBe(true)
    expect(round.getRemainingSeconds()).toBe(20)
    expect(
      events.filter((event) => event.name === STATUS.SHOW_QUESTION),
    ).toHaveLength(1)
  })

  it("rebroadcasts the shifted authoritative deadline after a voting pause", async () => {
    const { round, player, events } = fixture()
    await vi.advanceTimersByTimeAsync(4000)
    const initial = events.at(-1)!.data
    await vi.advanceTimersByTimeAsync(500)
    round.pauseGame()
    expect(round.selectAnswer(player, [0])).toMatchObject({
      accepted: false,
      reason: "game_paused",
    })
    await vi.advanceTimersByTimeAsync(5000)
    round.resumeGame()
    const resumed = events.at(-1)!.data
    expect(resumed.votingStartsAt).toBe(Number(initial.votingStartsAt) + 5000)
    expect(resumed.votingEndsAt).toBe(Number(initial.votingEndsAt) + 5000)
    expect(
      events.filter((event) => event.name === STATUS.SHOW_QUESTION),
    ).toHaveLength(1)
    expect(round.selectAnswer(player, [0]).accepted).toBe(true)
    await vi.advanceTimersByTimeAsync(19499)
    expect(round.isCurrentlyAcceptingAnswers).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(round.isCurrentlyAcceptingAnswers).toBe(false)
  })

  it("cancels an old question waiter when another question is deliberately selected", async () => {
    const { round, events } = fixture()
    await vi.advanceTimersByTimeAsync(3000)
    round.startQuestionAtIndex(1)
    await vi.advanceTimersByTimeAsync(3999)
    expect(
      events.filter((event) => event.name === STATUS.SELECT_ANSWER),
    ).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(
      events.filter((event) => event.name === STATUS.SELECT_ANSWER),
    ).toHaveLength(1)
    expect(events.at(-1)?.data.questionNumber).toBe(2)
  })

  it("preserves an untimed voting round after the same2s reading interval", async () => {
    const { round, events } = fixture(15, -1)
    await vi.advanceTimersByTimeAsync(4000)
    expect(round.isCurrentlyAcceptingAnswers).toBe(true)
    expect(events.at(-1)?.data.time).toBe(-1)
    expect(events.at(-1)?.data).not.toHaveProperty("votingEndsAt")
  })
})
