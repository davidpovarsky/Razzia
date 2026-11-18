import assert from "node:assert/strict"
import { after, test } from "node:test"
import { fork, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync, lstatSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"
import { PrototypeStore } from "../../../../../extensions/src/server/phone-lifecycle-v2/store"
import { LifecyclePrototype } from "../../../../../extensions/src/server/phone-lifecycle-v2/prototype"
import {
  capabilityHash,
  digest,
  type OperationInput,
  type Receipt,
  type RegistrationInput,
  type VerifiedServiceContext,
} from "../../../../../extensions/src/server/phone-lifecycle-v2/contracts"
import { bootActualBackend, precommit } from "./actual-game"
import { reopenScopedPrecommit } from "./scoped-journal-fixture"

const backend = await bootActualBackend(),
  observations: unknown[] = []
const evidence = process.env.PHONE_V2A_EVIDENCE!,
  here = dirname(fileURLToPath(import.meta.url))
assert.ok(evidence.startsWith("/evidence/phone-v2a-"))
after(async () => {
  writeFileSync(
    join(evidence, "v2a-observations.json"),
    JSON.stringify(
      {
        tested_sha: process.env.PHONE_REVIEW_SHA,
        scope:
          "unmounted synthetic prototype; real Game and SQLite; injected authority is NOT actual authentication",
        observations,
      },
      null,
      2,
    ) + "\n",
  )
  await backend.close()
})
function op(
  request: RegistrationInput,
  receipt: Receipt,
  action: OperationInput["action"],
  id: string,
  extra: Partial<OperationInput> = {},
): OperationInput {
  return {
    requestId: request.requestId,
    registrationId: receipt.registrationId!,
    generation: receipt.generation!,
    capability: request.capability,
    operationId: id,
    action,
    ...extra,
  }
}
function inspect(root: string, context: VerifiedServiceContext) {
  const db = new DatabaseSync(join(root, "phone-lifecycle-v2a.sqlite"), {
    readOnly: true,
  })
  try {
    const scope = [context.owner, context.game, context.provider]
    return {
      registrations: db
        .prepare(
          "SELECT state,generation,receipt IS NOT NULL AS hasReceipt FROM registrations WHERE owner=? AND game=? AND provider=? ORDER BY generation",
        )
        .all(...scope),
      operations: db
        .prepare(
          "SELECT state,receipt IS NOT NULL AS hasReceipt FROM operations WHERE owner=? AND game=? AND provider=? ORDER BY operation_id",
        )
        .all(...scope),
      bindings: db
        .prepare(
          "SELECT state,generation FROM bindings WHERE owner=? AND game=? AND provider=?",
        )
        .all(...scope),
    }
  } finally {
    db.close()
  }
}
function fieldsAbsent(receipt: Receipt) {
  assert.equal("capability" in receipt, false)
  if (!receipt.ok)
    for (const key of [
      "rosterPlayerId",
      "clientId",
      "points",
      "answered",
      "registrationId",
    ])
      assert.equal(key in receipt, false, key)
}
const valid = () => true

test("V2A-12 issuer revoked after initial storage authorization cannot adopt Game authority", async () => {
  const r = await backend.room(),
    root = backend.privateRoot()
  let initial = true
  const revokedAfterInitial = () => {
    if (initial) {
      initial = false
      return true
    }
    return false
  }
  assert.throws(
    () => new PrototypeStore(root, r.context, revokedAfterInitial),
    /service_denied/,
  )
  let authorities = 0
  if (existsSync(join(root, "phone-lifecycle-v2a.sqlite"))) {
    const db = new DatabaseSync(join(root, "phone-lifecycle-v2a.sqlite"), {
      readOnly: true,
    })
    try {
      authorities = Number(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS n FROM game_authorities WHERE owner=? AND game=? AND provider=?",
            )
            .get(r.context.owner, r.context.game, r.context.provider) as {
            n: number
          }
        ).n,
      )
    } finally {
      db.close()
    }
  }
  assert.equal(authorities, 0)
  assert.equal(r.game.players.length, 0)
  observations.push({
    case: "V2A-12",
    adoptedAuthorities: authorities,
    players: 0,
    injectedRevocationOnly: true,
  })
})

