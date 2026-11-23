import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { after, test } from "node:test"
import { io as connect } from "socket.io-client"
import {
  EVENTS,
  QUESTION_LEAD_IN_SECONDS,
  QUIZZ_MODES,
  SESSION_ROLES,
} from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import type {
  Action,
  Receipt,
} from "../../src/server/phone-lifecycle-v2/contracts"
import type { UnmountedPhoneAuthority as UnmountedPhoneAuthorityInstance } from "../../src/server/phone-lifecycle-v2/auth/unmounted-factory"
import type { PrivateCallOperationHost as PrivateCallOperationHostInstance } from "../../src/telephony/pilot-runtime/gateway-v2/call-operation-host"
import type { GatewayCallAttempt } from "../../src/telephony/pilot-runtime/gateway-v2/call-precommit"
import type {
  GatewayPrivateKeyPort,
  GatewayTarget,
} from "../../src/telephony/pilot-runtime/gateway-v2/contracts"
import type { GatewayOperationIntent } from "../../src/telephony/pilot-runtime/gateway-v2/operation-precommit"

// POSIX 0o600/0o700 + O_NOFOLLOW custody modules require the Linux runtime container.
assert.notEqual(
  process.platform,
  "win32",
  "phone-v2-live-fixture.node.ts requires POSIX 0o600/0o700 and O_NOFOLLOW container runtime",
)

const tempParent = resolve(process.env.PHASE3_PHONE_TEMP_ROOT ?? tmpdir())
mkdirSync(tempParent, { recursive: true, mode: 0o700 })
const scratchRoot = realpathSync(
  mkdtempSync(join(tempParent, "phase3-phone-v2-")),
)
const configRoot = join(scratchRoot, "account-config")
mkdirSync(configRoot, { recursive: true, mode: 0o700 })

for (const key of Object.keys(process.env)) {
  if (
    /^(?:TADA_|TADAZZ_|JWT_SECRET$|MANAGER_PASSWORD$|CONFIG_PATH$|GAME_SPEED$)/u.test(
      key,
    )
  ) {
    Reflect.deleteProperty(process.env, key)
  }
}

const fixtureJwtSecret = randomBytes(32).toString("hex")
const secrets = new Set<string>([fixtureJwtSecret])
const remember = (secret: string) => {
  secrets.add(secret)

  return secret
}

process.env.CONFIG_PATH = configRoot
process.env.JWT_SECRET = fixtureJwtSecret
// Durable gateway custody uses real HTTP and filesystem time.
process.env.GAME_SPEED = process.env.PHASE3_PHONE_GAME_SPEED ?? "1"
process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
process.env.TADAZZ_BILLING_ENABLED = "false"
process.env.RESEND_API_KEY = "synthetic-never-sent"
process.env.TADAZZ_AUTH_EMAIL_FROM = "phase3-phone-qa@example.invalid"

// Import runtime modules only AFTER process.env is configured so @razzia/socket/env
// binds the fixture's JWT_SECRET and GAME_SPEED instead of capturing pre-setup values.
const { createEstimationQuestion, createQuestion, createQuizz } =
  await import("@razzia/socket/test/fixtures")
const { UnmountedPhoneAuthority } =
  await import("../../src/server/phone-lifecycle-v2/auth/unmounted-factory")
const { PrivateGatewayAdapter } =
  await import("../../src/telephony/pilot-runtime/gateway-v2/adapter")
const { PrivateCallOperationHost } =
  await import("../../src/telephony/pilot-runtime/gateway-v2/call-operation-host")
const { CALL_PRECOMMIT_CONTENT, CALL_PRECOMMIT_MARKER, PrivateCallPrecommit } =
  await import("../../src/telephony/pilot-runtime/gateway-v2/call-precommit")
const { GATEWAY_KEY_PURPOSE, GATEWAY_ROOT_CONTENT, GATEWAY_ROOT_MARKER } =
  await import("../../src/telephony/pilot-runtime/gateway-v2/contracts")
const { OPERATION_PRECOMMIT_CONTENT, OPERATION_PRECOMMIT_MARKER } =
  await import("../../src/telephony/pilot-runtime/gateway-v2/operation-precommit")
