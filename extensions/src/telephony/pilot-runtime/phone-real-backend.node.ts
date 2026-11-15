// Run only in the assigned isolated Linux container after remote runner transfer.
// Security assertions deliberately fail if the current backend violates a gate.
import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { randomBytes, createHash } from "node:crypto"
import { fork } from "node:child_process"
import { once } from "node:events"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { resolve, join, sep, dirname } from "node:path"
import { fileURLToPath } from "node:url"

if (process.env.TADAZZ_PHONE_QA_RUN !== "isolated-actual-backend") {
  throw new Error("Explicit isolated phone QA execution required")
}
const fixtureParent = resolve(
  process.env.TADAZZ_PHONE_QA_FIXTURES || "/invalid",
)
const evidenceParent = resolve(
  process.env.TADAZZ_PHONE_QA_EVIDENCE || "/invalid",
)
if (
  !fixtureParent.startsWith("/fixtures/phone-") ||
  !evidenceParent.startsWith("/evidence/phone-api-")
) {
  throw new Error("Dedicated phone fixture and evidence mounts required")
}
mkdirSync(fixtureParent, { recursive: true })
mkdirSync(evidenceParent, { recursive: true })
const fixture = mkdtempSync(join(fixtureParent, "actual-api-"))
assert.ok(fixture.startsWith(fixtureParent + sep))
writeFileSync(
  join(fixture, "PHONE_QA_SYNTHETIC_ONLY"),
  "No production or provider data\n",
)
mkdirSync(join(fixture, "quizz"))
writeFileSync(
  join(fixture, "quizz", "phone-api-qa.json"),
  JSON.stringify({
    id: "phone-api-qa",
    subject: "Synthetic phone API security QA",
    gameMode: "quiz",
    questions: [0, 1].map((n) => ({
      type: "single",
      question: "Synthetic question " + n,
      answers: ["One", "Two", "Three", "Four", "Five"],
      solutions: [4],
      cooldown: 3,
      time: 60,
    })),
  }),
)

// Synthetic keys generated here; never inherited from the host or logged.
for (const key of Object.keys(process.env)) {
  if (
    /^(?:TADA_|TADAZZ_|JWT_SECRET$|MANAGER_PASSWORD$|CONFIG_PATH$|GAME_SPEED$)/u.test(
      key,
    ) &&
    ![
      "TADAZZ_PHONE_QA_RUN",
      "TADAZZ_PHONE_QA_FIXTURES",
      "TADAZZ_PHONE_QA_EVIDENCE",
      "TADAZZ_PHONE_QA_REVIEW_SHA",
    ].includes(key)
  )
    delete process.env[key]
}
const pilotSecret = randomBytes(32).toString("hex")
process.env.CONFIG_PATH = fixture
process.env.MANAGER_PASSWORD = randomBytes(24).toString("hex")
process.env.JWT_SECRET = randomBytes(32).toString("hex")
process.env.TADA_PILOT_SECRET = pilotSecret
process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
process.env.TADAZZ_BILLING_ENABLED = "false"
process.env.GAME_SPEED = "1"

const { createAdaptorServer } = await import("@hono/node-server")
const { app, createSocketServer } = await import("@razzia/socket/app")
const { initConfig } = await import("@razzia/socket/services/config")
const { default: Registry } = await import("@razzia/socket/services/registry")
const { EVENTS } = await import("@razzia/common/constants")
const { STATUS } = await import("@razzia/common/types/game/status")
const { normalizePhoneE164 } = await import("@razzia/extensions/core")
const { io: connect } = await import("socket.io-client")
const server = createAdaptorServer(app)
const io = createSocketServer(server)
const registry = Registry.getInstance()
const receipts: unknown[] = []
let base = ""
let phoneNumber = 0
const childPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "phone-gateway-qa-child.cjs",
)
const callHash = (id: string) =>
  createHash("sha256").update(id).digest("hex").slice(0, 24)
// UK drama-number range, generated synthetic identities, never dialed.
const phone = () => "+44" + "770090" + String(++phoneNumber).padStart(4, "0")

