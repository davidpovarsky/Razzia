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
  buildXlsxBuffer,
  type HostPresenceSnapshot,
} from "../core/index"
import { RealRazziaTransport } from "./real-transport"

describe("P0 Telephony, Roster, Redial & Host Presence E2E (Real Hono + Real Socket.IO)", () => {
  let server: ReturnType<typeof createAdaptorServer> | null = null
  let baseUrl = ""
  let realTransport: RealRazziaTransport | null = null
  let tempConfigDir = ""

  beforeAll(async () => {
    tempConfigDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "razzia-p0-roster-e2e-"),
    )
    const quizzDir = path.join(tempConfigDir, "quizz")
    fs.mkdirSync(quizzDir, { recursive: true })

    const testQuiz = {
      id: "p0-roster-quizz",
      subject: "P0 Roster & Phone Redial Quiz",
      gameMode: "quiz",
      questions: [
        {
          type: "single",
          question: "What is 5 + 5?",
          answers: ["10", "11", "12", "13"],
          solutions: [0],
          cooldown: 3,
          time: 10,
        },
        {
          type: "single",
          question: "Capital of Israel?",
          answers: ["Haifa", "Jerusalem", "Eilat", "Ashdod"],
          solutions: [1],
          cooldown: 3,
          time: 10,
        },
      ],
    }

    fs.writeFileSync(
      path.join(quizzDir, "p0-roster-quizz.json"),
      JSON.stringify(testQuiz, null, 2),
      "utf-8",
    )

    process.env.CONFIG_PATH = tempConfigDir
    initConfig()

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

  const fetchApi = (url: string, init?: RequestInit): Promise<Response> => {
    if (!realTransport) {
      throw new Error("realTransport not initialized")
    }

    return realTransport.http.fetch(url, init)
  }

  const loginManager = async (): Promise<string> => {
    const res = await fetchApi(`${baseUrl}/api/auth/manager`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: managerPassword }),
    })
    const data = (await res.json()) as { token: string }

    return data.token
  }

  const createRealGame = async (
    token: string,
  ): Promise<{ gameId: string; inviteCode: string }> => {
    const res = await fetchApi(`${baseUrl}/api/games`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quizzId: "p0-roster-quizz" }),
    })

    return (await res.json()) as { gameId: string; inviteCode: string }
  }

  it("enforces phoneInviteOnly, auto-recognizes saved callers by phone, and never leaks phone numbers to player sockets", async () => {
    const mgrToken = await loginManager()
    const { gameId, inviteCode } = await createRealGame(mgrToken)

    // 1. Add 2 participants to roster (+972 and +44) and enable phoneInviteOnly
    const add1 = await fetchApi(
      `${baseUrl}/api/games/${gameId}/roster`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${mgrToken}`,
        },
        body: JSON.stringify({
          displayName: "David Israel",
          phone: "050-222-3344",
        }),
      },
    )
    expect(add1.status).toBe(200)
    const add1Data = (await add1.json()) as {
      presence: HostPresenceSnapshot
      participant: { rosterPlayerId: string; phoneE164: string }
    }
    expect(add1Data.participant.phoneE164).toBe("+972502223344")

    const add2 = await fetchApi(
      `${baseUrl}/api/games/${gameId}/roster`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${mgrToken}`,
        },
        body: JSON.stringify({
          displayName: "Sarah London",
          phone: "+44 7911 654321",
        }),
      },
    )
    expect(add2.status).toBe(200)

    const setInviteOnly = await fetchApi(
      `${baseUrl}/api/games/${gameId}/roster/settings`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${mgrToken}`,
        },
        body: JSON.stringify({ phoneInviteOnly: true }),
      },
    )
    expect(setInviteOnly.status).toBe(200)

    // 2. Unrecognized phone caller via /api/games/pilot-phone is rejected with 403
    const unknownCall = await fetchApi(
      `${baseUrl}/api/games/pilot-phone`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "join_or_poll",
          gameId,
          callId: "unknown-call-1",
          phone: "052-999-8888",
        }),
      },
    )
    expect(unknownCall.status).toBe(403)
    const unknownBody = (await unknownCall.json()) as { error: string; reason?: string }
    expect(unknownBody.error).toBe("errors:game.locked")
    expect(unknownBody.reason).toBe("phone_invite_only")

    // 3. Recognized phone caller joins automatically with saved name "David Israel"
    const knownCall = await fetchApi(
      `${baseUrl}/api/games/pilot-phone`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "join_or_poll",
          gameId,
          callId: "david-call-1",
          phone: "+972502223344",
        }),
      },
    )
    expect(knownCall.status).toBe(200)
    const knownBody = (await knownCall.json()) as {
      ok: boolean
      joined: boolean
      rosterPlayerId: string
      displayName: string
      phoneE164: string
    }
    expect(knownBody.ok).toBe(true)
    expect(knownBody.joined).toBe(true)
    expect(knownBody.displayName).toBe("David Israel")
    expect(knownBody.phoneE164).toBe("+972502223344")
    expect(knownBody.rosterPlayerId).toBe(add1Data.participant.rosterPlayerId)

    // 4. Web player joins normally and must NEVER receive phone numbers on any event
    const sessRes = await fetchApi(
      `${baseUrl}/api/auth/session`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    )
    const { token: webToken } = (await sessRes.json()) as { token: string }

    // Web player attempting to fetch manager roster is rejected
    const forbiddenRoster = await fetchApi(
      `${baseUrl}/api/games/${gameId}/roster`,
      {
        headers: { Authorization: `Bearer ${webToken}` },
      },
    )
    expect([401, 403]).toContain(forbiddenRoster.status)

    const joinRes = await fetchApi(
      `${baseUrl}/api/games/join`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${webToken}`,
        },
        body: JSON.stringify({ inviteCode, username: "WebGuest" }),
      },
    )
    expect(joinRes.status).toBe(200)
    const { ticket } = (await joinRes.json()) as { ticket: string }

    const receivedPayloads: string[] = []
    const webSocket: Socket = connect(baseUrl, {
      path: "/ws",
      auth: { token: webToken },
      transports: ["websocket"],
      forceNew: true,
    })

    webSocket.onAny((_event, ...args) => {
      receivedPayloads.push(JSON.stringify(args))
    })

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 4000)
      webSocket.on(EVENTS.GAME.SUCCESS_JOIN, () => {
        clearTimeout(t)
        resolve()
      })
      webSocket.emit(EVENTS.PLAYER.LOGIN, { ticket })
    })

    // Ensure no payload received by the web player contains David's or Sarah's phone numbers
    for (const payloadStr of receivedPayloads) {
      expect(payloadStr).not.toContain("+972502223344")
      expect(payloadStr).not.toContain("502223344")
      expect(payloadStr).not.toContain("+447911654321")
    }

    webSocket.disconnect()
    Registry.getInstance().removeGame(gameId)
  })

  it("handles 100 registered phone participants, 15 disconnecting (85 / 100), and all 15 redialing with NEW CallId & auth session (100 / 100) preserving exact rosterPlayerId and scores across 2 questions", async () => {
    const mgrToken = await loginManager()
    const { gameId } = await createRealGame(mgrToken)

    // 1. Import 100 participants via XLSX upload to the live game
    const rows: string[][] = [["name", "phone"]]
    const indices100 = Array.from({ length: 100 }, (_, idx) => idx + 1)
    const indices15 = Array.from({ length: 15 }, (_, idx) => idx + 1)

    for (const i of indices100) {
      const padded = String(i).padStart(4, "0")
      rows.push([`Caller_${i}`, `050-777-${padded}`])
    }
    const xlsxBuf = buildXlsxBuffer(rows)

    const importRes = await fetchApi(
      `${baseUrl}/api/games/${gameId}/roster/import`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${mgrToken}`,
        },
        body: JSON.stringify({
          filename: "100-callers.xlsx",
          contentBase64: Buffer.from(xlsxBuf).toString("base64"),
          commit: true,
          phoneInviteOnly: true,
        }),
      },
    )
    expect(importRes.status).toBe(200)
    const importBody = (await importRes.json()) as {
      presence: HostPresenceSnapshot
    }
    expect(importBody.presence.registeredTotal).toBe(100)
    expect(importBody.presence.notJoinedNow).toBe(100)
    expect(importBody.presence.connectedNow).toBe(0)

    // 2. All 100 callers dial in and join
    const rosterIdsByIndex = new Map<number, string>()
    const joinResults = await Promise.all(
      indices100.map(async (i) => {
        const padded = String(i).padStart(4, "0")
        const res = await fetchApi(`${baseUrl}/api/games/pilot-phone`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "join_or_poll",
            gameId,
            callId: `initial-call-${i}`,
            phone: `050-777-${padded}`,
          }),
        })
        expect(res.status).toBe(200)
        const data = (await res.json()) as { rosterPlayerId: string }

        return { i, rosterPlayerId: data.rosterPlayerId }
      }),
    )

    for (const item of joinResults) {
      rosterIdsByIndex.set(item.i, item.rosterPlayerId)
    }

    const game = Registry.getInstance().getGameById(gameId)

    if (!game) {
      throw new Error("Game not found")
    }

    const snapAllConnected = game.getHostPresenceSnapshot()
    expect(snapAllConnected.registeredTotal).toBe(100)
    expect(snapAllConnected.connectedNow).toBe(100)
    expect(snapAllConnected.disconnectedNow).toBe(0)
    expect(snapAllConnected.notJoinedNow).toBe(0)

    // 3. Start Question 1 and put it into SELECT_ANSWER state
    const internalRound = (
      game as unknown as {
        round: {
          started: boolean
          acceptingAnswers: boolean
          currentQuestion: number
          startTime: number
          playersAnswers: unknown[]
          showResults: () => void
        }
      }
    ).round
    internalRound.started = true
    internalRound.currentQuestion = 0
    internalRound.startTime = Date.now()
    internalRound.playersAnswers = []
    internalRound.acceptingAnswers = true

    // All 100 callers answer Q1 (solution is index 0)
    await Promise.all(
      indices100.map(async (i) => {
        const rId = rosterIdsByIndex.get(i) ?? ""
        const ansRes = await fetchApi(`${baseUrl}/api/games/pilot-phone`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "answer",
            gameId,
            callId: `initial-call-${i}`,
            rosterPlayerId: rId,
            answerIndex: 0,
          }),
        })
        expect(ansRes.status).toBe(200)
        const ansData = (await ansRes.json()) as { accepted: boolean }
        expect(ansData.accepted).toBe(true)
      }),
    )

    // Score Q1 if not already scored by last player
    if (internalRound.acceptingAnswers as boolean) {
      internalRound.showResults()
    }

    // Verify all 100 callers have positive score > 0 after Q1
    const snapAfterQ1 = game.getHostPresenceSnapshot()
    const q1ScoresByRosterId = new Map<string, number>()
    for (const p of snapAfterQ1.players) {
      expect(p.points).toBeGreaterThan(0)
      q1ScoresByRosterId.set(p.rosterPlayerId, p.points)
    }
    const caller1RId = rosterIdsByIndex.get(1) ?? ""
    const q1ScoreCaller1 = q1ScoresByRosterId.get(caller1RId) ?? 0

    // 4. 15 callers (1..15) hang up / disconnect
    await Promise.all(
      indices15.map(async (i) => {
        const padded = String(i).padStart(4, "0")
        const hangupRes = await fetchApi(`${baseUrl}/api/games/pilot-phone`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "hangup",
            gameId,
            callId: `initial-call-${i}`,
            phone: `050-777-${padded}`,
          }),
        })
        expect(hangupRes.status).toBe(200)
      }),
    )

    // Host presence counter must truthfully reflect 85 / 100
    const snap85 = game.getHostPresenceSnapshot()
    expect(snap85.registeredTotal).toBe(100)
    expect(snap85.connectedNow).toBe(85)
    expect(snap85.disconnectedNow).toBe(15)
    // Disconnected callers still keep their Q1 score!
    const disconnectedCaller1 = snap85.players.find(
      (p) => p.rosterPlayerId === caller1RId,
    )
    expect(disconnectedCaller1?.status).toBe("disconnected")
    expect(disconnectedCaller1?.points).toBe(q1ScoreCaller1)

    // 5. All 15 callers redial with a brand-new CallId from their same phone number
    await Promise.all(
      indices15.map(async (i) => {
        const padded = String(i).padStart(4, "0")
        const redialRes = await fetchApi(`${baseUrl}/api/games/pilot-phone`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "join_or_poll",
            gameId,
            callId: `redial-brand-new-call-${i}`,
            phone: `+97250777${padded}`,
          }),
        })
        expect(redialRes.status).toBe(200)
        const redialData = (await redialRes.json()) as {
          reconnected: boolean
          rosterPlayerId: string
          state: { points: number }
        }
        expect(redialData.reconnected).toBe(true)
        // Must rebind to the EXACT same rosterPlayerId and preserve Q1 points!
        const expectedRId = rosterIdsByIndex.get(i) ?? ""
        expect(redialData.rosterPlayerId).toBe(expectedRId)
        expect(redialData.state.points).toBe(q1ScoresByRosterId.get(expectedRId))
      }),
    )

    // Host presence counter must now return to 100 / 100 with zero duplicates!
    const snap100Again = game.getHostPresenceSnapshot()
    expect(snap100Again.registeredTotal).toBe(100)
    expect(snap100Again.connectedNow).toBe(100)
    expect(snap100Again.disconnectedNow).toBe(0)
    expect(game.players.length).toBe(100)

    // 6. Advance to Question 2 (solution is index 1) and verify redialed callers score on Q2
    internalRound.currentQuestion = 1
    internalRound.startTime = Date.now()
    internalRound.playersAnswers = []
    internalRound.acceptingAnswers = true

    await Promise.all(
      indices15.map(async (i) => {
        const rId = rosterIdsByIndex.get(i) ?? ""
        const ans2 = await fetchApi(`${baseUrl}/api/games/pilot-phone`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "answer",
            gameId,
            callId: `redial-brand-new-call-${i}`,
            rosterPlayerId: rId,
            answerIndex: 1,
          }),
        })
        expect(ans2.status).toBe(200)
        const ans2Data = (await ans2.json()) as { accepted: boolean }
        expect(ans2Data.accepted).toBe(true)

        // Duplicate answer in same epoch must be rejected
        const dupAns = await fetchApi(`${baseUrl}/api/games/pilot-phone`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "answer",
            gameId,
            callId: `redial-brand-new-call-${i}`,
            rosterPlayerId: rId,
            answerIndex: 1,
          }),
        })
        const dupData = (await dupAns.json()) as {
          accepted: boolean
          reason: string
        }
        expect(dupData.accepted).toBe(false)
        expect(dupData.reason).toBe("duplicate_answer")
      }),
    )

    internalRound.showResults()

    const snapAfterQ2 = game.getHostPresenceSnapshot()
    const caller1AfterQ2 = snapAfterQ2.players.find(
      (p) => p.rosterPlayerId === caller1RId,
    )
    expect(caller1AfterQ2?.points).toBeGreaterThan(q1ScoreCaller1)

    Registry.getInstance().removeGame(gameId)
  })
})