const { jwtSecret: envJwtSecret, gameSpeed: envGameSpeed } =
  await import("@razzia/socket/env")
assert.ok(
  envJwtSecret === fixtureJwtSecret,
  "@razzia/socket/env loaded before fixture JWT_SECRET initialization",
)
assert.equal(
  envGameSpeed,
  Number(process.env.GAME_SPEED),
  "@razzia/socket/env loaded before fixture GAME_SPEED initialization",
)

assert.ok(
  Number.isFinite(envGameSpeed) && envGameSpeed > 0,
  "Phone fixture GAME_SPEED must be finite and positive",
)
const gameTimeMs = (seconds: number) =>
  Math.ceil((seconds * 1000) / envGameSpeed)
const preparationSeconds = 2 + QUESTION_LEAD_IN_SECONDS
const startupMs =
  Math.max(1200, gameTimeMs(3)) + gameTimeMs(3 + preparationSeconds)
const transitionAllowanceMs = 12_000
const questionWaitMs = (seconds: number) =>
  transitionAllowanceMs + gameTimeMs(seconds)

const accountDb = await import("@razzia/socket/services/account-db")
const account = await import("@razzia/socket/services/account-auth")
const auth = await import("@razzia/socket/services/auth")
const { withAccount } = await import("@razzia/socket/services/account-scope")
const { initConfig } = await import("@razzia/socket/services/config")
const { createAdaptorServer } = await import("@hono/node-server")
const { app, createSocketServer } = await import("@razzia/socket/app")
const { default: Game } = await import("@razzia/socket/services/game")
const { default: Registry } = await import("@razzia/socket/services/registry")
const { sign } = await import("hono/jwt")

accountDb.checkAccountConfiguration()
initConfig()

const server = createAdaptorServer(app)
const io = createSocketServer(server)
await new Promise<void>((done) => {
  server.listen(0, "127.0.0.1", () => {
    done()
  })
})
const registry = Registry.getInstance()
const socketAddress = server.address()
assert.ok(socketAddress && typeof socketAddress !== "string")
const baseUrl = `http://127.0.0.1:${socketAddress.port}`

const factories: UnmountedPhoneAuthorityInstance[] = []
const sockets: Array<ReturnType<typeof connect>> = []
const observations: unknown[] = []
const ALL_ACTIONS: readonly Action[] = ["register", "poll", "answer", "hangup"]
const PROVIDER = "synthetic-provider"
const INSTALLATION_ID = "phase3-phone-gateway"
const KEY_ID = "phase3-phone-key-v1"

function privateDir(label: string, marker?: { name: string; content: string }) {
  const dir = realpathSync(mkdtempSync(join(scratchRoot, `${label}-`)))

  if (marker) {
    writeFileSync(join(dir, marker.name), marker.content, { mode: 0o600 })
  }

  return dir
}

async function createOwner(verified = true) {
  const password = remember(randomBytes(24).toString("hex"))
  const user = await account.registerAccount(
    `${randomUUID()}@example.invalid`,
    password,
  )

  if (verified) {
    assert.ok(
      account.consumeCode(
        user.email,
        "verify",
        account.issueCode(user.id, "verify"),
      )?.verified,
    )
    const session = await auth.mintToken(user.id, SESSION_ROLES.MANAGER)
    remember(session.token)

    return { user, token: session.token }
  }

  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 300
  const sid = account.createAccountSession(user.id, exp)
  const token = remember(
    await sign(
      { sub: user.id, role: SESSION_ROLES.MANAGER, sid, iat, exp },
      fixtureJwtSecret,
      "HS256",
    ),
  )

  return { user, token }
}

