import fs from "node:fs"
import type { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { createAdaptorServer } from "@hono/node-server"
import { EVENTS } from "@razzia/common/constants"
import { app, createSocketServer } from "@razzia/socket/app"
import { managerPassword } from "@razzia/socket/env"
import { initConfig } from "@razzia/socket/services/config"
import { getIo } from "@razzia/socket/services/io"
import Registry from "@razzia/socket/services/registry"
import { io as connect, type Socket } from "socket.io-client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  KeypadSimulatorCore,
  MockProvider,
  TelephonyBridge,
} from "../telephony/index"
import { RealRazziaTransport } from "./real-transport"

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
          time: 5,
        },
        {
          type: "single",
          question: "What is the capital of France?",
          answers: ["London", "Berlin", "Paris", "Rome"],
          solutions: [2],
          cooldown: 3,
          time: 5,
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

    // 2. Start real in-process Razzia Hono server and real Socket.IO server on ephemeral port
    const runningServer = createAdaptorServer({ fetch: app.fetch })

    createSocketServer(runningServer)
    server = runningServer

    await new Promise<void>((resolve) => {
      runningServer.listen(0, "127.0.0.1", () => {
        const { port } = runningServer.address() as AddressInfo

        baseUrl = `http://127.0.0.1:${port}`
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

  it("Scenario 1-5: Full real-transport game lifecycle with manager, web player, and telephony participant", async () => {
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
    const statusEvents: string[] = []

    webSocket.on(EVENTS.GAME.STATUS, (data: { name: string }) => {
      statusEvents.push(data.name)
    })

    managerSocket.emit(EVENTS.MANAGER.START_GAME, { gameId })

    // Wait until question 1 accepts answers (SELECT_ANSWER status) on both web and phone
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for SELECT_ANSWER")),
        20000,
      )

      const interval = setInterval(() => {
        const client = bridge.getClient("live_call_001")

        if (client?.getState().acceptingAnswers) {
          clearTimeout(timeout)
          clearInterval(interval)
          resolve()
        }
      }, 20)
    })

    // 5. Submit DTMF Digit 1 from Phone (corresponds to index 0: "4" -> Correct)
    const t0 = performance.now()
    const dtmfDirective = await sim.pressKey("1")
    const elapsed = performance.now() - t0

    expect(dtmfDirective.message).toContain("submitted")
    expect(elapsed).toBeLessThan(200)

    // Web Player submits wrong answer (index 1: "3")
    webSocket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: { answerKeys: [1] },
    })

    // 6. Verify Timer ends immediately when all eligible players answer (Scenario 9)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for SHOW_RESULT")),
        6000,
      )

      webSocket.on(EVENTS.GAME.STATUS, (data: { name: string }) => {
        if (data.name === "SHOW_RESULT" || data.name === "SHOW_RESPONSES") {
          clearTimeout(timeout)
          resolve()
        }
      })
    })

    // Clean up sockets
    webSocket.disconnect()
    managerSocket.disconnect()
  }, 25000)

  it("Scenario 6: Negative & Edge Case Security Verification", async () => {
    if (!realTransport) {
      throw new Error("Transport not ready")
    }

    const managerToken = await loginManager()
    const { inviteCode } = await createRealGame(managerToken)

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

    // 6c. Invalid join ticket over real Socket.IO
    const sessRes = await realTransport.http.fetch(
      `${baseUrl}/api/auth/session`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    )
    const { token } = (await sessRes.json()) as { token: string }

    const badTicketSocket = connect(baseUrl, {
      path: "/ws",
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    })

    const resetReceived = await new Promise<string>((resolve) => {
      badTicketSocket.once(EVENTS.GAME.RESET, (err: string) => {
        resolve(err)
      })
      badTicketSocket.once("connect", () => {
        badTicketSocket.emit(EVENTS.PLAYER.LOGIN, {
          ticket: "malformed.invalid.ticket",
        })
      })
    })

    expect(resetReceived).toBe("errors:auth.joinTicketInvalid")
    badTicketSocket.disconnect()
  })

  it("Scenario 7: Real Player Reconnection & State Synchronization", async () => {
    if (!realTransport) {
      throw new Error("Transport not ready")
    }

    const managerToken = await loginManager()
    const { gameId, inviteCode } = await createRealGame(managerToken)

    // Connect player
    const { socket: p1Socket, clientId } = await connectWebPlayer(
      inviteCode,
      "ReconnectBob",
    )

    expect(p1Socket.connected).toBe(true)

    // Disconnect
    p1Socket.disconnect()
    expect(p1Socket.connected).toBe(false)

    // Reconnect using same client identity
    const { token: reconnectedToken } = (await (
      await realTransport.http.fetch(`${baseUrl}/api/auth/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId }),
      })
    ).json()) as { token: string }

    const p1Reconnected = connect(baseUrl, {
      path: "/ws",
      auth: { token: reconnectedToken },
      transports: ["websocket"],
      forceNew: true,
    })

    const success = await new Promise<boolean>((resolve) => {
      p1Reconnected.once("connect", () => {
        p1Reconnected.emit(EVENTS.PLAYER.RECONNECT, { gameId })
        resolve(true)
      })
    })

    expect(success).toBe(true)
    p1Reconnected.disconnect()
  })

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

    // Phase 1: 100 concurrent callers perform HTTP auth, join-ticket and real WebSocket connect
    const joinStart = performance.now()
    const joinPromises = Array.from({ length: PARTICIPANTS }, async (_, i) => {
      const sim = new KeypadSimulatorCore(bridge, {
        callId: `live_load_call_${String(i + 1).padStart(3, "0")}`,
      })

      simulators.push(sim)
      await sim.startCall(`07700900${String(i).padStart(4, "0")}`)

      return sim.enterDigits(inviteCode)
    })

    const joinResults = await Promise.all(joinPromises)
    const joinDuration = performance.now() - joinStart

    const joinFailures = joinResults.filter(
      (r) => !r.message?.includes("Connected as Phone"),
    )

    expect(joinFailures.length).toBe(0)
    expect(bridge.getActiveSessionsCount()).toBe(PARTICIPANTS)

    // Phase 2: Start question on Real Server
    managerSocket.emit(EVENTS.MANAGER.START_GAME, { gameId })

    // Give server ~2 seconds for SHOW_START & SHOW_QUESTION to activate
    await new Promise<void>((r) => {
      setTimeout(() => r(), 2000)
    })

    // Phase 3: All 100 callers press DTMF keys concurrently over real HTTP & WebSocket wire
    const answerDurations: number[] = []
    const answerStart = performance.now()

    const answerPromises = simulators.map(async (sim, idx) => {
      const key = String((idx % 4) + 1)
      const t0 = performance.now()
      const res = await sim.pressKey(key)
      const t1 = performance.now()

      answerDurations.push(t1 - t0)

      return res
    })

    await Promise.all(answerPromises)
    const totalAnswerTime = performance.now() - answerStart

    answerDurations.sort((a, b) => a - b)
    const [min] = answerDurations
    const sum = answerDurations.reduce((acc, v) => acc + v, 0)
    const mean = sum / answerDurations.length
    const p50 = answerDurations[Math.floor(answerDurations.length * 0.5)]
    const p95 = answerDurations[Math.floor(answerDurations.length * 0.95)]
    const p99 = answerDurations[Math.floor(answerDurations.length * 0.99)]

    console.log("=== REAL SERVER TELEPHONY 100 PARTICIPANTS METRICS ===")
    console.log(`Join total time (100 sockets): ${joinDuration.toFixed(2)} ms`)
    console.log(
      `Answer submission total time: ${totalAnswerTime.toFixed(2)} ms`,
    )
    console.log(`Participants: ${PARTICIPANTS}`)
    console.log(
      `Join Failures: ${joinFailures.length} (${((joinFailures.length / PARTICIPANTS) * 100).toFixed(2)}%)`,
    )
    console.log(`Latency min: ${min.toFixed(2)} ms`)
    console.log(`Latency mean: ${mean.toFixed(2)} ms`)
    console.log(`Latency p50: ${p50.toFixed(2)} ms`)
    console.log(`Latency p95: ${p95.toFixed(2)} ms`)
    console.log(`Latency p99: ${p99.toFixed(2)} ms`)
    console.log("=====================================================")

    expect(joinFailures.length).toBe(0)
    expect(p95).toBeLessThan(1000)

    managerSocket.disconnect()
  })
})
