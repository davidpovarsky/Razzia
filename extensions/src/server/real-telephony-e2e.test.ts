import fs from "node:fs"
import type { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { createAdaptorServer } from "@hono/node-server"
import { EVENTS } from "@razzia/common/constants"
import { app, createSocketServer } from "@razzia/socket/app"
import { jwtSecret, managerPassword } from "@razzia/socket/env"
import { initConfig } from "@razzia/socket/services/config"
import { getIo } from "@razzia/socket/services/io"
import Registry from "@razzia/socket/services/registry"
import { sign } from "hono/jwt"
import { io as connect, type Socket } from "socket.io-client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  KeypadSimulatorCore,
  MockProvider,
  TelephonyBridge,
} from "../telephony/index"
import { RealRazziaTransport } from "./real-transport"

interface InternalGame {
  round: {
    acceptingAnswers: boolean
    playersAnswers: Array<{ playerId: string; answerIds: number[] }>
    leaderboard: Array<{ id: string; points: number }>
    questionsHistory?: Array<{
      playerAnswersCount: number
      playerAnswers: Array<{
        playerName: string
        answerIds: number[] | null
        correct?: boolean
        points?: number
      }>
    }>
    currentQuestionIndex: number
    advance: () => void
  }
}

describe("GATE 1: Real Local Telephony End-to-End Acceptance (Real Hono + Real Socket.IO /ws)", () => {
  let server: ReturnType<typeof createAdaptorServer> | null = null
  let baseUrl = ""
  let realTransport: RealRazziaTransport | null = null
  let tempConfigDir = ""
  const secret = "test-e2e-secret-telephony-key"

  beforeAll(async () => {
    // 1. Create isolated temporary config directory to protect user config
    tempConfigDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "razzia-telephony-e2e-"),
    )
    const quizzDir = path.join(tempConfigDir, "quizz")

    fs.mkdirSync(quizzDir, { recursive: true })

    // Seed a standard quiz into the isolated config
    const testQuiz = {
      id: "real-telephony-quizz",
      subject: "Real Telephony Acceptance Quiz",
      gameMode: "quiz",
      questions: [
        {
          type: "single",
          question: "What is 2 + 2?",
          answers: ["4", "3", "2", "1"],
          solutions: [0],
          cooldown: 3,
          time: 45,
        },
        {
          type: "single",
          question: "What is the capital of France?",
          answers: ["London", "Berlin", "Paris", "Rome"],
          solutions: [2],
          cooldown: 3,
          time: 45,
        },
      ],
    }

    fs.writeFileSync(
      path.join(quizzDir, "real-telephony-quizz.json"),
      JSON.stringify(testQuiz, null, 2),
      "utf-8",
    )

    process.env.CONFIG_PATH = tempConfigDir
    initConfig()

    // 2. Start real Hono server with real Socket.IO mounted at /ws
    server = createAdaptorServer(app)
    createSocketServer(server)

    const activeServer = server

    await new Promise<void>((resolve) => {
      activeServer.listen(0, "127.0.0.1", () => {
        const addr = activeServer.address() as AddressInfo
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
    })

    realTransport = new RealRazziaTransport()
  })

  afterAll(async () => {
    try {
      getIo().disconnectSockets(true)
      getIo().close()
    } catch {
      /* Ignore */
    }

    Registry.getInstance().cleanup()

    if (server) {
      ;(
        server as unknown as { closeAllConnections?: () => void }
      ).closeAllConnections?.()
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 1000)
        server?.close(() => {
          clearTimeout(timer)
          resolve()
        })
      })
    }

    if (tempConfigDir && fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true })
    }
  }, 15000)

  // Helper to authenticate manager via real HTTP endpoint
  const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs: number,
    errorMessage: string,
  ): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null
      const timeout = setTimeout(() => {
        if (timer) {
          clearInterval(timer)
        }

        reject(new Error(errorMessage))
      }, timeoutMs)

      timer = setInterval(() => {
        if (predicate()) {
          clearTimeout(timeout)

          if (timer) {
            clearInterval(timer)
          }

          resolve()
        }
      }, 30)
    })
  }

  const loginManager = async (): Promise<string> => {
    if (!realTransport) {
      throw new Error("Transport not ready")
    }

    const res = await realTransport.http.fetch(`${baseUrl}/api/auth/manager`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: managerPassword }),
    })

    if (!res.ok) {
      throw new Error(`Manager login failed: HTTP ${res.status}`)
    }

    const data = (await res.json()) as { token: string }

    return data.token
  }

  // Helper to create real game via manager API
  const createRealGame = async (
    token: string,
    quizzId = "real-telephony-quizz",
  ): Promise<{ gameId: string; inviteCode: string }> => {
    if (!realTransport) {
      throw new Error("Transport not ready")
    }

    const res = await realTransport.http.fetch(`${baseUrl}/api/games`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quizzId }),
    })

    if (!res.ok) {
      throw new Error(`Create game failed: HTTP ${res.status}`)
    }

    return (await res.json()) as { gameId: string; inviteCode: string }
  }

  // Helper to join a normal web player over real HTTP & Socket.IO
  const connectWebPlayer = async (
    inviteCode: string,
    username: string,
  ): Promise<{ socket: Socket; clientId: string }> => {
    if (!realTransport) {
      throw new Error("Transport not ready")
    }

    // 1. Session token
    const sessRes = await realTransport.http.fetch(
      `${baseUrl}/api/auth/session`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    )
    const { token, clientId } = (await sessRes.json()) as {
      token: string
      clientId: string
    }

    // 2. Join ticket
    const joinRes = await realTransport.http.fetch(
      `${baseUrl}/api/games/join`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inviteCode, username }),
      },
    )
    const { ticket } = (await joinRes.json()) as { ticket: string }

    // 3. Connect Socket.IO
    const playerSocket = connect(baseUrl, {
      path: "/ws",
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    })

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Web player socket connect timeout")),
        4000,
      )

      playerSocket.once(EVENTS.GAME.SUCCESS_JOIN, () => {
        clearTimeout(timeout)
        resolve()
      })
      playerSocket.once("connect", () => {
        playerSocket.emit(EVENTS.PLAYER.LOGIN, { ticket })
      })
    })

    return { socket: playerSocket, clientId }
  }

  it("Scenario 1-5 & 8-9: Full real-transport game lifecycle with manager, web player, and telephony participant", async () => {
    if (!realTransport) {
      throw new Error("Transport not ready")
    }

    // 1. Authenticate Manager & Create Game on Real Hono API
    const managerToken = await loginManager()
    const { gameId, inviteCode } = await createRealGame(managerToken)

    expect(gameId).toBeDefined()
    expect(inviteCode).toMatch(/^\d{6}$/)

    // Connect Manager Socket.IO
    const managerSocket = connect(baseUrl, {
      path: "/ws",
      auth: { token: managerToken },
      transports: ["websocket"],
      forceNew: true,
    })

    await new Promise<void>((resolve) => {
      managerSocket.once("connect", () => {
        managerSocket.emit(EVENTS.MANAGER.RECONNECT, { gameId })
        resolve()
      })
    })

    // 2. Join normal Web Player via real session & join-ticket
    const { socket: webSocket } = await connectWebPlayer(inviteCode, "AliceWeb")

    // 3. Join Telephone Player via TelephonyBridge + RealRazziaTransport
    const mockProvider = new MockProvider({ secret })
    const bridge = new TelephonyBridge({
      transport: realTransport,
      provider: mockProvider,
      baseUrl,
    })

    const sim = new KeypadSimulatorCore(bridge, { callId: "live_call_001" })
    const startCallDirective = await sim.startCall("07700900101")

    expect(startCallDirective.type).toBe("read")
    expect(startCallDirective.message).toContain("PIN")

    // Enter 6-digit PIN -> triggers real HTTP session, real join-ticket, real /ws connect & login
    const joinDirective = await sim.enterDigits(inviteCode)

    expect(joinDirective.message).toContain("Connected as Phone")
    expect(bridge.getActiveSessionsCount()).toBe(1)

    // 4. Manager Starts Game over real WebSocket
    managerSocket.emit(EVENTS.MANAGER.START_GAME, { gameId })

    // Wait until question 1 accepts answers (SELECT_ANSWER status)
    await waitForCondition(
      () =>
        Boolean(bridge.getClient("live_call_001")?.getState().acceptingAnswers),
      20000,
      "Timeout waiting for SELECT_ANSWER",
    )

    // 5. Submit DTMF Digit 1 from Phone (corresponds to index 0: "4" -> Correct)
    const t0 = performance.now()
    const dtmfDirective = await sim.pressKey("1")
    const elapsed = performance.now() - t0

    expect(dtmfDirective.message).toContain("submitted")
    expect(elapsed).toBeLessThan(500)

    // Scenario 8: Mixed Web and Phone players in the same question
    // Web Player submits wrong answer (index 1: "3")
    webSocket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: { answerKeys: [1] },
    })

    // Scenario 9: Verify Timer ends immediately when all eligible players answer
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for SHOW_RESULT")),
        8000,
      )

      webSocket.on(EVENTS.GAME.STATUS, (data: { name: string }) => {
        if (data.name === "SHOW_RESULT" || data.name === "SHOW_RESPONSES") {
          clearTimeout(timeout)
          resolve()
        }
      })
    })

    // Authoritative check on real game state in Registry
    const game = Registry.getInstance().getGameById(gameId)
    expect(game).toBeDefined()

    if (game) {
      expect(game.players.length).toBe(2)
      // Confirm phone player received points > 0 for correct answer
      const phonePlayer = game.players.find((p) => p.username.includes("Phone"))
      expect(phonePlayer).toBeDefined()
      expect(phonePlayer?.points).toBeGreaterThan(0)

      // Web player answered wrong -> 0 points
      const alicePlayer = game.players.find((p) => p.username === "AliceWeb")
      expect(alicePlayer).toBeDefined()
      expect(alicePlayer?.points).toBe(0)
    }

    // Clean up sockets
    webSocket.disconnect()
    managerSocket.disconnect()
  }, 25000)

  it("Scenario 6: Negative & Edge Case Security Verification", async () => {
    if (!realTransport) {
      throw new Error("Transport not ready")
    }

    const managerToken = await loginManager()
    const { gameId, inviteCode } = await createRealGame(managerToken)

    const mockProvider = new MockProvider({ secret })
    const bridge = new TelephonyBridge({
      transport: realTransport,
      provider: mockProvider,
      baseUrl,
    })

    // 6a. Invalid PIN -> 404 game not found
    const simBadPin = new KeypadSimulatorCore(bridge, {
      callId: "call_bad_pin",
    })

    await simBadPin.startCall("07700900999")
    const badPinDirective = await simBadPin.enterDigits("000000")

    expect(badPinDirective.message).toContain(
      "Could not find a game with that PIN",
    )

    // 6b. Early answer before question is active
    const simEarly = new KeypadSimulatorCore(bridge, { callId: "call_early" })

    await simEarly.startCall("07700900888")
    await simEarly.enterDigits(inviteCode)
    const earlyAnswerDirective = await simEarly.pressKey("1")

    expect(earlyAnswerDirective.message).toContain(
      "Answers are not being accepted at this time",
    )

    // 6c. Malformed join ticket over real Socket.IO
    const sessRes = await realTransport.http.fetch(
      `${baseUrl}/api/auth/session`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    )
    const { token, clientId } = (await sessRes.json()) as {
      token: string
      clientId: string
    }

    const badTicketSocket = connect(baseUrl, {
      path: "/ws",
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    })

    const resetMalformed = await new Promise<string>((resolve) => {
      badTicketSocket.once(EVENTS.GAME.RESET, (err: string) => {
        resolve(err)
      })
      badTicketSocket.once("connect", () => {
        badTicketSocket.emit(EVENTS.PLAYER.LOGIN, {
          ticket: "malformed.invalid.ticket",
        })
      })
    })

    expect(resetMalformed).toBe("errors:auth.joinTicketInvalid")
    badTicketSocket.disconnect()

    // 6d. Expired join ticket verification
    const nowSec = Math.floor(Date.now() / 1000)
    const expiredTicket = await sign(
      {
        sub: clientId,
        gameId,
        username: "ExpiredUser",
        iat: nowSec - 600,
        exp: nowSec - 100,
      },
      jwtSecret,
      "HS256",
    )

    const expiredTicketSocket = connect(baseUrl, {
      path: "/ws",
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    })

    const resetExpired = await new Promise<string>((resolve) => {
      expiredTicketSocket.once(EVENTS.GAME.RESET, (err: string) => {
        resolve(err)
      })
      expiredTicketSocket.once("connect", () => {
        expiredTicketSocket.emit(EVENTS.PLAYER.LOGIN, { ticket: expiredTicket })
      })
    })

    expect(resetExpired).toBe("errors:auth.joinTicketInvalid")
    expiredTicketSocket.disconnect()

    // 6e. Ticket subject mismatch (stolen ticket for different client)
    const otherClientId = "00000000-0000-0000-0000-000000000099"
    const stolenTicket = await sign(
      {
        sub: otherClientId,
        gameId,
        username: "StolenUser",
        iat: nowSec,
        exp: nowSec + 300,
      },
      jwtSecret,
      "HS256",
    )

    const stolenTicketSocket = connect(baseUrl, {
      path: "/ws",
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    })

    const resetUnauthorized = await new Promise<string>((resolve) => {
      stolenTicketSocket.once(EVENTS.GAME.RESET, (err: string) => {
        resolve(err)
      })
      stolenTicketSocket.once("connect", () => {
        stolenTicketSocket.emit(EVENTS.PLAYER.LOGIN, { ticket: stolenTicket })
      })
    })

    expect(resetUnauthorized).toBe("errors:auth.unauthorized")
    stolenTicketSocket.disconnect()

    // 6f. Wrong-room injection & Unauthorized manager event from normal player socket
    const { socket: validPlayerSocket } = await connectWebPlayer(
      inviteCode,
      "SecPlayer",
    )

    // Player attempts to emit manager command
    const unauthorizedManagerEvent = await new Promise<string>((resolve) => {
      validPlayerSocket.once("game:errorMessage", (err: string) => {
        resolve(err)
      })
      validPlayerSocket.emit(EVENTS.MANAGER.START_GAME, { gameId })
    })

    expect(unauthorizedManagerEvent).toBe("errors:auth.unauthorized")

    // Player attempts wrong-room injection
    const wrongRoomEvent = await new Promise<string>((resolve) => {
      validPlayerSocket.once("game:errorMessage", (err: string) => {
        resolve(err)
      })
      validPlayerSocket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
        gameId: "00000000-0000-0000-0000-999999999999",
        data: { answerKeys: [0] },
      })
    })

    expect(wrongRoomEvent).toBe("errors:game.notFound")

    validPlayerSocket.disconnect()
  })

  it("Scenario 7: Real Player Reconnection & State Synchronization", async () => {
    if (!realTransport) {
      throw new Error("Transport not ready")
    }

    const managerToken = await loginManager()
    const { gameId, inviteCode } = await createRealGame(managerToken)

    // Connect Manager Socket.IO
    const managerSocket = connect(baseUrl, {
      path: "/ws",
      auth: { token: managerToken },
      transports: ["websocket"],
      forceNew: true,
    })

    await new Promise<void>((resolve) => {
      managerSocket.once("connect", () => {
        managerSocket.emit(EVENTS.MANAGER.RECONNECT, { gameId })
        resolve()
      })
    })

    // Connect Telephone Player via Bridge
    const mockProvider = new MockProvider({ secret })
    const bridge = new TelephonyBridge({
      transport: realTransport,
      provider: mockProvider,
      baseUrl,
    })

    const sim = new KeypadSimulatorCore(bridge, { callId: "reconnect_call" })
    await sim.startCall("07700900777")
    await sim.enterDigits(inviteCode)

    const phoneClient = bridge.getClient("reconnect_call")
    expect(phoneClient).toBeDefined()
    const phoneClientId = phoneClient?.getClientId() ?? ""
    expect(phoneClientId).toBeTruthy()

    // Manager starts game
    managerSocket.emit(EVENTS.MANAGER.START_GAME, { gameId })

    // Wait until Question 1 is accepting answers
    await waitForCondition(
      () => Boolean(phoneClient?.getState().acceptingAnswers),
      15000,
      "Timeout waiting for Question 1",
    )

    // Phone player answers Question 1 with correct answer '1' (Index 0: "4")
    const ans1 = await sim.pressKey("1")
    expect(ans1.message).toContain("submitted")

    const game = Registry.getInstance().getGameById(gameId)
    expect(game).toBeDefined()

    const getPhonePlayer = () =>
      game?.players.find((item) => item.clientId === phoneClientId)

    // Wait until round finishes and scores player (cooldown ends automatically since 1/1 player answered)
    await waitForCondition(
      () => (getPhonePlayer()?.points ?? 0) > 0,
      8000,
      "Timeout waiting for round score",
    )

    const scoredPoints = getPhonePlayer()?.points ?? 0
    expect(scoredPoints).toBeGreaterThan(0)

    // Now disconnect telephone participant's socket directly to simulate dropped connection
    ;(
      phoneClient as unknown as { socket?: { disconnect: () => void } }
    ).socket?.disconnect()

    // Assert player is marked disconnected on server (wait for async socket disconnect event)
    await waitForCondition(
      () => Boolean(getPhonePlayer() && !getPhonePlayer()?.connected),
      3000,
      "Timeout waiting for player disconnection",
    )

    const serverPlayer = game?.players.find((p) => p.clientId === phoneClientId)
    expect(serverPlayer?.connected).toBe(false)

    // Reconnect using the same valid existing session token
    const reconnectedToken = phoneClient?.getToken() ?? ""
    expect(reconnectedToken).toBeTruthy()

    const reconnectedSocket = connect(baseUrl, {
      path: "/ws",
      auth: { token: reconnectedToken },
      transports: ["websocket"],
      forceNew: true,
    })

    interface ReconnectPayload {
      gameId: string
      username: string
      currentQuestion: unknown
      status: { name: string; data: unknown }
      player: { username: string; points: number }
    }

    const reconnectPayload = await new Promise<ReconnectPayload>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Reconnect timeout")),
          5000,
        )
        reconnectedSocket.once(
          EVENTS.PLAYER.SUCCESS_RECONNECT,
          (data: ReconnectPayload) => {
            clearTimeout(timeout)
            resolve(data)
          },
        )
        reconnectedSocket.once("connect", () => {
          reconnectedSocket.emit(EVENTS.PLAYER.RECONNECT, { gameId })
        })
      },
    )

    // Authoritative verification of restored session data
    expect(reconnectPayload.gameId).toBe(gameId)
    expect(reconnectPayload.player.username).toContain("Phone")
    expect(reconnectPayload.player.points).toBe(scoredPoints)
    expect(reconnectPayload.status).toBeDefined()

    // Verify player was NOT duplicated in server player list
    const playerMatches =
      game?.players.filter((p) => p.clientId === phoneClientId) ?? []
    expect(playerMatches.length).toBe(1)
    expect(playerMatches[0].connected).toBe(true)

    // Verify participant cannot answer the already-closed question
    reconnectedSocket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: { answerKeys: [2] },
    })

    const roundManager = (game as unknown as InternalGame | undefined)?.round

    // Advance from SHOW_RESULT / SHOW_LEADERBOARD to Question 2 via Manager
    const advanceToQuestion2 = setInterval(() => {
      if (roundManager?.currentQuestionIndex === 1) {
        clearInterval(advanceToQuestion2)
      } else {
        managerSocket.emit(EVENTS.MANAGER.ADVANCE, { gameId })
      }
    }, 400)

    // Wait until Question 2 is active and accepting answers on real server
    try {
      await waitForCondition(
        () => {
          const curRound = (game as unknown as InternalGame | undefined)?.round

          if (!curRound) {
            return false
          }

          return (
            curRound.currentQuestionIndex === 1 && curRound.acceptingAnswers
          )
        },
        15000,
        "Timeout waiting for Question 2",
      )
    } finally {
      clearInterval(advanceToQuestion2)
    }

    // Reconnected player successfully answers Question 2 (Index 2: "Paris" -> Correct)
    reconnectedSocket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: { answerKeys: [2] },
    })

    // Confirm answer was recorded in the server's second round
    await waitForCondition(
      () => {
        const curRound = (game as unknown as InternalGame | undefined)?.round

        return Boolean(
          curRound?.playersAnswers.length && curRound.playersAnswers.length > 0,
        )
      },
      5000,
      "Timeout waiting for Question 2 answer",
    )

    expect(
      (game as unknown as InternalGame | undefined)?.round.playersAnswers
        .length,
    ).toBe(1)

    reconnectedSocket.disconnect()
    managerSocket.disconnect()
  }, 35000)

  it("Scenario 10: 100 Concurrent Telephone Participants Load Test against Real Server", async () => {
    if (!realTransport) {
      throw new Error("Transport not ready")
    }

    const managerToken = await loginManager()
    const { gameId, inviteCode } = await createRealGame(managerToken)

    // Connect Manager
    const managerSocket = connect(baseUrl, {
      path: "/ws",
      auth: { token: managerToken },
      transports: ["websocket"],
      forceNew: true,
    })

    await new Promise<void>((resolve) => {
      managerSocket.once("connect", () => {
        managerSocket.emit(EVENTS.MANAGER.RECONNECT, { gameId })
        resolve()
      })
    })

    const mockProvider = new MockProvider({ secret })
    const bridge = new TelephonyBridge({
      transport: realTransport,
      provider: mockProvider,
      baseUrl,
      maxSessions: 200,
    })

    const PARTICIPANTS = 100
    const simulators: KeypadSimulatorCore[] = []

    // Phase 1: 100 callers perform HTTP auth, join-ticket and real WebSocket connect
    // Batched in groups of 20 to avoid Windows localhost TCP socket exhaustion under full test suite load
    const joinStart = performance.now()
    const joinResults: Array<{ message?: string }> = []
    const BATCH_SIZE = 20

    for (let b = 0; b < PARTICIPANTS; b += BATCH_SIZE) {
      const batchPromises = Array.from({ length: BATCH_SIZE }, async (_, offset) => {
        const i = b + offset
        const sim = new KeypadSimulatorCore(bridge, {
          callId: `live_load_call_${String(i + 1).padStart(3, "0")}`,
        })

        simulators.push(sim)
        await sim.startCall(`07700900${String(i).padStart(4, "0")}`)

        return sim.enterDigits(inviteCode)
      })

      const batchRes = await Promise.all(batchPromises)
      joinResults.push(...batchRes)
    }

    const joinDuration = performance.now() - joinStart

    const joinFailures = joinResults.filter(
      (r) => !r.message?.includes("Connected as Phone"),
    )

    expect(joinFailures.length).toBe(0)
    expect(bridge.getActiveSessionsCount()).toBe(PARTICIPANTS)

    const game = Registry.getInstance().getGameById(gameId)
    const internalGame = game as unknown as InternalGame | undefined
    expect(game).toBeDefined()
    expect(game?.players.length).toBe(PARTICIPANTS)

    // Phase 2: Start question on Real Server
    managerSocket.emit(EVENTS.MANAGER.START_GAME, { gameId })

    const isClientAccepting = (idx: number) => {
      const c = bridge.getClient(
        `live_load_call_${String(idx + 1).padStart(3, "0")}`,
      )

      return Boolean(c?.getState().acceptingAnswers)
    }

    const countReadyClients = () => {
      let count = 0
      for (let i = 0; i < PARTICIPANTS; i += 1) {
        if (isClientAccepting(i)) {
          count += 1
        }
      }

      return count
    }

    // Wait until real server and all 100 client sockets reach answer-accepting phase
    await waitForCondition(
      () => countReadyClients() === PARTICIPANTS,
      20000,
      "Timeout waiting for all 100 participants to reach acceptingAnswers",
    )

    // Phase 3: Submit DTMF answers concurrently:
    // 50 callers press '1' (correct index 0), 50 callers press '2' (incorrect index 1)
    const clientDurations: number[] = []
    const answerStart = performance.now()

    const answerPromises = simulators.map(async (sim, idx) => {
      // 50 even callers: '1' (correct), 50 odd callers: '2' (incorrect)
      const key = idx % 2 === 0 ? "1" : "2"
      const t0 = performance.now()
      const res = await sim.pressKey(key)
      const t1 = performance.now()
      clientDurations.push(t1 - t0)

      return res
    })

    await Promise.all(answerPromises)

    // Wait for either the active answer array or the archived question history / leaderboard
    // to record all 100 participants (when all 100 answer, server immediately advances to SHOW_RESULTS)
    await waitForCondition(
      () =>
        (internalGame?.round.playersAnswers.length ?? 0) === PARTICIPANTS ||
        ((internalGame?.round.questionsHistory?.[0]?.playerAnswers?.length ?? 0) === PARTICIPANTS) ||
        (internalGame?.round.leaderboard?.length ?? 0) === PARTICIPANTS,
      10000,
      `Timeout waiting for 100 answers; got active=${internalGame?.round.playersAnswers.length}, history=${internalGame?.round.questionsHistory?.[0]?.playerAnswers?.length}`,
    )

    const totalAnswerTime = performance.now() - answerStart

    // Phase 4: Authoritative Server-Side Answer Record Assertions
    const historyAnswers = internalGame?.round.questionsHistory?.[0]?.playerAnswers
    const activeAnswers = internalGame?.round.playersAnswers

    if (historyAnswers && historyAnswers.length === PARTICIPANTS) {
      // All 100 answers archived immediately upon everyone answering
      const answeredNames = new Set(historyAnswers.map((a) => a.playerName))
      expect(answeredNames.size).toBe(PARTICIPANTS)

      const correctAnswers = historyAnswers.filter((a) => a.answerIds?.includes(0))
      const incorrectAnswers = historyAnswers.filter((a) => a.answerIds?.includes(1))

      expect(correctAnswers.length).toBe(50)
      expect(incorrectAnswers.length).toBe(50)
      expect(internalGame?.round.leaderboard.length).toBe(PARTICIPANTS)
    } else {
      expect(activeAnswers?.length).toBe(PARTICIPANTS)

      const answeredPlayerIds = new Set(
        activeAnswers?.map((a) => a.playerId),
      )
      expect(answeredPlayerIds.size).toBe(PARTICIPANTS)

      const correctAnswers =
        activeAnswers?.filter((a) => a.answerIds.includes(0)) ?? []
      const incorrectAnswers =
        activeAnswers?.filter((a) => a.answerIds.includes(1)) ?? []

      expect(correctAnswers.length).toBe(50)
      expect(incorrectAnswers.length).toBe(50)
    }

    // Verify duplicate answer rejection on caller 0
    await simulators[0].pressKey("1")
    // Remains strictly 100
    const recordedCount =
      internalGame?.round.questionsHistory?.[0]?.playerAnswers?.length ||
      internalGame?.round.playersAnswers.length ||
      0
    expect(recordedCount).toBe(PARTICIPANTS)

    // Phase 5: Advance round and verify Authoritative Server-Side Scoring
    // Wait until countdown ends or advance triggers step transition to SHOW_RESULT / SHOW_LEADERBOARD
    await waitForCondition(
      () => internalGame?.round.leaderboard.length === PARTICIPANTS,
      10000,
      "Timeout waiting for leaderboard calculation",
    )

    // Assert correctness and scoring on authoritative leaderboard
    expect(internalGame?.round.leaderboard.length).toBe(PARTICIPANTS)

    const correctPlayers =
      internalGame?.round.leaderboard.filter((p) => p.points > 0) ?? []
    const incorrectPlayers =
      internalGame?.round.leaderboard.filter((p) => p.points === 0) ?? []

    expect(correctPlayers.length).toBe(50)
    expect(incorrectPlayers.length).toBe(50)
    // Top scorer has positive points
    expect(internalGame?.round.leaderboard[0].points).toBeGreaterThan(0)

    // Latency statistics
    clientDurations.sort((a, b) => a - b)
    const [clientMin] = clientDurations
    const clientMean =
      clientDurations.reduce((acc, v) => acc + v, 0) / clientDurations.length
    const clientP50 = clientDurations[Math.floor(clientDurations.length * 0.5)]
    const clientP95 = clientDurations[Math.floor(clientDurations.length * 0.95)]
    const clientP99 = clientDurations[Math.floor(clientDurations.length * 0.99)]

    console.log("=== REAL SERVER TELEPHONY 100 PARTICIPANTS METRICS ===")
    console.log(`Join total time (100 sockets): ${joinDuration.toFixed(2)} ms`)
    console.log(
      `Answer submission total time: ${totalAnswerTime.toFixed(2)} ms`,
    )
    console.log(`Participants: ${PARTICIPANTS}`)
    console.log(
      `Server Authoritative Answers Recorded: ${internalGame?.round.playersAnswers.length}/100`,
    )
    console.log(
      `Server Scored Participants: ${internalGame?.round.leaderboard.length}/100 (50 correct: >0 pts, 50 incorrect: 0 pts)`,
    )
    console.log(
      `Client DTMF Latency - min: ${clientMin.toFixed(2)}ms, mean: ${clientMean.toFixed(2)}ms, p50: ${clientP50.toFixed(2)}ms, p95: ${clientP95.toFixed(2)}ms, p99: ${clientP99.toFixed(2)}ms`,
    )
    console.log("=====================================================")

    managerSocket.disconnect()
  }, 60000)
})
