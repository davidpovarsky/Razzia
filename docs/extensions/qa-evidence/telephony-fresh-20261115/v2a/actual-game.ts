// Node-only QA helper. Not discovered by Vitest or imported by production.
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { Server as HttpServer } from "node:http"
import type { VerifiedServiceContext } from "../../../../../extensions/src/server/phone-lifecycle-v2/contracts"
import { RealGameFacade } from "../../../../../extensions/src/server/phone-lifecycle-v2/game-facade"
import { writeScopedPrecommit } from "./scoped-journal-fixture"

export async function bootActualBackend() {
  assert.equal(process.env.PHONE_V2A_GRANTED, "unmounted-synthetic-prototype")
  const parent = resolve(process.env.PHONE_V2A_FIXTURES ?? "/invalid")
  assert.ok(parent.startsWith("/fixtures/phone-v2a-"))
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  const fixture = mkdtempSync(join(parent, "actual-game-"))
  mkdirSync(join(fixture, "quizz"), { mode: 0o700 })
  writeFileSync(
    join(fixture, "quizz", "phone-v2a.json"),
    JSON.stringify({
      id: "phone-v2a",
      subject: "Synthetic unmounted V2-A",
      gameMode: "quiz",
      questions: [0, 1].map((n) => ({
        type: "single",
        question: "Synthetic " + n,
        answers: ["One", "Two", "Three", "Four", "Five"],
        solutions: [4],
        cooldown: 3,
        time: 60,
      })),
    }),
  )
  for (const key of Object.keys(process.env))
    if (
      /^(?:TADA_|TADAZZ_|JWT_SECRET$|MANAGER_PASSWORD$|CONFIG_PATH$|GAME_SPEED$)/u.test(
        key,
      )
    )
      delete process.env[key]
  process.env.CONFIG_PATH = fixture
  process.env.MANAGER_PASSWORD = randomBytes(24).toString("hex")
  process.env.JWT_SECRET = randomBytes(32).toString("hex")
  process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
  process.env.TADAZZ_BILLING_ENABLED = "false"
  process.env.GAME_SPEED = "1"
  const { createAdaptorServer } = await import("@hono/node-server")
  const { app, createSocketServer } = await import("@razzia/socket/app")
  const { initConfig } = await import("@razzia/socket/services/config")
  const { default: Registry } = await import("@razzia/socket/services/registry")
  const { io: connect } = await import("socket.io-client")
  const { EVENTS } = await import("@razzia/common/constants")
  const { STATUS } = await import("@razzia/common/types/game/status")
  initConfig()
  const server = createAdaptorServer(app),
    io = createSocketServer(server),
    registry = Registry.getInstance()
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const base = "http://127.0.0.1:" + address.port
  const sockets: ReturnType<typeof connect>[] = []
  async function waitFor(predicate: () => boolean, label: string, ms = 12000) {
    const until = Date.now() + ms
    while (!predicate()) {
      if (Date.now() >= until) throw new Error("Deadline: " + label)
      await new Promise((done) => setTimeout(done, 20))
    }
  }
  async function api(path: string, payload: unknown, token?: string) {
    const response = await fetch(base + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    })
    return { status: response.status, data: (await response.json()) as any }
  }
  function event(socket: ReturnType<typeof connect>, name: string) {
    return new Promise<void>((done, reject) => {
      const timer = setTimeout(() => {
        socket.off(name, success)
        reject(new Error("Socket deadline " + name))
      }, 6000)
      const success = () => {
        clearTimeout(timer)
        done()
      }
      socket.once(name, success)
    })
  }
  async function room() {
    const login = await api("/api/auth/manager", {
      password: process.env.MANAGER_PASSWORD,
    })
    assert.equal(login.status, 200)
    const created = await api(
      "/api/games",
      { quizzId: "phone-v2a" },
      login.data.token,
    )
    assert.equal(created.status, 201)
    const game = registry.getGameById(created.data.gameId)!
    assert.ok(game)
    const socket = connect(base, {
      path: "/ws",
      auth: { token: login.data.token },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      autoConnect: false,
    })
    sockets.push(socket)
    let sequence = 0,
      name = ""
    socket.on(EVENTS.GAME.STATUS, (status: any) => {
      sequence++
      name = status.name
    })
    const connected = event(socket, "connect")
    socket.connect()
    await connected
    const reconnected = event(socket, EVENTS.MANAGER.SUCCESS_RECONNECT)
    socket.emit(EVENTS.MANAGER.RECONNECT, { gameId: game.gameId })
    await reconnected
    const facade = new RealGameFacade(game, (id, owner) =>
      registry.getManagerGame(id, owner),
    )
    const context: VerifiedServiceContext = {
      verified: true,
      owner: game.manager.clientId,
      issuerSid: "synthetic-unverified-session",
      game: game.gameId,
      provider: "synthetic-provider",
      service: "synthetic-service",
      executorId: facade.executorId,
      actions: ["register", "poll", "answer", "hangup"],
      expiresAt: Date.now() + 600000,
    }
    async function start() {
      socket.emit(EVENTS.MANAGER.START_GAME, { gameId: game.gameId })
      await waitFor(
        () =>
          game.started && game.getQuestionStateForGateway().acceptingAnswers,
        "actual start",
      )
    }
    async function advanceUntil(predicate: () => boolean) {
      for (let i = 0; i < 16; i++) {
        if (predicate()) return
        const before = sequence
        if (name !== STATUS.SHOW_PREPARED && name !== STATUS.SHOW_QUESTION)
          socket.emit(EVENTS.MANAGER.ADVANCE, { gameId: game.gameId })
        await waitFor(
          () => predicate() || sequence !== before,
          "actual advance",
          6000,
        )
      }
      assert.fail("Bounded manager advance did not reach actual state")
    }
    function snapshot(rosterId: string) {
      const entry = game.getRosterEntry(rosterId),
        state = game.getQuestionStateForGateway(rosterId),
        presence = game.getHostPresenceSnapshot()
      return {
        activeCallId: entry?.activeCallId,
        clientId: entry?.clientId,
        status: entry?.status,
        lastSeenAt: entry?.lastSeenAt,
        points: state.points,
        epoch: state.epoch,
        answered: state.answeredCurrentQuestion,
        rosterCount: presence.registeredTotal,
        playerCount: game.players.length,
        connected: presence.connectedNow,
      }
    }
    return { game, context, facade, start, advanceUntil, snapshot }
  }
  function privateRoot() {
    const root = mkdtempSync(join(parent, "private-store-"))
    writeFileSync(
      join(root, "PHONE_V2A_SYNTHETIC_ONLY"),
      "synthetic-v2a-only\n",
      { mode: 0o600 },
    )
    return root
  }
  async function close() {
    for (const game of registry.getAllGames()) registry.removeGame(game.gameId)
    for (const socket of sockets) socket.disconnect()
    registry.cleanup()
    io.disconnectSockets(true)
    await new Promise<void>((done) => io.close(() => done()))
    if (server instanceof HttpServer) server.closeAllConnections()
    if (server.listening)
      await new Promise<void>((done) => server.close(() => done()))
  }
  return { room, privateRoot, registry, close, fixture }
}

// Fixture-only precommit. Actual gateway journal/provisioning is NOT implemented.
export function precommit(
  root: string,
  context: VerifiedServiceContext,
  requestId: string,
  phone: string,
  predecessor = 0,
  reference = requestId,
) {
  return writeScopedPrecommit(
    root,
    context,
    {
      requestId,
      providerReference: reference,
      phone,
      expectedPredecessor: predecessor,
    },
    (candidate) => candidate === context,
  )
}
