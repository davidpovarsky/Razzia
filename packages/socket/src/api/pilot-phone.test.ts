import {
  QUESTION_LEAD_IN_MS,
  QUIZZ_MODES,
  SESSION_ROLES,
} from "@razzia/common/constants"
import type { Question } from "@razzia/common/types/game"
import {
  EXTENSION_EVENTS,
  readPlatformOpening,
  type ExtensionStateEnvelope,
} from "@razzia/extensions/core"
import { STATUS } from "@razzia/common/types/game/status"
import { app } from "@razzia/socket/app"
import { mintToken } from "@razzia/socket/services/auth"
import { getPath, initConfig, saveQuizz } from "@razzia/socket/services/config"
import { setIo } from "@razzia/socket/services/io"
import Registry from "@razzia/socket/services/registry"
import type Game from "@razzia/socket/services/game"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import {
  createEstimationQuestion,
  createQuestion,
  createQuizz,
} from "@razzia/socket/test/fixtures"
import {
  FIRST_QUESTION_DELAY_MS,
  NEXT_QUESTION_DELAY_MS,
} from "@razzia/socket/test/game-setup"
import fs from "fs"
import { StatusCodes } from "http-status-codes"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
const TEST_PILOT_SECRET = "isolated-pilot-phone-test-secret"
const runtimeIo = createFakeIo()
let managerToken = ""
const request = (
  path: string,
  {
    method = "GET",
    token,
    body,
    headers = {},
    pilotSecret = TEST_PILOT_SECRET,
  }: {
    method?: string
    token?: string
    body?: unknown
    headers?: Record<string, string>
    pilotSecret?: string | null
  } = {},
) =>
  app.request(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(path === "/games/pilot-phone" && pilotSecret
        ? { "x-tada-pilot-secret": pilotSecret }
        : {}),
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const json = async <T = Record<string, unknown>>(response: Response) =>
  (await response.json()) as T
beforeAll(async () => {
  setIo(runtimeIo.io)
  managerToken = (await mintToken("manager", SESSION_ROLES.MANAGER)).token
})
beforeEach(() => {
  vi.stubEnv("TADA_PILOT_SECRET", TEST_PILOT_SECRET)
  fs.rmSync(getPath(), {
    recursive: true,
    force: true,
  })
  initConfig()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  Registry.getInstance()
    .getAllGames()
    .forEach((game) => {
      Registry.getInstance().removeGame(game.gameId)
    })
})
async function startPersistedGame(game: Game, question: Question) {
  const manager = runtimeIo.createSocket("manager")
  game.reconnect(manager)
  const launchStage = () => {
    const state = runtimeIo.lastEvent(manager.id, EXTENSION_EVENTS.STATE)
      ?.data as ExtensionStateEnvelope | undefined

    return readPlatformOpening(state?.extras.presentationLaunch)?.stage
  }

  expect(launchStage()).toBe("standby")
  await game.start(manager)
  expect(launchStage()).toBe("opening")
  expect(game.started).toBe(false)
  // The host's second start skips the opening to the lobby, not the questions.
  await game.start(manager)
  expect(launchStage()).toBe("lobby")
  expect(game.started).toBe(false)
  const started = game.start(manager)
  await vi.advanceTimersByTimeAsync(
    FIRST_QUESTION_DELAY_MS + QUESTION_LEAD_IN_MS,
  )
  await started
  expect(game.started).toBe(true)
  expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(true)
  expect(runtimeIo.lastStatus(game.gameId)).toMatchObject({
    name: STATUS.SELECT_ANSWER,
    data: { time: question.time, votingStartsAt: Date.now() },
  })
}
describe("POST /api/games/pilot-phone (PSTN DTMF 1-5 Acceptance)", () => {
  it("A01: accepts answerIndex 4 for 5-answer survey and tallies 5th vote correctly", async () => {
    const q1 = createQuestion({
      answers: ["Card 1", "Card 2", "Card 3", "Card 4", "Card 5"],
      playMode: "survey",
      solutions: [],
      cooldown: 3,
      time: 15,
    })
    const quizz = createQuizz([q1], QUIZZ_MODES.SURVEY)
    const { id: quizzId } = saveQuizz(quizz)
    const createRes = await request("/games", {
      method: "POST",
      token: managerToken,
      body: {
        quizzId,
      },
    })
    const { gameId, inviteCode } = await json<{
      gameId: string
      inviteCode: string
    }>(createRes)
    const game = Registry.getInstance().getGameById(gameId)!
    expect(game).toBeDefined()

    // 1. Join phone caller via join_or_poll
    const joinRes = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "join_or_poll",
        inviteCode,
        callId: "call-001",
        phone: "+972501234567",
      },
    })
    expect(joinRes.status).toBe(StatusCodes.OK)
    const joinData = await json<{
      ok: boolean
      joined: boolean
      rosterPlayerId: string
      state: {
        acceptingAnswers: boolean
      }
    }>(joinRes)
    expect(joinData.ok).toBe(true)
    expect(joinData.joined).toBe(true)
    expect(joinData.rosterPlayerId).toBeDefined()
    expect(joinData.state.acceptingAnswers).toBe(false)

    // Polling an existing roster identity requires the verified caller phone.
    for (const phone of [undefined, "+972509999998"]) {
      const mismatchedCaller = await request("/games/pilot-phone", {
        method: "POST",
        body: {
          action: "join_or_poll",
          gameId,
          rosterPlayerId: joinData.rosterPlayerId,
          callId: "call-001",
          phone,
        },
      })
      expect(mismatchedCaller.status).toBe(StatusCodes.FORBIDDEN)
      expect(await json(mismatchedCaller)).toMatchObject({
        ok: false,
        reason: "caller_binding_mismatch",
      })
    }

    // 2. Start game and reach answering
    await startPersistedGame(game, q1)

    // 3. Poll question state
    const pollRes = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "join_or_poll",
        gameId,
        rosterPlayerId: joinData.rosterPlayerId,
        callId: "call-001",
        phone: "+972501234567",
      },
    })
    const pollData = await json<{
      state: {
        acceptingAnswers: boolean
        answersCount: number
        maxAnswerIndex: number
        isSurvey: boolean
      }
    }>(pollRes)
    expect(pollData.state.acceptingAnswers).toBe(true)
    expect(pollData.state.answersCount).toBe(5)
    expect(pollData.state.maxAnswerIndex).toBe(4)
    expect(pollData.state.isSurvey).toBe(true)

    // 4. Submit DTMF key 5 -> answerIndex 4
    const answerRes = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId: joinData.rosterPlayerId,
        callId: "call-001",
        phone: "+972501234567",
        answerIndex: 4,
      },
    })
    expect(answerRes.status).toBe(StatusCodes.OK)
    const answerData = await json<{
      ok: boolean
      accepted: boolean
      isSurvey?: boolean
    }>(answerRes)
    expect(answerData.ok).toBe(true)
    expect(answerData.accepted).toBe(true)
    expect(answerData.isSurvey).toBe(true)

    // 5. End timer / advance to reveal and check tally
    ;(
      game as unknown as {
        round: {
          endTimer(): void
        }
      }
    ).round.endTimer()
    await vi.advanceTimersByTimeAsync(1000)
    const revealStatus = ((
      game as unknown as {
        managerStatus?: unknown
      }
    ).managerStatus ??
      (
        game as unknown as {
          lastBroadcastStatus?: unknown
        }
      ).lastBroadcastStatus) as {
      name: string
      data: {
        responses: Record<number, number>
      }
    }
    expect(revealStatus.name).toBe(STATUS.SHOW_RESPONSES)
    expect(revealStatus.data.responses[4]).toBe(1)
  })
  it("A02: bounds validation (2..5), rejects invalid indices, unsupported types, and enforces phone limits", async () => {
    const q5 = createQuestion({
      answers: ["Option 1", "Option 2", "Option 3", "Option 4", "Option 5"],
      playMode: "survey",
      solutions: [],
      cooldown: 3,
      time: 15,
    })
    const q4 = createQuestion({
      answers: ["Option 1", "Option 2", "Option 3", "Option 4"],
      playMode: "quiz",
      solutions: [0],
      cooldown: 3,
      time: 15,
    })
    const qEst = createEstimationQuestion()
    const quizz = createQuizz([q5, q4, qEst])
    const { id: quizzId } = saveQuizz(quizz)
    const createRes = await request("/games", {
      method: "POST",
      token: managerToken,
      body: {
        quizzId,
      },
    })
    const { gameId, inviteCode } = await json<{
      gameId: string
      inviteCode: string
    }>(createRes)
    const game = Registry.getInstance().getGameById(gameId)!

    // Join caller
    const joinRes = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "join_or_poll",
        inviteCode,
        callId: "call-002",
        phone: "+972509999999",
      },
    })
    expect(joinRes.status).toBe(StatusCodes.OK)
    const { rosterPlayerId } = await json<{
      rosterPlayerId: string
    }>(joinRes)

    // Start Question 1 (5 options)
    await startPersistedGame(game, q5)

    // Test out-of-bounds: index 5 (would be key 6) on 5-option question
    const outOfBounds = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-002",
        phone: "+972509999999",
        answerIndex: 5,
      },
    })
    const oobData = await json<{
      ok: boolean
      accepted: boolean
      reason: string
    }>(outOfBounds)
    expect(oobData.accepted).toBe(false)
    expect(oobData.reason).toBe("invalid_answer_index")

    // Test negative index: index -1 rejected by schema validator
    const negativeRes = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-002",
        phone: "+972509999999",
        answerIndex: -1,
      },
    })
    expect(negativeRes.status).toBe(StatusCodes.BAD_REQUEST)

    // Test non-integer index: 2.7 rejected by schema validator
    const floatRes = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-002",
        phone: "+972509999999",
        answerIndex: 2.7,
      },
    })
    expect(floatRes.status).toBe(StatusCodes.BAD_REQUEST)

    // Vote valid index 2
    const validVote = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-002",
        phone: "+972509999999",
        answerIndex: 2,
      },
    })
    const validData = await json<{
      ok: boolean
      accepted: boolean
    }>(validVote)
    expect(validData.accepted).toBe(true)

    // Duplicate answer in same question -> duplicate_answer
    const dupVote = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-002",
        phone: "+972509999999",
        answerIndex: 3,
      },
    })
    const dupData = await json<{
      ok: boolean
      accepted: boolean
      reason: string
    }>(dupVote)
    expect(dupData.accepted).toBe(false)
    expect(dupData.reason).toBe("duplicate_answer")

    // Expire timer on Q5 to reach responses
    ;(
      game as unknown as {
        round: {
          endTimer(): void
        }
      }
    ).round.endTimer()
    await vi.advanceTimersByTimeAsync(1000)
    // A survey has no score leaderboard between its reveal and the next question.
    expect(game.roundManager.currentStepName).toBe("reveal")
    game.advance()
    expect(game.roundManager.currentQuestionIndex).toBe(1)
    await vi.advanceTimersByTimeAsync(
      NEXT_QUESTION_DELAY_MS + QUESTION_LEAD_IN_MS,
    )

    // In 4-option question: verify maxAnswerIndex is 3
    const pollQ4 = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "join_or_poll",
        gameId,
        rosterPlayerId,
        callId: "call-002",
        phone: "+972509999999",
      },
    })
    const q4Data = await json<{
      state: {
        answersCount: number
        maxAnswerIndex: number
      }
    }>(pollQ4)
    expect(q4Data.state.answersCount).toBe(4)
    expect(q4Data.state.maxAnswerIndex).toBe(3)

    // In 4-option question: answerIndex 4 (key 5) MUST be rejected!
    const rejectKey5On4Options = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-002",
        phone: "+972509999999",
        answerIndex: 4,
      },
    })
    const rejectData = await json<{
      ok: boolean
      accepted: boolean
      reason: string
    }>(rejectKey5On4Options)
    expect(rejectData.accepted).toBe(false)
    expect(rejectData.reason).toBe("invalid_answer_index")

    // In 4-option question: answerIndex 3 (key 4) is accepted
    const acceptKey4On4Options = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-002",
        phone: "+972509999999",
        answerIndex: 3,
      },
    })
    const acceptData = await json<{
      ok: boolean
      accepted: boolean
    }>(acceptKey4On4Options)
    expect(acceptData.accepted).toBe(true)

    // Advance Q4 to reveal, advance past leaderboard, then advance to Question 3 (Estimation)
    ;(
      game as unknown as {
        round: {
          endTimer(): void
        }
      }
    ).round.endTimer()
    await vi.advanceTimersByTimeAsync(1000)
    // Reveal -> leaderboard
    game.advance()
    expect(game.roundManager.currentStepName).toBe("leaderboard")
    // Leaderboard -> next question
    game.advance()
    await vi.advanceTimersByTimeAsync(
      NEXT_QUESTION_DELAY_MS + QUESTION_LEAD_IN_MS,
    )

    // Estimation is not single-choice PSTN supported
    const estVote = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-002",
        phone: "+972509999999",
        answerIndex: 1,
      },
    })
    const estData = await json<{
      ok: boolean
      accepted: boolean
      reason: string
    }>(estVote)
    expect(estData.accepted).toBe(false)
    expect(estData.reason).toContain("not supported via telephone keypad")
  })
  it("enforces TADA_PILOT_SECRET when configured", async () => {
    process.env.TADA_PILOT_SECRET = "super-secret-token"

    try {
      const q = createQuestion({
        cooldown: 3,
      })
      const quizz = createQuizz([q])
      const { id: quizzId } = saveQuizz(quizz)
      const createRes = await request("/games", {
        method: "POST",
        token: managerToken,
        body: {
          quizzId,
        },
      })
      const { inviteCode } = await json<{
        inviteCode: string
      }>(createRes)

      // Request without secret -> 401
      const noSecretRes = await request("/games/pilot-phone", {
        method: "POST",
        pilotSecret: null,
        body: {
          action: "join_or_poll",
          inviteCode,
          phone: "+972501111111",
          callId: "sec-01",
        },
      })
      expect(noSecretRes.status).toBe(StatusCodes.UNAUTHORIZED)

      // Request with wrong secret -> 401
      const wrongSecretRes = await request("/games/pilot-phone", {
        method: "POST",
        headers: {
          "x-tada-pilot-secret": "wrong",
        },
        body: {
          action: "join_or_poll",
          inviteCode,
          phone: "+972501111111",
          callId: "sec-01",
        },
      })
      expect(wrongSecretRes.status).toBe(StatusCodes.UNAUTHORIZED)

      // Request with correct secret -> 200
      const correctSecretRes = await request("/games/pilot-phone", {
        method: "POST",
        headers: {
          "x-tada-pilot-secret": "super-secret-token",
        },
        body: {
          action: "join_or_poll",
          inviteCode,
          phone: "+972501111111",
          callId: "sec-01",
        },
      })
      expect(correctSecretRes.status).toBe(StatusCodes.OK)

      // An unset server secret must remain fail-closed, even with a supplied header.
      delete process.env.TADA_PILOT_SECRET
      const unconfiguredRes = await request("/games/pilot-phone", {
        method: "POST",
        body: {
          action: "join_or_poll",
          inviteCode,
          phone: "+972501111111",
          callId: "sec-unconfigured",
        },
      })
      expect(unconfiguredRes.status).toBe(StatusCodes.UNAUTHORIZED)
    } finally {
      delete process.env.TADA_PILOT_SECRET
    }
  })
  it("allows telephone participant to revote after Previous Screen reopens question in new epoch", async () => {
    const q1 = createQuestion({
      answers: ["A", "B", "C", "D", "E"],
      solutions: [0],
      cooldown: 3,
      time: 15,
    })
    const quizz = createQuizz([q1])
    const { id: quizzId } = saveQuizz(quizz)
    const createRes = await request("/games", {
      method: "POST",
      token: managerToken,
      body: {
        quizzId,
      },
    })
    const { gameId, inviteCode } = await json<{
      gameId: string
      inviteCode: string
    }>(createRes)
    const game = Registry.getInstance().getGameById(gameId)!

    // Join phone participant
    const joinRes = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "join_or_poll",
        inviteCode,
        callId: "call-revote-1",
        phone: "+972509998888",
      },
    })
    const { rosterPlayerId } = await json<{
      rosterPlayerId: string
    }>(joinRes)

    // Start game
    await startPersistedGame(game, q1)
    const initialEpoch = game.getCurrentQuestionPstnSupport().epoch

    // 1. Initial vote: DTMF 2 (answerIndex 1 - wrong)
    const vote1 = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-revote-1",
        phone: "+972509998888",
        answerIndex: 1,
        epoch: initialEpoch,
      },
    })
    const vote1Data = await json<{
      ok: boolean
      accepted: boolean
    }>(vote1)
    expect(vote1Data.accepted).toBe(true)

    // Advance to reveal
    game.advance()
    await vi.advanceTimersByTimeAsync(1000)
    expect(game.roundManager.currentStepName).toBe("reveal")

    // 2. Host clicks Previous Screen to reopen question for fresh vote
    const canPrev = game.roundManager.canPrevious()
    expect(canPrev.can).toBe(true)
    expect(canPrev.willReopenQuestion).toBe(true)
    const reopened = game.roundManager.previousScreen()
    expect(reopened).toBe(true)

    // A reopened question uses the same platform-owned reading interval.
    await vi.advanceTimersByTimeAsync(
      NEXT_QUESTION_DELAY_MS + QUESTION_LEAD_IN_MS,
    )
    expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(true)
    expect(game.roundManager.getAnswerCount()).toBe(0)
    const newEpoch = game.getCurrentQuestionPstnSupport().epoch
    expect(newEpoch).toBeGreaterThan(initialEpoch)

    // 3. Stale epoch vote is rejected
    const staleVote = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-revote-1",
        phone: "+972509998888",
        answerIndex: 0,
        // Stale!
        epoch: initialEpoch,
      },
    })
    const staleData = await json<{
      ok: boolean
      accepted: boolean
      reason: string
    }>(staleVote)
    expect(staleData.accepted).toBe(false)
    expect(staleData.reason).toBe("stale_question_epoch")

    // 4. Fresh revote with new epoch: DTMF 1 (answerIndex 0 - correct!)
    const revote = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-revote-1",
        phone: "+972509998888",
        answerIndex: 0,
        epoch: newEpoch,
      },
    })
    const revoteData = await json<{
      ok: boolean
      accepted: boolean
    }>(revote)
    expect(revoteData.accepted).toBe(true)
    expect(game.roundManager.getAnswerCount()).toBe(1)

    // 5. Duplicate vote in SAME epoch is rejected
    const dupVote = await request("/games/pilot-phone", {
      method: "POST",
      body: {
        action: "answer",
        gameId,
        rosterPlayerId,
        callId: "call-revote-1",
        phone: "+972509998888",
        answerIndex: 4,
        epoch: newEpoch,
      },
    })
    const dupData = await json<{
      ok: boolean
      accepted: boolean
      reason: string
    }>(dupVote)
    expect(dupData.accepted).toBe(false)
    expect(dupData.reason).toBe("duplicate_answer")

    // Advance to reveal: Option 0 has 1 count, Option 1 has 0 count
    game.advance()
    await vi.advanceTimersByTimeAsync(1000)
    expect(game.roundManager.currentStepName).toBe("reveal")
    const revealDist = game.roundManager.getRevealDistribution()
    expect(revealDist?.options?.[0].count).toBe(1)
    expect(revealDist?.options?.[1].count).toBe(0)
  })
})