test("V2A-10 accepted B at zero wins server precedence; late A conflicts without touching Game", async () => {
  const r = await backend.room(),
    root = backend.privateRoot(),
    store = new PrototypeStore(root, r.context, valid)
  try {
    const p = new LifecyclePrototype(store, r.facade, valid)
    const a = precommit(root, r.context, "delayed-A", "+447700900110"),
      b = precommit(root, r.context, "winner-B", "+447700900110")
    const B = p.register(r.context, b)
    assert.equal(B.ok, true)
    const before = r.snapshot(B.rosterPlayerId!)
    const first = p.register(r.context, a)
    assert.equal(first.status, "predecessor_conflict")
    assert.deepEqual(p.register(r.context, a), first)
    assert.equal(
      p.register(r.context, { ...a, phone: "+447700900111" }).status,
      "request_conflict",
    )
    assert.deepEqual(r.snapshot(B.rosterPlayerId!), before)
    observations.push({
      case: "V2A-10",
      before,
      after: r.snapshot(B.rosterPlayerId!),
      precedence: "accepted server registration; physical order unknown",
      state: inspect(root, r.context),
    })
  } finally {
    store.close()
  }
})

test("V2A-11 removed real roster denies cached registration and poll receipts", async () => {
  const r = await backend.room(),
    root = backend.privateRoot(),
    store = new PrototypeStore(root, r.context, valid)
  try {
    const p = new LifecyclePrototype(store, r.facade, valid),
      a = precommit(root, r.context, "removed-A", "+447700900112")
    const A = p.register(r.context, a)
    assert.equal(A.ok, true)
    const poll = op(a, A, "poll", "cached-poll")
    assert.equal(p.operate(r.context, poll).ok, true)
    assert.equal(r.game.removeRosterParticipant(A.rosterPlayerId!), true)
    const register = p.register(r.context, a),
      replay = p.operate(r.context, poll)
    assert.equal(register.status, "game_binding_changed")
    assert.equal(replay.status, "game_binding_changed")
    fieldsAbsent(register)
    fieldsAbsent(replay)
    observations.push({
      case: "V2A-11",
      cachedRegistrationDenied: true,
      cachedPollDenied: true,
    })
  } finally {
    store.close()
  }
})

test("V2A-01 mandatory authority denies before filesystem; live revocation/action/scope gates include cached receipts", async () => {
  const r = await backend.room(),
    root = backend.privateRoot()
  const absent = join(root, "must-not-exist")
  for (const key of [
    "owner",
    "issuerSid",
    "game",
    "provider",
    "service",
    "executorId",
  ]) {
    const broken = { ...r.context, [key]: "" }
    assert.throws(() => new PrototypeStore(absent, broken, valid))
    assert.equal(existsSync(absent), false)
  }
  assert.throws(
    () => new PrototypeStore(absent, { ...r.context, expiresAt: 0 }, valid),
    /service_denied/,
  )
  assert.throws(
    () => new PrototypeStore(absent, r.context, () => false),
    /service_denied/,
  )
  let live = true,
    checks = 0
  const verify = () => {
    checks++
    return live
  }
  const store = new PrototypeStore(root, r.context, verify)
  try {
    const p = new LifecyclePrototype(store, r.facade, verify),
      a = precommit(root, r.context, "authority-A", "+447700900101")
    const receipt = p.register(r.context, a)
    assert.equal(receipt.ok, true)
    const before = r.snapshot(receipt.rosterPlayerId!)
    for (const key of [
      "owner",
      "issuerSid",
      "game",
      "provider",
      "service",
      "executorId",
    ]) {
      const denied = p.register({ ...r.context, [key]: "wrong-scope" }, a)
      assert.equal(denied.ok, false)
      fieldsAbsent(denied)
    }
    const expired = p.register({ ...r.context, expiresAt: 0 }, a)
    assert.equal(expired.ok, false)
    const forbidden = p.operate(
      { ...r.context, actions: ["register"] },
      op(a, receipt, "poll", "forbidden"),
    )
    assert.equal(forbidden.ok, false)
    const missingProof = p.register(r.context, { ...a, capability: "" })
    assert.equal(missingProof.ok, false)
    live = false
    const replay = p.register(r.context, a)
    assert.equal(replay.status, "service_denied")
    const operation = p.operate(r.context, op(a, receipt, "poll", "revoked"))
    assert.equal(operation.status, "service_denied")
    assert.deepEqual(r.snapshot(receipt.rosterPlayerId!), before)
    observations.push({
      case: "V2A-01",
      checks,
      deniedScopes: 6,
      revokedReplayDenied: true,
      state: inspect(root, r.context),
    })
  } finally {
    store.close()
  }
})