async function waitFor(predicate: () => boolean, label: string, ms = 12000) {
  const until = Date.now() + ms
  while (!predicate()) {
    if (Date.now() >= until) throw new Error("Deadline: " + label)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
async function api(
  path: string,
  payload?: unknown,
  token?: string,
  secret?: string,
  method?: string,
) {
  const response = await fetch(base + path, {
    method: method ?? (payload === undefined ? "GET" : "POST"),
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(secret ? { "x-tada-pilot-secret": secret } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(6000),
  })
  return { status: response.status, data: await response.json() }
}
function socketEvent(socket: any, event: string, ms = 5000) {
  return new Promise<void>((done, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      socket.off(event, success)
      socket.off("connect_error", failure)
    }
    const success = () => {
      cleanup()
      done()
    }
    const failure = () => {
      cleanup()
      reject(new Error("Socket event failed: " + event))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error("Socket event deadline: " + event))
    }, ms)
    socket.once(event, success)
    socket.once("connect_error", failure)
  })
}
async function room(t: any) {
  const login = await api("/api/auth/manager", {
    password: process.env.MANAGER_PASSWORD,
  })
  assert.equal(login.status, 200, "synthetic manager login")
  const token = login.data.token
  const created = await api("/api/games", { quizzId: "phone-api-qa" }, token)
  assert.equal(created.status, 201, "create actual synthetic game")
  const gameId = created.data.gameId
  const game = registry.getGameById(gameId)!
  assert.ok(game, "actual registered Game required")
  const socket = connect(base, {
    path: "/ws",
    auth: { token },
    transports: ["websocket"],
    forceNew: true,
    timeout: 5000,
    reconnection: false,
    autoConnect: false,
  })
  t.after(() => {
    registry.removeGame(gameId)
    socket.disconnect()
  })
  let statusSequence = 0
  let statusName = ""
  socket.on(EVENTS.GAME.STATUS, (status) => {
    statusSequence++
    statusName = status.name
  })
  const connected = socketEvent(socket, "connect")
  socket.connect()
  await connected
  const reconnected = socketEvent(socket, EVENTS.MANAGER.SUCCESS_RECONNECT)
  socket.emit(EVENTS.MANAGER.RECONNECT, { gameId })
  await reconnected
  const pilot = (
    payload: Record<string, unknown>,
    secret: string | undefined = pilotSecret,
  ) => api("/api/games/pilot-phone", { gameId, ...payload }, undefined, secret)
  const snapshot = (rosterId: string) => {
    const entry = game.getRosterEntry(rosterId)
    const state = game.getQuestionStateForGateway(rosterId)
    const presence = game.getHostPresenceSnapshot()
    return {
      exists: !!entry,
      activeCallId: entry?.activeCallId ?? null,
      status: entry?.status,
      clientId: entry?.clientId,
      points: state.points,
      epoch: state.epoch,
      answered: state.answeredCurrentQuestion,
      connected: presence.connectedNow,
      players: game.players.length,
      registered: presence.registeredTotal,
    }
  }
  const start = async () => {
    socket.emit(EVENTS.MANAGER.START_GAME, { gameId })
    await waitFor(() => game.started, "actual start")
    await waitFor(
      () =>
        game.getQuestionStateForGateway().epoch === 1 &&
        game.getQuestionStateForGateway().acceptingAnswers,
      "actual answer window",
      12000,
    )
  }
  const advanceUntil = async (predicate: (state: any) => boolean) => {
    for (let i = 0; i < 16; i++) {
      if (predicate(game.getQuestionStateForGateway())) return
      const previous = statusSequence
      if (
        statusName === STATUS.SHOW_PREPARED ||
        statusName === STATUS.SHOW_QUESTION
      ) {
        await waitFor(
          () =>
            predicate(game.getQuestionStateForGateway()) ||
            statusSequence !== previous,
          "authoritative question preview",
          6000,
        )
        continue
      }
      socket.emit(EVENTS.MANAGER.ADVANCE, { gameId })
      // A status acknowledgement, not a guessed host countdown.
      await waitFor(
        () =>
          predicate(game.getQuestionStateForGateway()) ||
          statusSequence !== previous,
        "manager advance",
        4000,
      )
    }
    assert.fail(
      "No matching authoritative phase after bounded manager advances",
    )
  }
  return { gameId, game, socket, token, pilot, snapshot, start, advanceUntil }
}

async function gateway(t: any, gameId: string) {
  const child = fork(childPath, [], {
    execArgv: [],
    env: {
      PATH: process.env.PATH,
      TADAZZ_PHONE_QA_CHILD: "1",
      TADA_PILOT_SECRET: pilotSecret,
      TADA_RAZZIA_API_URL: base + "/api/games/pilot-phone",
      TADA_ACTIVE_GAME_ID: gameId,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  })
  const messages: any[] = []
  let sequence = 0
  child.on("message", (message) => messages.push(message))
  // Drop child transport logs; they can contain dialed identities. Keep only the
  // exact structured assertions below, not raw request bodies/tokens/phones.
  child.stdout?.resume()
  child.stderr?.resume()
  let exited = false
  child.on("error", () => {
    exited = true
  })
  child.on("exit", () => {
    exited = true
  })
  t.after(async () => {
    if (!exited) {
      child.kill()
      await once(child, "exit")
    }
  })
  await waitFor(
    () => messages.some((m) => m.event === "ready") || exited,
    "gateway ready",
    6000,
  )
  assert.equal(exited, false, "gateway child must start")
  const port = messages.find((m) => m.event === "ready").port
  const command = async (op: string, data = {}) => {
    const id = ++sequence
    child.send({ id, op, ...data })
    await waitFor(
      () => messages.some((m) => m.ack === id) || exited,
      "gateway IPC",
      4000,
    )
    assert.equal(exited, false, "gateway child must remain running")
    return messages.find((m) => m.ack === id)
  }
  const call = async (id: string, identity: string, values = {}) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/yemot/${pilotSecret}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          ApiCallId: id,
          ApiPhone: identity,
          ...values,
        }),
        signal: AbortSignal.timeout(12000),
      },
    )
    assert.equal(response.status, 200, "gateway response")
    return response.text()
  }
  const stop = async () => {
    child.kill()
    if (!exited) await once(child, "exit")
  }
  return {
    call,
    command,
    stop,
    held: (id: string) =>
      waitFor(
        () =>
          messages.some(
            (m) => m.event === "join-held" && m.callId === callHash(id),
          ),
        "controlled join hold",
        6000,
      ),
  }
}