async function setupRoom(quizz: ReturnType<typeof createQuizz>) {
  const subject = await createOwner(true)
  const game = await withAccount(
    subject.user.id,
    () => new Game(io, subject.user.id, quizz),
  )
  const authorityRoot = privateDir("authority", {
    name: "PHONE_V2A_SYNTHETIC_ONLY",
    content: "synthetic-v2a-only\n",
  })
  const lifecycleRoot = privateDir("lifecycle", {
    name: "PHONE_V2A_SYNTHETIC_ONLY",
    content: "synthetic-v2a-only\n",
  })
  const factory = new UnmountedPhoneAuthority({
    authorityRoot,
    allowedProviders: [PROVIDER],
    nativeAdoption: true,
    gatewayDelivery: true,
    lifecycleRoot: () => lifecycleRoot,
  })
  factories.push(factory)
  factory.stageFreshGatewayGame(game)
  registry.addGame(game)

  await factory.initializeAuthority(subject.token, game.gameId)
  const attempt = await factory.issue(subject.token, {
    game: game.gameId,
    provider: PROVIDER,
    requestId: randomUUID(),
    expiresAt: Date.now() + 300_000,
    initialActions: ALL_ACTIONS,
  })
  assert.ok(attempt.receipt.ok && attempt.credential)
  remember(attempt.credential)

  const target: GatewayTarget = {
    owner: subject.user.id,
    game: game.gameId,
    provider: PROVIDER,
    service: attempt.receipt.service,
  }
  const authority = await factory.openGatewayAuthority(subject.token, target)

  const keyBytes = randomBytes(32)
  remember(keyBytes.toString("hex"))
  const keyPort: GatewayPrivateKeyPort = {
    open() {
      const bytes = Buffer.from(keyBytes)

      return {
        purpose: GATEWAY_KEY_PURPOSE,
        installationId: INSTALLATION_ID,
        keyId: KEY_ID,
        bytes,
        close() {
          bytes.fill(0)
        },
      }
    },
  }

  const adapterRoot = privateDir("adapter", {
    name: GATEWAY_ROOT_MARKER,
    content: GATEWAY_ROOT_CONTENT,
  })
  const adapter = new PrivateGatewayAdapter({
    enabled: true,
    root: adapterRoot,
    installationId: INSTALLATION_ID,
    keyId: KEY_ID,
    target,
    authority,
    key: keyPort,
  })
  adapter.initializeEmpty()
  await factory.deliverGatewayAttempt(subject.token, attempt, adapter, 0)
  assert.equal((await adapter.activate(randomUUID())).state, "ACTIVE")

  return { subject, game, factory, adapter, target, keyPort }
}

function makeCallPrecommit(
  room: Awaited<ReturnType<typeof setupRoom>>,
  attempt: GatewayCallAttempt,
) {
  const callRoot = privateDir("call", {
    name: CALL_PRECOMMIT_MARKER,
    content: CALL_PRECOMMIT_CONTENT,
  })
  const precommit = new PrivateCallPrecommit({
    enabled: true,
    root: callRoot,
    installationId: INSTALLATION_ID,
    keyId: KEY_ID,
    target: room.target,
    key: room.keyPort,
    dispatcher: room.adapter.registrationDispatcher(),
    attempt,
  })
  precommit.prepare(attempt)
  const host = new PrivateCallOperationHost({
    enabled: true,
    root: callRoot,
    installationId: INSTALLATION_ID,
    keyId: KEY_ID,
    target: room.target,
    key: room.keyPort,
    attempt,
    dispatcher: room.adapter.operationDispatcher(),
  })

  return { precommit, host }
}

function makeOperation(
  room: Awaited<ReturnType<typeof setupRoom>>,
  host: PrivateCallOperationHostInstance,
  intent: GatewayOperationIntent,
) {
  const opRoot = privateDir("op", {
    name: OPERATION_PRECOMMIT_MARKER,
    content: OPERATION_PRECOMMIT_CONTENT,
  })
  const op = host.operation({
    enabled: true,
    root: opRoot,
    installationId: INSTALLATION_ID,
    keyId: KEY_ID,
    key: room.keyPort,
    intent,
  })
  op.prepare()

  return op
}

async function waitFor(predicate: () => boolean, label: string, ms = 12_000) {
  const until = Date.now() + ms

  while (!predicate()) {
    if (Date.now() >= until) {
      throw new Error(`Timed out waiting for: ${label}`)
    }

    await new Promise<void>((done) => {
      setTimeout(done, 20)
    })
  }
}

function observeVoteTiming(
  room: Awaited<ReturnType<typeof setupRoom>>,
  seconds: number,
) {
  const startedAt = Date.now()
  const windowMs = gameTimeMs(seconds)
  const remainingBefore = room.game.roundManager.getPauseSnapshot().remainingMs

  return () => ({
    gameSpeed: envGameSpeed,
    windowMs,
    elapsedBeforePreparationMs:
      remainingBefore === null ? null : windowMs - remainingBefore,
    custodyOperationMs: Date.now() - startedAt,
    remainingAfterReceiptMs:
      room.game.roundManager.getPauseSnapshot().remainingMs,
  })
}