test(
  "V2A-02 actual score and roster survive explicit B CAS; late A never invokes disconnect or changes billing",
  { timeout: 35000 },
  async () => {
    const r = await backend.room(),
      root = backend.privateRoot(),
      store = new PrototypeStore(root, r.context, valid)
    let disconnectCalls = 0,
      answerCalls = 0
    const disconnect = r.game.disconnectPhoneCallerByRosterId.bind(r.game),
      answer = r.game.submitPhoneAnswerByRosterId.bind(r.game)
    r.game.disconnectPhoneCallerByRosterId = (...args) => {
      disconnectCalls++
      return disconnect(...args)
    }
    r.game.submitPhoneAnswerByRosterId = (...args) => {
      answerCalls++
      return answer(...args)
    }
    try {
      const p = new LifecyclePrototype(store, r.facade, valid),
        a = precommit(root, r.context, "score-A", "+447700900102")
      const A = p.register(r.context, a)
      assert.equal(A.ok, true)
      assert.deepEqual(p.register(r.context, a), A)
      assert.equal(
        p.register(r.context, {
          ...a,
          capability: randomBytes(32).toString("hex"),
        }).status,
        "request_conflict",
      )
      assert.equal(
        p.register(r.context, { ...a, requestId: "ambiguous-new-request" })
          .status,
        "reference_reuse_ambiguous",
      )
      await r.start()
      const epoch = r.game.getQuestionStateForGateway().epoch
      const answerInput = op(a, A, "answer", "scored-answer", {
        epoch,
        answerIndex: 4,
      })
      const first = p.operate(r.context, answerInput)
      assert.equal(first.accepted, true)
      assert.deepEqual(p.operate(r.context, answerInput), first)
      assert.equal(answerCalls, 1)
      assert.equal(
        p.operate(r.context, { ...answerInput, answerIndex: 0 }).status,
        "operation_conflict",
      )
      await r.advanceUntil(() => r.snapshot(A.rosterPlayerId!).points > 0)
      await r.advanceUntil(
        () =>
          r.game.getQuestionStateForGateway().epoch > epoch &&
          r.game.getQuestionStateForGateway().acceptingAnswers,
      )
      const before = r.snapshot(A.rosterPlayerId!)
      assert.equal(before.points, 1000)
      const b = precommit(root, r.context, "score-B", "+447700900102", 1)
      const B = p.register(r.context, b)
      assert.equal(B.ok, true)
      assert.equal(B.generation, 2)
      assert.equal(B.rosterPlayerId, A.rosterPlayerId)
      assert.equal(B.clientId, A.clientId)
      const current = r.snapshot(B.rosterPlayerId!)
      assert.equal(current.points, 1000)
      assert.equal(current.rosterCount, 1)
      const billingModule = await import("@razzia/socket/services/billing")
      process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
      process.env.TADAZZ_BILLING_ENABLED = "true"
      try {
        const billing = billingModule.requireBilling()
        const billingSnapshot = () => ({
          calls: billing.database.sql
            .prepare(
              "SELECT COUNT(*) AS n FROM billing_phone_calls WHERE game_id=?",
            )
            .get(r.game.gameId),
          usage: billing.database.sql
            .prepare(
              "SELECT COUNT(*) AS n FROM billing_phone_usage WHERE game_id=?",
            )
            .get(r.game.gameId),
        })
        const beforeBilling = billingSnapshot()
        for (const action of ["poll", "answer", "hangup"] as const) {
          const late = p.operate(
            r.context,
            op(a, A, action, "late-A-" + action, {
              epoch: current.epoch,
              answerIndex: 4,
            }),
          )
          assert.equal(late.status, "registration_retired")
          fieldsAbsent(late)
          assert.deepEqual(r.snapshot(B.rosterPlayerId!), current)
        }
        assert.deepEqual(billingSnapshot(), beforeBilling)
        assert.equal(disconnectCalls, 0)
        assert.equal(answerCalls, 1)
        const retiredReplay = p.register(r.context, a)
        assert.equal(retiredReplay.status, "registration_retired")
        fieldsAbsent(retiredReplay)
        const poll = p.operate(r.context, op(b, B, "poll", "current-B"))
        assert.equal(poll.points, 1000)
        const staleEpoch = p.operate(
          r.context,
          op(b, B, "answer", "stale-epoch", { epoch, answerIndex: 4 }),
        )
        assert.equal(staleEpoch.status, "stale_epoch")
        assert.equal(answerCalls, 1)
        observations.push({
          case: "V2A-02",
          before,
          after: current,
          disconnectCalls,
          answerCalls,
          billingBefore: beforeBilling,
          billingAfter: billingSnapshot(),
          state: inspect(root, r.context),
        })
      } finally {
        billingModule.closeBilling()
        process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
        process.env.TADAZZ_BILLING_ENABLED = "false"
      }
    } finally {
      store.close()
    }
  },
)