function record(name: string, observed: unknown) {
  receipts.push({ name, observed })
}
before(async () => {
  initConfig()
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  base = "http://127.0.0.1:" + address.port
})
after(async () => {
  writeFileSync(
    join(evidenceParent, "actual-api-observations.json"),
    JSON.stringify(
      {
        review_sha: process.env.TADAZZ_PHONE_QA_REVIEW_SHA,
        fixture,
        scope:
          "actual Hono/Socket.IO/Game with synthetic identities; no provider",
        observations: receipts,
      },
      null,
      2,
    ) + "\n",
  )
  for (const game of registry.getAllGames()) registry.removeGame(game.gameId)
  registry.cleanup()
  io.disconnectSockets(true)
  await new Promise<void>((done) => io.close(() => done()))
  server.closeAllConnections?.()
  if (server.listening)
    await new Promise<void>((done) => server.close(() => done()))
})

test(
  "API01 configured route secret rejects missing/wrong credentials without roster mutation",
  { timeout: 15000 },
  async (t) => {
    const r = await room(t)
    const payload = {
      action: "join_or_poll",
      callId: "direct-auth-A",
      phone: phone(),
    }
    const missing = await r.pilot(payload, "")
    const wrong = await r.pilot(payload, "synthetic-wrong-key")
    record("API01", {
      missing: missing.status,
      wrong: wrong.status,
      registered: r.game.getHostPresenceSnapshot().registeredTotal,
    })
    assert.equal(missing.status, 401)
    assert.equal(wrong.status, 401)
    assert.equal(r.game.getHostPresenceSnapshot().registeredTotal, 0)
  },
)

test(
  "API02 absent route-secret configuration fails closed",
  { timeout: 15000 },
  async (t) => {
    const r = await room(t)
    delete process.env.TADA_PILOT_SECRET
    try {
      const response = await r.pilot(
        {
          action: "join_or_poll",
          callId: "direct-unconfigured-A",
          phone: phone(),
        },
        "",
      )
      record("API02", {
        status: response.status,
        joined: response.data.joined === true,
        registered: r.game.getHostPresenceSnapshot().registeredTotal,
      })
      assert.ok(
        [401, 403, 503].includes(response.status),
        "Missing secret configuration must deny private pilot actions",
      )
      assert.equal(r.game.getHostPresenceSnapshot().registeredTotal, 0)
    } finally {
      process.env.TADA_PILOT_SECRET = pilotSecret
    }
  },
)

test(
  "API03 stale A poll after B rebind is denied without returning B private roster state",
  { timeout: 15000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const a = await r.pilot({
      action: "join_or_poll",
      callId: "direct-poll-A",
      phone: identity,
    })
    const rosterId = a.data.rosterPlayerId
    await r.pilot({
      action: "join_or_poll",
      callId: "direct-poll-B",
      phone: identity,
    })
    const before = r.snapshot(rosterId)
    const stale = await r.pilot({
      action: "join_or_poll",
      callId: "direct-poll-A",
      phone: identity,
      rosterPlayerId: rosterId,
    })
    const after = r.snapshot(rosterId)
    record("API03", {
      status: stale.status,
      joined: stale.data.joined === true,
      returnsPhone: !!stale.data.phoneE164,
      before,
      after,
    })
    assert.deepEqual(after, before)
    assert.notEqual(
      stale.data.joined,
      true,
      "Stale poll must not claim the active roster identity",
    )
    assert.equal(
      stale.data.phoneE164,
      undefined,
      "Stale poll must not return private phone identity",
    )
  },
)

test(
  "API04 late A answer/hangup preserve B binding and B earns authoritative score",
  { timeout: 30000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const a = await r.pilot({
      action: "join_or_poll",
      callId: "direct-bound-A",
      phone: identity,
    })
    const rosterId = a.data.rosterPlayerId
    await r.pilot({
      action: "join_or_poll",
      callId: "direct-bound-B",
      phone: identity,
    })
    await r.start()
    const before = r.snapshot(rosterId)
    const stale = await r.pilot({
      action: "answer",
      callId: "direct-bound-A",
      phone: identity,
      rosterPlayerId: rosterId,
      epoch: before.epoch,
      answerIndex: 4,
    })
    await r.pilot({
      action: "hangup",
      callId: "direct-bound-A",
      phone: identity,
      rosterPlayerId: rosterId,
    })
    const after = r.snapshot(rosterId)
    record("API04-rejection", {
      accepted: stale.data.accepted,
      reason: stale.data.reason,
      before,
      after,
    })
    assert.equal(stale.data.accepted, false)
    assert.equal(stale.data.reason, "stale_call")
    assert.deepEqual(after, before)
    const accepted = await r.pilot({
      action: "answer",
      callId: "direct-bound-B",
      phone: identity,
      rosterPlayerId: rosterId,
      epoch: before.epoch,
      answerIndex: 4,
    })
    assert.equal(accepted.data.accepted, true)
    assert.equal(r.snapshot(rosterId).answered, true)
    await r.advanceUntil(() => r.snapshot(rosterId).points > 0)
    record("API04-score", r.snapshot(rosterId))
    assert.ok(
      r.snapshot(rosterId).points > 0,
      "Actual server must score the active caller",
    )
  },
)