function scoreEvidence(
  room: Awaited<ReturnType<typeof setupRoom>>,
  expected: {
    rosterPlayerId: string
    epoch: number
    questionIndex: number
    answerIndex: number
  },
) {
  const round = room.game.roundManager
  const state = room.game.getQuestionStateForGateway(expected.rosterPlayerId)
  const ledger = round.getQuestionLedgerEntry(expected.questionIndex)
  const answer = ledger?.answers[0]
  const evidence = {
    questionIndex: state.questionIndex,
    engineEpoch: state.epoch,
    phase: round.currentStepName,
    paused: round.isPaused,
    acceptingAnswers: state.acceptingAnswers,
    ledgerAnswerCount: ledger?.answers.length ?? null,
    rawAnswerPoints: answer?.points ?? null,
    verdictEpoch: state.lastVerdict?.epoch ?? null,
    verdictCorrect: state.lastVerdict?.correct ?? null,
    verdictPoints: state.lastVerdict?.points ?? null,
    totalPoints: state.points,
  }
  const detail = JSON.stringify(evidence)
  assert.equal(round.isPaused, false, detail)
  assert.equal(round.currentStepName, "reveal", detail)
  assert.equal(state.acceptingAnswers, false, detail)
  assert.equal(state.questionIndex, expected.questionIndex, detail)
  assert.equal(state.epoch, expected.epoch, detail)
  assert.equal(ledger?.skipped, false, detail)
  assert.equal(ledger.answers.length, 1, detail)
  assert.deepEqual(answer?.answerIds, [expected.answerIndex], detail)

  return evidence
}

async function connectManager(room: Awaited<ReturnType<typeof setupRoom>>) {
  const socket = connect(baseUrl, {
    path: "/ws",
    auth: { token: room.subject.token },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    autoConnect: false,
  })
  sockets.push(socket)
  const waitEvent = (eventName: string) =>
    new Promise<void>((done, reject) => {
      const ok = () => {
        clearTimeout(timer)
        done()
      }
      const timer = setTimeout(() => {
        socket.off(eventName, ok)
        reject(new Error(`Manager socket event timeout: ${eventName}`))
      }, 6000)
      socket.once(eventName, ok)
    })

  let lastStatus = ""
  const statusPayloads: Array<{ name: string; data: Record<string, unknown> }> =
    []
  socket.on(
    EVENTS.GAME.STATUS,
    (status: { name: string; data: Record<string, unknown> }) => {
      lastStatus = status.name
      statusPayloads.push(status)
    },
  )

  const onConnect = waitEvent("connect")
  socket.connect()
  await onConnect
  const onReady = waitEvent(EVENTS.MANAGER.SUCCESS_RECONNECT)
  socket.emit(EVENTS.MANAGER.RECONNECT, { gameId: room.game.gameId })
  await onReady
  room.game.updateSettings({ endOnAllAnswered: false })

  return {
    socket,
    statusPayloads,
    async start() {
      socket.emit(EVENTS.MANAGER.START_GAME, { gameId: room.game.gameId })
      await waitFor(
        () => room.game.getQuestionStateForGateway().acceptingAnswers,
        "Q1 acceptingAnswers",
        transitionAllowanceMs + startupMs,
      )
    },
    async advanceTo(predicate: () => boolean, label: string) {
      for (let i = 0; i < 20; i += 1) {
        if (predicate()) {
          return
        }

        if (
          lastStatus !== STATUS.SHOW_PREPARED &&
          lastStatus !== STATUS.SHOW_QUESTION
        ) {
          socket.emit(EVENTS.MANAGER.ADVANCE, { gameId: room.game.gameId })
        }

        await waitFor(predicate, label, 3000).catch(() => undefined)
      }

      assert.ok(predicate(), `Failed to advance to: ${label}`)
    },
  }
}