test("V2A-03 one adopted provider/service/issuer/executor per actual Game; legacy active binding denied at zero", async () => {
  const r = await backend.room(),
    root = backend.privateRoot(),
    store = new PrototypeStore(root, r.context, valid)
  try {
    for (const key of ["provider", "service", "issuerSid", "executorId"]) {
      assert.throws(
        () =>
          new PrototypeStore(
            root,
            { ...r.context, [key]: "foreign-authority" },
            valid,
          ),
        /game_authority_conflict/,
      )
    }
    const legacy = r.game.joinOrRebindPhoneCaller({
      phoneRaw: "+447700900103",
      callId: "legacy-foreign-call",
    })
    assert.equal(legacy.ok, true)
    const before = r.snapshot(legacy.rosterPlayerId!)
    const p = new LifecyclePrototype(store, r.facade, valid),
      a = precommit(root, r.context, "foreign-blocked", "+447700900103")
    const result = p.register(r.context, a)
    assert.equal(result.status, "untracked_existing_binding")
    fieldsAbsent(result)
    assert.deepEqual(r.snapshot(legacy.rosterPlayerId!), before)
    observations.push({
      case: "V2A-03",
      foreignAuthoritiesDenied: 4,
      legacyBefore: before,
      legacyAfter: r.snapshot(legacy.rosterPlayerId!),
      state: inspect(root, r.context),
    })
  } finally {
    store.close()
  }
})

test("V2A-04 revocation after durable reservation denies projection and leaves barrier", async () => {
  const r = await backend.room(),
    root = backend.privateRoot()
  let live = true
  class RevokeAfterReservation extends PrototypeStore {
    override reserveRegistration(
      ...args: Parameters<PrototypeStore["reserveRegistration"]>
    ) {
      const result = super.reserveRegistration(...args)
      if (result.kind === "reserved") live = false
      return result
    }
  }
  const verify = () => live,
    store = new RevokeAfterReservation(root, r.context, verify)
  try {
    const p = new LifecyclePrototype(store, r.facade, verify),
      a = precommit(root, r.context, "revoke-in-wait", "+447700900104")
    const result = p.register(r.context, a)
    assert.equal(result.status, "service_denied")
    assert.equal(r.game.players.length, 0)
    live = true
    assert.equal(
      p.register(r.context, a).status,
      "registration_pending_unknown",
    )
    assert.equal(r.game.players.length, 0)
    observations.push({
      case: "V2A-04",
      players: 0,
      state: inspect(root, r.context),
    })
  } finally {
    store.close()
  }
})