test(
  "API05 stale epoch is rejected; current epoch key5 is accepted exactly once",
  { timeout: 30000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const a = await r.pilot({
      action: "join_or_poll",
      callId: "direct-epoch-B",
      phone: identity,
    })
    const rosterId = a.data.rosterPlayerId
    await r.start()
    const firstEpoch = r.snapshot(rosterId).epoch
    await r.advanceUntil((s) => s.epoch > firstEpoch && s.acceptingAnswers)
    const before = r.snapshot(rosterId)
    const stale = await r.pilot({
      action: "answer",
      callId: "direct-epoch-B",
      phone: identity,
      rosterPlayerId: rosterId,
      epoch: firstEpoch,
      answerIndex: 4,
    })
    const after = r.snapshot(rosterId)
    record("API05-stale", {
      accepted: stale.data.accepted,
      reason: stale.data.reason,
      before,
      after,
    })
    assert.equal(stale.data.reason, "stale_question_epoch")
    assert.equal(stale.data.accepted, false)
    assert.deepEqual(after, before)
    const payload = {
      action: "answer",
      callId: "direct-epoch-B",
      phone: identity,
      rosterPlayerId: rosterId,
      epoch: before.epoch,
      answerIndex: 4,
    }
    assert.equal((await r.pilot(payload)).data.accepted, true)
    assert.equal((await r.pilot(payload)).data.accepted, false)
    assert.equal(r.snapshot(rosterId).answered, true)
  },
)

test(
  "API06 unknown phone/call cannot poll a connected victim roster by supplied roster ID",
  { timeout: 15000 },
  async (t) => {
    const r = await room(t)
    const victim = await r.pilot({
      action: "join_or_poll",
      callId: "direct-victim-A",
      phone: phone(),
    })
    const rosterId = victim.data.rosterPlayerId
    const before = r.snapshot(rosterId)
    const spoof = await r.pilot({
      action: "join_or_poll",
      callId: "direct-spoof-C",
      phone: phone(),
      rosterPlayerId: rosterId,
    })
    record("API06", {
      status: spoof.status,
      joined: spoof.data.joined === true,
      returnsPhone: !!spoof.data.phoneE164,
      before,
      after: r.snapshot(rosterId),
    })
    assert.deepEqual(r.snapshot(rosterId), before)
    assert.notEqual(
      spoof.data.joined,
      true,
      "Unbound roster poll must be denied",
    )
    assert.equal(spoof.data.phoneE164, undefined)
  },
)

test(
  "API07 unknown phone cannot rebind a disconnected victim through its roster ID",
  { timeout: 15000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const victim = await r.pilot({
      action: "join_or_poll",
      callId: "direct-away-A",
      phone: identity,
    })
    const rosterId = victim.data.rosterPlayerId
    await r.pilot({
      action: "hangup",
      callId: "direct-away-A",
      phone: identity,
      rosterPlayerId: rosterId,
    })
    const before = r.snapshot(rosterId)
    const spoof = await r.pilot({
      action: "join_or_poll",
      callId: "direct-away-spoof",
      phone: phone(),
      rosterPlayerId: rosterId,
    })
    const after = r.snapshot(rosterId)
    record("API07", {
      status: spoof.status,
      joined: spoof.data.joined === true,
      before,
      after,
    })
    assert.deepEqual(
      after,
      before,
      "Wrong-phone rebind must not change authoritative roster",
    )
    assert.notEqual(spoof.data.joined, true)
  },
)

test(
  "API08 phone mismatch plus copied roster/call IDs cannot submit a victim answer",
  { timeout: 25000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const victim = await r.pilot({
      action: "join_or_poll",
      callId: "direct-answer-victim",
      phone: identity,
    })
    const rosterId = victim.data.rosterPlayerId
    await r.start()
    const before = r.snapshot(rosterId)
    const spoof = await r.pilot({
      action: "answer",
      callId: "direct-answer-victim",
      phone: phone(),
      rosterPlayerId: rosterId,
      epoch: before.epoch,
      answerIndex: 4,
    })
    const after = r.snapshot(rosterId)
    record("API08", {
      accepted: spoof.data.accepted,
      before,
      after,
      threat:
        "trusted gateway key present, copied caller identifiers, mismatched phone",
    })
    assert.notEqual(
      spoof.data.accepted,
      true,
      "Caller identity mismatch must be rejected",
    )
    assert.deepEqual(after, before)
  },
)