function requireBound(receipt: Receipt): {
  registrationId: string
  generation: number
  rosterPlayerId: string
} {
  assert.equal(receipt.ok, true)
  assert.ok(receipt.registrationId)
  assert.ok(typeof receipt.generation === "number")
  assert.ok(receipt.rosterPlayerId)

  return {
    registrationId: receipt.registrationId,
    generation: receipt.generation,
    rosterPlayerId: receipt.rosterPlayerId,
  }
}

function requireEpoch(receipt: Receipt): number {
  assert.equal(receipt.ok, true)
  assert.ok(typeof receipt.epoch === "number")

  return receipt.epoch
}

after(async () => {
  for (const s of sockets) {
    s.disconnect()
  }

  for (const f of factories) {
    f.close()
  }

  for (const g of registry.getAllGames()) {
    g.dispose()
    registry.removeGame(g.gameId)
  }

  registry.cleanup()
  io.disconnectSockets(true)
  await new Promise<void>((done) => {
    void io.close(() => {
      done()
    })
  })

  if (server.listening) {
    await new Promise<void>((done) => {
      server.close(() => {
        done()
      })
    })
  }

  accountDb.closeAccountDb()

  // Verify no secret leaked onto scratch files before removal
  const scan = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) {
        return scan(join(dir, entry.name))
      }

      if (entry.isFile()) {
        return [join(dir, entry.name)]
      }

      return []
    })

  for (const file of scan(scratchRoot)) {
    if (file.endsWith(".enc")) {
      continue
    }

    const bytes = readFileSync(file)
    for (const secret of secrets) {
      assert.equal(
        bytes.includes(Buffer.from(secret)),
        false,
        `Secret leaked in ${file}`,
      )
    }
  }

  if (process.env.PHASE3_PHONE_KEEP_TMP !== "1") {
    rmSync(scratchRoot, { recursive: true, force: true, maxRetries: 3 })
  }

  if (observations.length > 0 && process.env.PHASE3_PHONE_LOG_JSON === "1") {
    console.log(JSON.stringify({ phase3PhoneLiveFixture: observations }))
  }
})

test(
  "FULL-CHAIN-INVITE-AND-DENIALS: negative auth/invite checks and pre-registered 35-char caller scores via gateway-v2 custody",
  { timeout: 45_000 + startupMs + gameTimeMs(20) },
  async () => {
    const q1 = createQuestion({
      answers: ["A", "B", "C", "D"],
      solutions: [1],
      time: 20,
      cooldown: 1,
    })
    const room = await setupRoom(createQuizz([q1], QUIZZ_MODES.QUIZ))
    room.game.upsertRosterParticipant({
      rosterPlayerId: "roster_invited_long",
      displayName: "Synthetic Invited Caller 1234567890",
      phone: "+15550100001",
    })
    room.game.setPhoneInviteOnly(true)

    // Unverified host claim cannot initialize another room's authority
    const unverifiedHost = await createOwner(false)
    await assert.rejects(
      room.factory.initializeAuthority(unverifiedHost.token, room.game.gameId),
    )

    // Uninvited caller fails closed
    const uninvitedAttempt: GatewayCallAttempt = {
      requestId: randomUUID(),
      providerReference: randomUUID(),
      phone: "+15550100002",
      expectedPredecessor: 0,
    }
    const uninvitedCall = makeCallPrecommit(room, uninvitedAttempt)
    const uninvitedReceipt: Receipt = await uninvitedCall.precommit.register()
    assert.equal(uninvitedReceipt.ok, false)
    assert.equal(uninvitedReceipt.status, "admission_outcome_unknown")
    assert.equal(room.game.players.length, 0)

    // Invited caller registers through full PrivateCallPrecommit + PrivateGatewayAdapter custody
    const invitedAttempt: GatewayCallAttempt = {
      requestId: randomUUID(),
      providerReference: randomUUID(),
      phone: "+15550100001",
      expectedPredecessor: 0,
    }
    const invited = makeCallPrecommit(room, invitedAttempt)
    const joined = await invited.precommit.register()
    const bound = requireBound(joined)
    assert.equal(bound.rosterPlayerId, "roster_invited_long")
    assert.equal(
      room.game.players[0]?.username,
      "Synthetic Invited Caller 1234567890",
    )

    // Lost-ACK register retry replays idempotently
    const joinedRetry = await invited.precommit.register()
    assert.deepEqual(joinedRetry, joined)

    const host = await connectManager(room)
    await host.start()

    const pollOp = makeOperation(room, invited.host, {
      operationId: randomUUID(),
      registrationId: bound.registrationId,
      generation: bound.generation,
      action: "poll",
    })
    const pollReceipt = await pollOp.execute()
    const pollEpoch = requireEpoch(pollReceipt)
    assert.ok(pollEpoch >= 1)

    const finishVoteTiming = observeVoteTiming(room, q1.time)
    const answerOp = makeOperation(room, invited.host, {
      operationId: randomUUID(),
      registrationId: bound.registrationId,
      generation: bound.generation,
      action: "answer",
      epoch: pollEpoch,
      answerIndex: 1,
    })
    const answerReceipt = await answerOp.execute()
    const voteTiming = finishVoteTiming()
    assert.equal(answerReceipt.ok, true)
    assert.equal(answerReceipt.status, "accepted")

    await waitFor(
      () =>
        !room.game.getQuestionStateForGateway(bound.rosterPlayerId)
          .acceptingAnswers,
      "Q1 voting window closed",
      questionWaitMs(q1.time),
    )
    const score = scoreEvidence(room, {
      rosterPlayerId: bound.rosterPlayerId,
      epoch: pollEpoch,
      questionIndex: 0,
      answerIndex: 1,
    })
    const afterPoll = await makeOperation(room, invited.host, {
      operationId: randomUUID(),
      registrationId: bound.registrationId,
      generation: bound.generation,
      action: "poll",
    }).execute()
    assert.ok(
      (afterPoll.points ?? 0) > 0,
      JSON.stringify({ voteTiming, score }),
    )
    observations.push({
      test: "FULL-CHAIN-INVITE-AND-DENIALS",
      points: afterPoll.points,
      voteTiming,
      score,
    })
  },
)