test("V2A-05 actual admission refusal publishes no ACTIVE credential; generic error remains unknown", async () => {
  const r = await backend.room(),
    root = backend.privateRoot(),
    store = new PrototypeStore(root, r.context, valid)
  const billingModule = await import("@razzia/socket/services/billing")
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  process.env.TADAZZ_BILLING_ENABLED = "true"
  const previousFetch = globalThis.fetch
  let externalAttempts = 0
  globalThis.fetch = (...args) => {
    externalAttempts++
    return Promise.reject(
      new Error("No network permitted by synthetic admission fixture"),
    )
  }
  try {
    const billing = billingModule.requireBilling(),
      p = new LifecyclePrototype(store, r.facade, valid)
    const a = precommit(
      root,
      r.context,
      "real-admission-denied",
      "+447700900105",
    )
    const result = p.register(r.context, a)
    assert.equal(result.status, "admission_outcome_unknown")
    fieldsAbsent(result)
    assert.equal(r.game.players.length, 0)
    assert.equal(r.game.getHostPresenceSnapshot().registeredTotal, 0)
    const calls = billing.database.sql
      .prepare("SELECT COUNT(*) AS n FROM billing_phone_calls WHERE game_id=?")
      .get(r.game.gameId) as { n: number }
    assert.equal(calls.n, 0)
    assert.equal(externalAttempts, 0)
    assert.equal(
      p.register(r.context, a).status,
      "registration_pending_unknown",
    )
    assert.equal(
      (inspect(root, r.context).registrations[0] as any).state,
      "RESERVED",
    )
    observations.push({
      case: "V2A-05",
      actualBillingReservationAbsent: true,
      players: 0,
      roster: 0,
      phoneCallRows: calls.n,
      externalAttempts,
      result,
      state: inspect(root, r.context),
    })
  } finally {
    globalThis.fetch = previousFetch
    billingModule.closeBilling()
    process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
    process.env.TADAZZ_BILLING_ENABLED = "false"
    store.close()
  }
})

test(
  "V2A-06 actual SQLite receipt-finalization failure preserves UNKNOWN answer and blocks replacement/replay",
  { timeout: 25000 },
  async () => {
    const r = await backend.room(),
      root = backend.privateRoot()
    let store = new PrototypeStore(root, r.context, valid)
    let answerCalls = 0
    const answer = r.game.submitPhoneAnswerByRosterId.bind(r.game)
    r.game.submitPhoneAnswerByRosterId = (...args) => {
      answerCalls++
      return answer(...args)
    }
    try {
      let p = new LifecyclePrototype(store, r.facade, valid),
        a = precommit(root, r.context, "unknown-answer-A", "+447700900106")
      const A = p.register(r.context, a)
      assert.equal(A.ok, true)
      await r.start()
      const db = new DatabaseSync(join(root, "phone-lifecycle-v2a.sqlite"))
      db.exec(
        "CREATE TRIGGER qa_fail_receipt BEFORE UPDATE OF receipt ON operations WHEN NEW.receipt IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic finalization failure'); END;",
      )
      const input = op(a, A, "answer", "unknown-answer", {
        epoch: r.game.getQuestionStateForGateway().epoch,
        answerIndex: 4,
      })
      const before = r.snapshot(A.rosterPlayerId!),
        result = p.operate(r.context, input)
      assert.equal(result.status, "outcome_unknown")
      assert.equal(r.snapshot(A.rosterPlayerId!).answered, true)
      assert.equal(answerCalls, 1)
      db.exec("DROP TRIGGER qa_fail_receipt")
      db.close()
      store.close()
      store = new PrototypeStore(root, r.context, valid)
      p = new LifecyclePrototype(store, r.facade, valid)
      for (let i = 0; i < 2; i++)
        assert.equal(
          p.operate(r.context, input).status,
          "operation_pending_unknown",
        )
      const replacement = precommit(
        root,
        r.context,
        "unknown-answer-B",
        "+447700900106",
        1,
      )
      assert.equal(
        p.register(r.context, replacement).status,
        "binding_pending_unknown",
      )
      assert.equal(
        p.operate(r.context, op(a, A, "hangup", "while-unknown")).status,
        "binding_pending_unknown",
      )
      assert.equal(answerCalls, 1)
      observations.push({
        case: "V2A-06",
        before,
        after: r.snapshot(A.rosterPlayerId!),
        answerCalls,
        sqliteFinalizationAborted: true,
        state: inspect(root, r.context),
      })
    } finally {
      store.close()
    }
  },
)