test(
  "API09 failed cleanup followed by TTL expiry cannot let old A replace B",
  { timeout: 25000 },
  async (t) => {
    const r = await room(t),
      identity = phone(),
      gw = await gateway(t, r.gameId)
    await gw.call("gateway-ttl-A", identity)
    const rosterId = r.game.findRosterByPhone(identity)!.rosterPlayerId
    await gw.command("fail-hangups", { count: 1 })
    await gw.call("gateway-ttl-A", identity, { hangup: "yes" })
    assert.equal(
      r.snapshot(rosterId).status,
      "connected",
      "Injected pre-forward cleanup failure must leave actual backend connected",
    )
    await gw.call("gateway-ttl-B", identity)
    const before = r.snapshot(rosterId)
    assert.equal(before.activeCallId, callHash("gateway-ttl-B"))
    assert.equal(await gw.call("gateway-ttl-A", identity), "hangup")
    await gw.command("tick", { ms: 10 * 60 * 1000 + 1 })
    const response = await gw.call("gateway-ttl-A", identity)
    const after = r.snapshot(rosterId)
    record("API09", {
      before,
      after,
      oldCallbackHungUp: response === "hangup",
      gatewayClockOnly: true,
    })
    assert.deepEqual(
      after,
      before,
      "Retired ID after TTL must not rebind the actual roster",
    )
    assert.equal(response, "hangup")
  },
)

test(
  "API10 real gateway process restart cannot revive retired A and replace B",
  { timeout: 25000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const first = await gateway(t, r.gameId)
    await first.call("gateway-restart-A", identity)
    await first.call("gateway-restart-A", identity, { hangup: "yes" })
    await first.call("gateway-restart-B", identity)
    const rosterId = r.game.findRosterByPhone(identity)!.rosterPlayerId
    const before = r.snapshot(rosterId)
    await first.stop()
    const restarted = await gateway(t, r.gameId)
    const response = await restarted.call("gateway-restart-A", identity)
    const after = r.snapshot(rosterId)
    record("API10", {
      before,
      after,
      oldCallbackHungUp: response === "hangup",
      actualChildRestart: true,
    })
    assert.deepEqual(
      after,
      before,
      "Process-local history loss must not authorize retired IDs",
    )
    assert.equal(response, "hangup")
  },
)

test(
  "API11 documented national/international aliases cannot reorder A after B",
  { timeout: 25000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const national = "0" + identity.slice(3)
    assert.equal(
      normalizePhoneE164(national),
      normalizePhoneE164(identity),
      "Actual core contract must identify alias equality",
    )
    const gw = await gateway(t, r.gameId)
    await gw.command("hold-join", { callId: callHash("gateway-alias-A") })
    const a = gw.call("gateway-alias-A", national)
    await gw.held("gateway-alias-A")
    try {
      // Deliver B through the actual API while A's earlier request is held in
      // transport. The backend cannot infer provider chronology from arrival order;
      // satisfying this policy requires an agreed generation/registration contract.
      const b = await r.pilot({
        action: "join_or_poll",
        callId: callHash("gateway-alias-B"),
        phone: identity,
      })
      assert.equal(b.data.joined, true)
    } finally {
      await gw.command("release-join")
    }
    await a
    const rosterId = r.game.findRosterByPhone(identity)!.rosterPlayerId
    const observed = r.snapshot(rosterId)
    record("API11", {
      observed,
      aliasesCanonicalizeEqually: true,
      lateNetworkDelivery: "A after B",
    })
    assert.equal(
      observed.activeCallId,
      callHash("gateway-alias-B"),
      "Earlier delayed alias join must not replace the newer call",
    )
  },
)

test(
  "API12 simultaneous duplicate callbacks through actual gateway count one answer",
  { timeout: 30000 },
  async (t) => {
    const r = await room(t),
      identity = phone(),
      gw = await gateway(t, r.gameId)
    await gw.call("gateway-duplicate-A", identity)
    const rosterId = r.game.findRosterByPhone(identity)!.rosterPlayerId
    await r.start()
    await Promise.all([
      gw.call("gateway-duplicate-A", identity, { td1: "5" }),
      gw.call("gateway-duplicate-A", identity, { td1: "5" }),
    ])
    const state = r.snapshot(rosterId)
    const stats = await gw.command("stats")
    const answerRequests = stats.forwarded.filter(
      (x: any) => x.action === "answer",
    ).length
    record("API12", { ...state, answerRequests })
    assert.equal(
      answerRequests,
      1,
      "Gateway must forward only one request for the repeated read key",
    )
    assert.equal(state.answered, true)
    assert.equal(state.players, 1)
    await r.advanceUntil(() => r.snapshot(rosterId).points > 0)
    const earned = r.snapshot(rosterId).points
    assert.ok(earned > 0)
    await gw.call("gateway-duplicate-A", identity, { td2: "5" })
    assert.equal(
      r.snapshot(rosterId).points,
      earned,
      "Replay must not add points",
    )
  },
)