test(
  "FULL-CHAIN-20S-WINDOW-SKIP-AND-REPLACEMENT: full gateway-v2 custody enforces 20s window, unbricked rejections, manual skip, and A->B replacement",
  {
    timeout: 60_000 + startupMs + gameTimeMs(40 + 2 * preparationSeconds),
  },
  async () => {
    const q1 = createQuestion({
      answers: ["One", "Two", "Three", "Four"],
      solutions: [2],
      time: 20,
      cooldown: 1,
    })
    const q2 = createEstimationQuestion({ time: 20, cooldown: 1 })
    const q3 = createQuestion({
      answers: ["Alpha", "Beta", "Gamma", "Delta"],
      solutions: [0],
      time: 20,
      cooldown: 1,
    })
    const room = await setupRoom(createQuizz([q1, q2, q3], QUIZZ_MODES.QUIZ))

    const attemptA: GatewayCallAttempt = {
      requestId: randomUUID(),
      providerReference: randomUUID(),
      phone: "+15550100099",
      expectedPredecessor: 0,
    }
    const callA = makeCallPrecommit(room, attemptA)
    const joinedA = await callA.precommit.register()
    const boundA = requireBound(joinedA)

    // Pre-start answer returns deterministic no_active_question without leaving PENDING lockup
    const preAnswer = await makeOperation(room, callA.host, {
      operationId: randomUUID(),
      registrationId: boundA.registrationId,
      generation: boundA.generation,
      action: "answer",
      epoch: 0,
      answerIndex: 0,
    }).execute()
    assert.equal(preAnswer.ok, false)
    assert.equal(preAnswer.status, "no_active_question")

    const host = await connectManager(room)
    await host.start()
    await waitFor(
      () =>
        host.statusPayloads.some(
          (s) => s.name === STATUS.SELECT_ANSWER && s.data.time === 20,
        ),
      "Q1 SELECT_ANSWER time=20",
    )
    const questionStatus = host.statusPayloads
      .filter((s) => s.name === STATUS.SELECT_ANSWER)
      .at(-1)
    assert.equal(questionStatus?.data.time, 20)

    const pollQ1 = await makeOperation(room, callA.host, {
      operationId: randomUUID(),
      registrationId: boundA.registrationId,
      generation: boundA.generation,
      action: "poll",
    }).execute()
    const q1Epoch = requireEpoch(pollQ1)

    // Out-of-range digit + pause guard do not brick caller
    const invalidDigit = await makeOperation(room, callA.host, {
      operationId: randomUUID(),
      registrationId: boundA.registrationId,
      generation: boundA.generation,
      action: "answer",
      epoch: q1Epoch,
      answerIndex: 4,
    }).execute()
    assert.equal(invalidDigit.ok, false)
    assert.equal(invalidDigit.status, "invalid_answer_index")

    assert.equal(room.game.roundManager.pauseGame(), true)
    const whilePaused = await makeOperation(room, callA.host, {
      operationId: randomUUID(),
      registrationId: boundA.registrationId,
      generation: boundA.generation,
      action: "answer",
      epoch: q1Epoch,
      answerIndex: 2,
    }).execute()
    assert.equal(whilePaused.ok, false)
    assert.equal(whilePaused.status, "game_paused")
    assert.equal(room.game.roundManager.resumeGame(), true)

    // Caller votes correctly on Q1; duplicate press rejects cleanly
    const finishQ1VoteTiming = observeVoteTiming(room, q1.time)
    const voteQ1 = await makeOperation(room, callA.host, {
      operationId: randomUUID(),
      registrationId: boundA.registrationId,
      generation: boundA.generation,
      action: "answer",
      epoch: q1Epoch,
      answerIndex: 2,
    }).execute()
    const q1VoteTiming = finishQ1VoteTiming()
    assert.equal(voteQ1.ok, true)
    assert.equal(voteQ1.status, "accepted")

    const dupQ1 = await makeOperation(room, callA.host, {
      operationId: randomUUID(),
      registrationId: boundA.registrationId,
      generation: boundA.generation,
      action: "answer",
      epoch: q1Epoch,
      answerIndex: 1,
    }).execute()
    assert.equal(dupQ1.ok, false)
    assert.equal(dupQ1.status, "duplicate_answer")

    // Wait for 20s window to expire; late answer rejects deterministically and replays identically
    await waitFor(
      () =>
        !room.game.getQuestionStateForGateway(boundA.rosterPlayerId)
          .acceptingAnswers,
      "Q1 20s window close",
      questionWaitMs(q1.time),
    )
    const lateIntent: GatewayOperationIntent = {
      operationId: randomUUID(),
      registrationId: boundA.registrationId,
      generation: boundA.generation,
      action: "answer",
      epoch: q1Epoch,
      answerIndex: 0,
    }
    const lateOp = makeOperation(room, callA.host, lateIntent)
    const lateFirst = await lateOp.execute()
    assert.equal(lateFirst.ok, false)
    assert.equal(lateFirst.status, "not_accepting_answers")
    assert.deepEqual(await lateOp.execute(), lateFirst)

    const q1Score = scoreEvidence(room, {
      rosterPlayerId: boundA.rosterPlayerId,
      epoch: q1Epoch,
      questionIndex: 0,
      answerIndex: 2,
    })
    const pointsQ1 = room.game.getQuestionStateForGateway(
      boundA.rosterPlayerId,
    ).points
    assert.ok(pointsQ1 > 0, JSON.stringify({ q1VoteTiming, q1Score }))

    // Advance to Q2 (estimation) -> unsupported_question_type does not brick binding
    await host.advanceTo(
      () =>
        room.game.getQuestionStateForGateway(boundA.rosterPlayerId).epoch >
        q1Epoch,
      "Q2 started",
    )
    const pollQ2 = await makeOperation(room, callA.host, {
      operationId: randomUUID(),
      registrationId: boundA.registrationId,
      generation: boundA.generation,
      action: "poll",
    }).execute()
    const q2Epoch = requireEpoch(pollQ2)
    const unsupQ2 = await makeOperation(room, callA.host, {
      operationId: randomUUID(),
      registrationId: boundA.registrationId,
      generation: boundA.generation,
      action: "answer",
      epoch: q2Epoch,
      answerIndex: 0,
    }).execute()
    assert.equal(unsupQ2.ok, false)
    assert.equal(unsupQ2.status, "unsupported_question_type")

    // Manual skip advances to Q3 and increments epoch; stale Q2 epoch is rejected
    assert.equal(room.game.roundManager.skipQuestion("manual_skip"), true)
    const postSkip = room.game.getQuestionStateForGateway(boundA.rosterPlayerId)
    assert.ok(postSkip.epoch > q2Epoch)

    const staleQ2 = await makeOperation(room, callA.host, {
      operationId: randomUUID(),
      registrationId: boundA.registrationId,
      generation: boundA.generation,
      action: "answer",
      epoch: q2Epoch,
      answerIndex: 0,
    }).execute()
    assert.equal(staleQ2.ok, false)
    assert.equal(staleQ2.status, "stale_epoch")

    // Prepare delayed hangup on A BEFORE explicit replacement A -> B
    const delayedAHangup = makeOperation(room, callA.host, {
      operationId: randomUUID(),
      registrationId: boundA.registrationId,
      generation: boundA.generation,
      action: "hangup",
    })

    await waitFor(
      () =>
        room.game.getQuestionStateForGateway(boundA.rosterPlayerId)
          .acceptingAnswers,
      "Q3 acceptingAnswers",
      questionWaitMs(preparationSeconds),
    )

    const attemptB: GatewayCallAttempt = {
      requestId: randomUUID(),
      providerReference: randomUUID(),
      phone: "+15550100099",
      expectedPredecessor: boundA.generation,
    }
    const callB = makeCallPrecommit(room, attemptB)
    const joinedB = await callB.precommit.register()
    const boundB = requireBound(joinedB)
    assert.equal(boundB.generation, 2)
    assert.equal(boundB.rosterPlayerId, boundA.rosterPlayerId)

    // Delayed A hangup cannot disconnect B or retire B
    const delayedReceipt = await delayedAHangup.execute()
    assert.equal(delayedReceipt.ok, false)
    assert.equal(delayedReceipt.status, "registration_retired")
    assert.equal(room.game.players[0]?.connected, true)

    // B votes on Q3 and earns additional points
    const finishQ3VoteTiming = observeVoteTiming(room, q3.time)
    const voteQ3 = await makeOperation(room, callB.host, {
      operationId: randomUUID(),
      registrationId: boundB.registrationId,
      generation: boundB.generation,
      action: "answer",
      epoch: postSkip.epoch,
      answerIndex: 0,
    }).execute()
    const q3VoteTiming = finishQ3VoteTiming()
    assert.equal(voteQ3.ok, true)
    assert.equal(voteQ3.status, "accepted")

    await waitFor(
      () =>
        !room.game.getQuestionStateForGateway(boundB.rosterPlayerId)
          .acceptingAnswers,
      "Q3 window closed",
      questionWaitMs(q3.time),
    )
    const q3Score = scoreEvidence(room, {
      rosterPlayerId: boundB.rosterPlayerId,
      epoch: postSkip.epoch,
      questionIndex: 2,
      answerIndex: 0,
    })
    const finalPoints = room.game.getQuestionStateForGateway(
      boundB.rosterPlayerId,
    ).points
    assert.ok(
      finalPoints > pointsQ1,
      JSON.stringify({ pointsQ1, q3VoteTiming, q3Score }),
    )
    assert.equal(room.game.getHostPresenceSnapshot().connectedNow, 1)

    // B hangs up cleanly -> TERMINAL blocks subsequent redial C
    const hangupB = await makeOperation(room, callB.host, {
      operationId: randomUUID(),
      registrationId: boundB.registrationId,
      generation: boundB.generation,
      action: "hangup",
    }).execute()
    assert.equal(hangupB.ok, true)
    assert.equal(hangupB.status, "disconnected")

    const attemptC: GatewayCallAttempt = {
      requestId: randomUUID(),
      providerReference: randomUUID(),
      phone: "+15550100099",
      expectedPredecessor: 2,
    }
    const redialC = await makeCallPrecommit(room, attemptC).precommit.register()
    assert.equal(redialC.ok, false)
    assert.equal(redialC.status, "binding_pending_unknown")

    observations.push({
      test: "FULL-CHAIN-20S-WINDOW-SKIP-AND-REPLACEMENT",
      pointsQ1,
      finalPoints,
      q1VoteTiming,
      q1Score,
      q3VoteTiming,
      q3Score,
    })
  },
)