function message(
  child: ChildProcess,
  predicate: (data: any) => boolean,
  ms = 30000,
): Promise<any> {
  return new Promise((done, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      child.kill("SIGKILL")
      reject(new Error("Child boundary deadline"))
    }, ms)
    const receive = (data: any) => {
      if (predicate(data)) {
        cleanup()
        done(data)
      }
    }
    const fail = (error: Error) => {
      cleanup()
      reject(error)
    }
    const exited = (code: number | null, signal: string | null) => {
      cleanup()
      reject(new Error("Early child exit " + code + "/" + signal))
    }
    const cleanup = () => {
      clearTimeout(timer)
      child.off("message", receive)
      child.off("error", fail)
      child.off("exit", exited)
    }
    child.on("message", receive)
    child.on("error", fail)
    child.on("exit", exited)
  })
}
function spawnChild(file: string, env: Record<string, string>) {
  return fork(join(here, file), [], {
    cwd: "/work",
    env: { ...process.env, ...env },
    execArgv: process.execArgv,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  })
}

test(
  "V2A-07 independent SQLite contenders select exactly one expected-zero reservation",
  { timeout: 30000 },
  async () => {
    const r = await backend.room(),
      root = backend.privateRoot(),
      seed = new PrototypeStore(root, r.context, valid)
    seed.close()
    const children: ChildProcess[] = [],
      ready: Promise<any>[] = []
    for (const id of ["CAS-A", "CAS-B"]) {
      const input = precommit(root, r.context, id, "+447700900107"),
        file = join(root, id + ".json")
      writeFileSync(file, JSON.stringify({ root, context: r.context, input }), {
        flag: "wx",
        mode: 0o600,
      })
      const child = spawnChild("sqlite-cas-child.ts", {
        PHONE_V2A_CAS_INPUT: file,
      })
      children.push(child)
      ready.push(message(child, (d) => d.ready))
    }
    try {
      await Promise.all(ready)
      const results = children.map((child) => message(child, (d) => !!d.kind))
      const exits = children.map((child) => once(child, "exit"))
      for (const child of children) child.send({ go: true })
      const decisions = await Promise.all(results)
      await Promise.all(exits)
      assert.equal(decisions.filter((d) => d.kind === "reserved").length, 1)
      assert.equal(
        decisions.filter((d) => d.status === "binding_pending_unknown").length,
        1,
      )
      assert.equal(r.game.players.length, 0)
      observations.push({
        case: "V2A-07",
        decisions,
        actualGamePlayers: 0,
        state: inspect(root, r.context),
      })
    } finally {
      for (const child of children)
        if (child.exitCode === null) child.kill("SIGKILL")
    }
  },
)