test(
  "API13 actual invitation-only policy rejects an unknown caller without adding roster state",
  { timeout: 15000 },
  async (t) => {
    const r = await room(t)
    const known = phone()
    const seeded = await api(
      `/api/games/${r.gameId}/roster`,
      { displayName: "Synthetic invited caller", phone: known },
      r.token,
    )
    assert.equal(seeded.status, 200)
    const setting = await api(
      `/api/games/${r.gameId}/roster/settings`,
      { phoneInviteOnly: true },
      r.token,
      undefined,
      "PATCH",
    )
    assert.equal(setting.status, 200)
    const before = r.game.getHostPresenceSnapshot()
    const denied = await r.pilot({
      action: "join_or_poll",
      callId: "direct-unknown-invitation",
      phone: phone(),
    })
    const after = r.game.getHostPresenceSnapshot()
    record("API13", {
      status: denied.status,
      reason: denied.data.reason,
      registeredBefore: before.registeredTotal,
      registeredAfter: after.registeredTotal,
      connected: after.connectedNow,
    })
    assert.equal(denied.status, 403)
    assert.equal(denied.data.reason, "phone_invite_only")
    assert.equal(after.registeredTotal, before.registeredTotal)
    assert.equal(after.connectedNow, 0)
    const admitted = await r.pilot({
      action: "join_or_poll",
      callId: "direct-invited-control",
      phone: known,
    })
    assert.equal(admitted.data.joined, true)
    assert.equal(r.game.getHostPresenceSnapshot().connectedNow, 1)
  },
)

test(
  "S01-C1 configured current poll and fresh redial work; stale cached poll denies all private fields",
  { timeout: 15000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const initial = await r.pilot({
      action: "join_or_poll",
      callId: "s01-current-A",
      phone: identity,
    })
    assert.equal(initial.status, 200)
    assert.equal(initial.data.joined, true)
    const rosterId = initial.data.rosterPlayerId
    const current = await r.pilot({
      action: "join_or_poll",
      callId: "s01-current-A",
      phone: identity,
      rosterPlayerId: rosterId,
    })
    assert.equal(current.status, 200)
    assert.equal(current.data.rosterPlayerId, rosterId)
    assert.equal(current.data.joined, true)
    // New call without a supplied cached roster is legitimate registration under
    // the current contract; S01 must not turn this into a stale-poll denial.
    const redial = await r.pilot({
      action: "join_or_poll",
      callId: "s01-current-B",
      phone: identity,
    })
    assert.equal(redial.status, 200)
    assert.equal(redial.data.joined, true)
    assert.equal(redial.data.rosterPlayerId, rosterId)
    const before = r.snapshot(rosterId)
    assert.equal(before.activeCallId, "s01-current-B")
    const stale = await r.pilot({
      action: "join_or_poll",
      callId: "s01-current-A",
      phone: identity,
      rosterPlayerId: rosterId,
    })
    assert.equal(stale.status, 403)
    assert.equal(stale.data.joined, false)
    for (const key of ["phoneE164", "displayName", "rosterPlayerId", "state"])
      assert.equal(stale.data[key], undefined)
    assert.deepEqual(r.snapshot(rosterId), before)
    const poll = await r.pilot({
      action: "join_or_poll",
      callId: "s01-current-B",
      phone: identity,
      rosterPlayerId: rosterId,
    })
    assert.equal(poll.status, 200)
    assert.equal(poll.data.joined, true)
    assert.deepEqual(r.snapshot(rosterId), before)
    record("S01-C1", {
      initial: initial.status,
      current: current.status,
      freshRedial: redial.status,
      stale: stale.status,
      privateFieldsAbsent: true,
      before,
      after: r.snapshot(rosterId),
    })
  },
)

test(
  "S01-C2 legitimate disconnected rebind preserves roster identity and earned authoritative score",
  { timeout: 30000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const initial = await r.pilot({
      action: "join_or_poll",
      callId: "s01-score-A",
      phone: identity,
    })
    const rosterId = initial.data.rosterPlayerId
    await r.start()
    const epoch = r.snapshot(rosterId).epoch
    assert.equal(
      (
        await r.pilot({
          action: "answer",
          callId: "s01-score-A",
          phone: identity,
          rosterPlayerId: rosterId,
          epoch,
          answerIndex: 4,
        })
      ).data.accepted,
      true,
    )
    await r.advanceUntil(() => r.snapshot(rosterId).points > 0)
    const earned = r.snapshot(rosterId)
    await r.pilot({
      action: "hangup",
      callId: "s01-score-A",
      phone: identity,
      rosterPlayerId: rosterId,
    })
    assert.equal(r.snapshot(rosterId).status, "disconnected")
    const rebind = await r.pilot({
      action: "join_or_poll",
      callId: "s01-score-C",
      phone: identity,
      rosterPlayerId: rosterId,
    })
    assert.equal(rebind.status, 200)
    assert.equal(rebind.data.joined, true)
    assert.equal(rebind.data.reconnected, true)
    const after = r.snapshot(rosterId)
    assert.equal(after.activeCallId, "s01-score-C")
    assert.equal(after.clientId, earned.clientId)
    assert.equal(after.points, earned.points)
    assert.equal(after.status, "connected")
    assert.equal(after.players, 1)
    assert.equal(after.registered, 1)
    await r.pilot({
      action: "hangup",
      callId: "s01-score-A",
      phone: identity,
      rosterPlayerId: rosterId,
    })
    assert.deepEqual(r.snapshot(rosterId), after)
    record("S01-C2", {
      earned,
      after,
      rebind: rebind.status,
      reconnected: rebind.data.reconnected,
    })
  },
)

function s02State(r: any, rosterId: string) {
  const entry = r.game.getRosterEntry(rosterId)
  const question = r.game.getQuestionStateForGateway(rosterId)
  const digest = (value: string | undefined | null) =>
    createHash("sha256")
      .update(value || "")
      .digest("hex")
  return {
    ...r.snapshot(rosterId),
    lastSeenAt: entry?.lastSeenAt,
    timedOut: entry?.timedOut,
    source: entry?.source,
    canonicalPhoneDigest: digest(entry?.phoneE164),
    rawPhoneDigest: digest(entry?.phoneRaw),
    acceptingAnswers: question.acceptingAnswers,
    questionIndex: question.questionIndex,
  }
}
function s02PrivateFieldsAbsent(data: any) {
  for (const key of [
    "phone",
    "phoneE164",
    "displayName",
    "rosterPlayerId",
    "clientId",
    "state",
  ]) {
    assert.equal(
      key in data,
      false,
      "Denial must not contain private field " + key,
    )
  }
  assert.notEqual(data.joined, true)
  assert.notEqual(data.accepted, true)
  assert.notEqual(data.disconnected, true)
}

test(
  "S02-C1 connected caller denies missing invalid mismatched and unknown roster across actions without victim mutation",
  { timeout: 45000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const joined = await r.pilot({
      action: "join_or_poll",
      callId: "s02-connected-A",
      phone: identity,
    })
    const rosterId = joined.data.rosterPlayerId
    await r.start()
    const firstEpoch = r.snapshot(rosterId).epoch
    assert.equal(
      (
        await r.pilot({
          action: "answer",
          callId: "s02-connected-A",
          phone: identity,
          rosterPlayerId: rosterId,
          epoch: firstEpoch,
          answerIndex: 4,
        })
      ).data.accepted,
      true,
    )
    await r.advanceUntil(() => r.snapshot(rosterId).points > 0)
    await r.advanceUntil((s) => s.epoch > firstEpoch && s.acceptingAnswers)
    const before = s02State(r, rosterId)
    assert.ok(before.points > 0)
    assert.equal(before.answered, false)
    let denied = 0
    for (const action of ["join_or_poll", "answer", "hangup"]) {
      for (const caller of [undefined, null, "", "anonymous", phone()]) {
        const response = await r.pilot({
          action,
          callId: "s02-connected-A",
          phone: caller,
          rosterPlayerId: rosterId,
          epoch: before.epoch,
          answerIndex: 4,
        })
        assert.equal(response.status, 403)
        assert.equal(response.data.reason, "caller_binding_mismatch")
        s02PrivateFieldsAbsent(response.data)
        assert.deepEqual(s02State(r, rosterId), before)
        denied++
      }
      const unknown = await r.pilot({
        action,
        callId: "s02-connected-A",
        phone: identity,
        rosterPlayerId: "s02-unknown-roster",
        epoch: before.epoch,
        answerIndex: 4,
      })
      assert.equal(unknown.status, 403)
      assert.equal(unknown.data.reason, "caller_binding_mismatch")
      s02PrivateFieldsAbsent(unknown.data)
      assert.deepEqual(s02State(r, rosterId), before)
      denied++
    }
    const valid = await r.pilot({
      action: "answer",
      callId: "s02-connected-A",
      phone: identity,
      rosterPlayerId: rosterId,
      epoch: before.epoch,
      answerIndex: 4,
    })
    assert.equal(valid.data.accepted, true)
    assert.equal(r.snapshot(rosterId).answered, true)
    record("S02-C1", {
      deniedRequests: denied,
      before,
      validCallerStillAccepted: true,
      privateFieldsAbsent: true,
    })
  },
)