for (const window of [
  "register-reserved",
  "register-projected",
  "register-committed",
  "answer-reserved",
  "answer-projected",
  "answer-committed",
  "hangup-reserved",
  "hangup-projected",
  "hangup-committed",
]) {
  test(
    "V2A-08 actual SIGKILL/reopen at " + window,
    { timeout: 45000 },
    async () => {
      const root = backend.privateRoot(),
        child = spawnChild("phone-v2a-crash-child.ts", {
          PHONE_V2A_CASE_ROOT: root,
          PHONE_V2A_KILL_WINDOW: window,
        })
      try {
        const boundary = await message(child, (d) => d.stage === window)
        const exited = once(child, "exit")
        assert.equal(child.kill("SIGKILL"), true)
        const [code, signal] = await exited
        assert.equal(code, null)
        assert.equal(signal, "SIGKILL")
        // Independent expected scope came from the actual child fixture over
        // IPC, not an omitted journal field or a secondary case JSON fallback.
        const context = boundary.context as VerifiedServiceContext
        const { request } = reopenScopedPrecommit(
          root,
          context,
          {
            requestId: "kill-registration",
            providerReference: "kill-registration",
            phone: "+447700900901",
            expectedPredecessor: 0,
          },
          (candidate) => candidate === context,
        )
        const reopened = new PrototypeStore(root, context, valid)
        try {
          const snapshot = inspect(root, context)
          if (window.startsWith("register-")) {
            const fingerprint = digest(
              JSON.stringify([
                2,
                "register",
                context.owner,
                context.game,
                context.provider,
                context.issuerSid,
                context.service,
                context.executorId,
                request.requestId,
                digest(request.phone),
                digest(request.providerReference),
                capabilityHash(request.capability),
                request.expectedPredecessor,
              ]),
            )
            const input = {
              requestId: request.requestId,
              callerHash: digest(request.phone),
              referenceHash: digest(request.providerReference),
              capabilityHash: capabilityHash(request.capability),
              expectedPredecessor: 0,
              fingerprint,
            }
            const first = reopened.reserveRegistration(context, input),
              second = reopened.reserveRegistration(context, input)
            assert.deepEqual(first, second)
            assert.equal(first.kind, "receipt")
            if (first.kind === "receipt")
              assert.equal(
                first.receipt.status,
                window === "register-committed"
                  ? "active"
                  : "registration_pending_unknown",
              )
            if (window !== "register-reserved")
              assert.equal(boundary.snapshot.status, "connected")
          } else {
            const input = JSON.parse(
              readFileSync(join(root, "synthetic-operation.json"), "utf8"),
            ) as OperationInput
            const first = reopened.reserveOperation(context, input),
              second = reopened.reserveOperation(context, input)
            assert.deepEqual(first, second)
            assert.equal(first.kind, "receipt")
            if (first.kind === "receipt")
              assert.equal(
                first.receipt.status,
                window === "answer-committed"
                  ? "accepted"
                  : window === "hangup-committed"
                    ? "registration_retired"
                    : "operation_pending_unknown",
              )
            if (window.startsWith("answer-"))
              assert.equal(
                boundary.snapshot.answered,
                window !== "answer-reserved",
              )
            else
              assert.equal(
                boundary.snapshot.status,
                window === "hangup-reserved" ? "connected" : "disconnected",
              )
          }
          const unrelated = await backend.room(),
            p = new LifecyclePrototype(reopened, unrelated.facade, valid)
          assert.equal(p.register(context, request).status, "game_unavailable")
          assert.equal(unrelated.game.players.length, 0)
          observations.push({
            case: "V2A-08",
            window,
            signal,
            observedActualGame: boundary.snapshot ?? null,
            actualResult: boundary.result ?? null,
            reopened: snapshot,
            missingGameDenied: true,
            unrelatedPlayers: 0,
          })
        } finally {
          reopened.close()
        }
      } finally {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL")
      }
    },
  )
}

test("V2A-09 terminal generation survives reopen; hash-only DB and private fixture proof", async () => {
  const r = await backend.room(),
    root = backend.privateRoot()
  let store = new PrototypeStore(root, r.context, valid)
  const a = precommit(root, r.context, "terminal-A", "+447700900109")
  try {
    let p = new LifecyclePrototype(store, r.facade, valid)
    const A = p.register(r.context, a)
    assert.equal(A.ok, true)
    const result = p.operate(r.context, op(a, A, "hangup", "terminal-hangup"))
    assert.equal(result.ok, true)
    store.close()
    store = new PrototypeStore(root, r.context, valid)
    p = new LifecyclePrototype(store, r.facade, valid)
    assert.equal(p.register(r.context, a).status, "registration_retired")
    const b = precommit(root, r.context, "terminal-B", "+447700900109", 1)
    assert.equal(p.register(r.context, b).status, "binding_pending_unknown")
    const noSecret = p.register(r.context, { ...a, capability: "" })
    assert.equal(noSecret.status, "invalid_capability")
    const corrupt = p.register(r.context, { ...a, capability: "0".repeat(64) })
    assert.equal(corrupt.status, "request_conflict")
    assert.equal(r.snapshot(A.rosterPlayerId!).status, "disconnected")
    observations.push({
      case: "V2A-09",
      state: inspect(root, r.context),
      terminalAfterReopen: true,
    })
  } finally {
    store.close()
  }
  const database = readFileSync(join(root, "phone-lifecycle-v2a.sqlite"))
  assert.equal(database.includes(Buffer.from(a.capability)), false)
  assert.equal(
    lstatSync(join(root, "phone-lifecycle-v2a.sqlite")).mode & 0o077,
    0,
  )
  assert.equal(
    lstatSync(join(root, a.requestId + ".synthetic-journal")).mode & 0o077,
    0,
  )
})