test(
  "S02-C2 disconnected correlation denies unsafe inputs and canonical aliases preserve legitimate score rebind poll and hangup",
  { timeout: 45000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const joined = await r.pilot({
      action: "join_or_poll",
      callId: "s02-disconnected-A",
      phone: identity,
    })
    const rosterId = joined.data.rosterPlayerId
    await r.start()
    const epoch = r.snapshot(rosterId).epoch
    assert.equal(
      (
        await r.pilot({
          action: "answer",
          callId: "s02-disconnected-A",
          phone: identity,
          rosterPlayerId: rosterId,
          epoch,
          answerIndex: 4,
        })
      ).data.accepted,
      true,
    )
    await r.advanceUntil(() => r.snapshot(rosterId).points > 0)
    await r.pilot({
      action: "hangup",
      callId: "s02-disconnected-A",
      phone: identity,
      rosterPlayerId: rosterId,
    })
    const before = s02State(r, rosterId)
    assert.equal(before.status, "disconnected")
    assert.ok(before.points > 0)
    let denied = 0
    for (const action of ["join_or_poll", "answer", "hangup"]) {
      for (const caller of [undefined, "", "invalid", phone()]) {
        const response = await r.pilot({
          action,
          callId: "s02-disconnected-A",
          phone: caller,
          rosterPlayerId: rosterId,
          epoch: before.epoch,
          answerIndex: 4,
        })
        assert.equal(response.status, 403)
        assert.equal(response.data.reason, "caller_binding_mismatch")
        s02PrivateFieldsAbsent(response.data)
        assert.deepEqual(s02State(r, rosterId), before)
        denied++
      }
    }
    const national = "0" + identity.slice(3),
      international = "00" + identity.slice(1)
    assert.equal(normalizePhoneE164(national), normalizePhoneE164(identity))
    assert.equal(
      normalizePhoneE164(international),
      normalizePhoneE164(identity),
    )
    const rebound = await r.pilot({
      action: "join_or_poll",
      callId: "s02-disconnected-B",
      phone: national,
      rosterPlayerId: rosterId,
    })
    assert.equal(rebound.status, 200)
    assert.equal(rebound.data.joined, true)
    assert.equal(rebound.data.reconnected, true)
    const after = s02State(r, rosterId)
    assert.equal(after.activeCallId, "s02-disconnected-B")
    assert.equal(after.clientId, before.clientId)
    assert.equal(after.points, before.points)
    assert.equal(after.canonicalPhoneDigest, before.canonicalPhoneDigest)
    assert.equal(after.status, "connected")
    const poll = await r.pilot({
      action: "join_or_poll",
      callId: "s02-disconnected-B",
      phone: international,
      rosterPlayerId: rosterId,
    })
    assert.equal(poll.status, 200)
    assert.equal(poll.data.joined, true)
    assert.deepEqual(s02State(r, rosterId), after)
    assert.equal(
      (
        await r.pilot({
          action: "hangup",
          callId: "s02-disconnected-B",
          phone: international,
          rosterPlayerId: rosterId,
        })
      ).status,
      200,
    )
    assert.equal(r.snapshot(rosterId).status, "disconnected")
    record("S02-C2", {
      deniedRequests: denied,
      before,
      after,
      nationalAndInternationalAliasesAccepted: true,
      correctAliasHangupAccepted: true,
    })
  },
)

test(
  "S02-C3 actual disconnected admission refusal is propagated without joined or private state",
  { timeout: 35000 },
  async (t) => {
    const r = await room(t),
      identity = phone()
    const joined = await r.pilot({
      action: "join_or_poll",
      callId: "s02-admission-A",
      phone: identity,
    })
    const rosterId = joined.data.rosterPlayerId
    await r.start()
    const epoch = r.snapshot(rosterId).epoch
    assert.equal(
      (
        await r.pilot({
          action: "answer",
          callId: "s02-admission-A",
          phone: identity,
          rosterPlayerId: rosterId,
          epoch,
          answerIndex: 4,
        })
      ).data.accepted,
      true,
    )
    await r.advanceUntil(() => r.snapshot(rosterId).points > 0)
    await r.pilot({
      action: "hangup",
      callId: "s02-admission-A",
      phone: identity,
      rosterPlayerId: rosterId,
    })
    const before = s02State(r, rosterId)
    const { requireBilling, closeBilling } =
      await import("@razzia/socket/services/billing")
    const previousBilling = process.env.TADAZZ_BILLING_ENABLED
    const previousAccounts = process.env.TADAZZ_ACCOUNTS_ENABLED
    const previousFetch = globalThis.fetch
    let externalRequests = 0
    globalThis.fetch = (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      )
      if (url.hostname !== "127.0.0.1") {
        externalRequests++
        return Promise.reject(
          new Error("Synthetic admission case forbids external requests"),
        )
      }
      return previousFetch(input, init)
    }
    // A synthetic profile transition intentionally leaves this actual game with
    // no billing reservation. Real beginPhoneCall rejects it; no method is mocked,
    // no grants/purchases are seeded, and no provider request/credential is used.
    process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
    process.env.TADAZZ_BILLING_ENABLED = "true"
    try {
      const billing = requireBilling()
      const count = () =>
        Number(
          (
            billing.database.sql
              .prepare(
                "SELECT COUNT(*) AS n FROM billing_games WHERE game_id=?",
              )
              .get(r.gameId) as { n: number }
          ).n,
        )
      const calls = () =>
        Number(
          (
            billing.database.sql
              .prepare(
                "SELECT COUNT(*) AS n FROM billing_phone_calls WHERE game_id=?",
              )
              .get(r.gameId) as { n: number }
          ).n,
        )
      assert.equal(count(), 0)
      assert.equal(calls(), 0)
      const response = await r.pilot({
        action: "join_or_poll",
        callId: "s02-admission-B",
        phone: identity,
        rosterPlayerId: rosterId,
      })
      assert.equal(response.status, 403)
      assert.equal(response.data.reason, "caller_admission_denied")
      s02PrivateFieldsAbsent(response.data)
      assert.deepEqual(s02State(r, rosterId), before)
      assert.equal(count(), 0)
      assert.equal(calls(), 0)
      record("S02-C3", {
        before,
        after: s02State(r, rosterId),
        status: response.status,
        reason: response.data.reason,
        actualBillingReservationAbsent: true,
        billingRows: count(),
        phoneCallRows: calls(),
        externalRequests,
      })
      assert.equal(externalRequests, 0)
    } finally {
      closeBilling()
      globalThis.fetch = previousFetch
      process.env.TADAZZ_BILLING_ENABLED = previousBilling
      process.env.TADAZZ_ACCOUNTS_ENABLED = previousAccounts
    }
  },
)
