import assert from "node:assert/strict"
import { after, test } from "node:test"
import { fork } from "node:child_process"
import { once } from "node:events"
import { createHash } from "node:crypto"
import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
  writeSync,
  existsSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"
import { PrototypeStore } from "../../../../../extensions/src/server/phone-lifecycle-v2/store"
import { LifecyclePrototype } from "../../../../../extensions/src/server/phone-lifecycle-v2/prototype"
import {
  validateContext,
  type VerifiedServiceContext,
  type RegistrationInput,
} from "../../../../../extensions/src/server/phone-lifecycle-v2/contracts"
import { bootActualBackend } from "./actual-game"
import {
  dispatchScopedRegistration,
  reopenScopedPrecommit,
  writeScopedPrecommit,
  ScopedFixtureError,
  type ExpectedAttempt,
  type ScopedFixtureRecord,
} from "./scoped-journal-fixture"

assert.equal(process.env.PHONE_V2A_SCOPED_GRANTED, "fixture-only")
const backend = await bootActualBackend(),
  here = dirname(fileURLToPath(import.meta.url)),
  evidence = process.env.PHONE_V2A_EVIDENCE!
const observations: unknown[] = [],
  privateTokens: string[] = []
function record(row: unknown) {
  observations.push(row)
}
after(async () => {
  const report =
    JSON.stringify(
      {
        tested_sha: process.env.PHONE_REVIEW_SHA,
        scope:
          "targeted fixture correction only; trusted synthetic context is NOT real auth",
        observations,
      },
      null,
      2,
    ) + "\n"
  assert.equal(
    privateTokens.some((token) => report.includes(token)),
    false,
  )
  writeFileSync(join(evidence, "scoped-journal-observations.json"), report)
  await backend.close()
})
function trustedVerifier(r: Awaited<ReturnType<typeof backend.room>>) {
  const known = structuredClone(r.context)
  return (candidate: VerifiedServiceContext) => {
    validateContext(candidate, "register")
    return (
      r.facade.exists(candidate) &&
      [
        "owner",
        "game",
        "provider",
        "issuerSid",
        "service",
        "executorId",
        "expiresAt",
      ].every(
        (key) =>
          candidate[key as keyof VerifiedServiceContext] ===
          known[key as keyof VerifiedServiceContext],
      ) &&
      JSON.stringify([...candidate.actions].sort()) ===
        JSON.stringify([...known.actions].sort())
    )
  }
}
function attempt(id: string): ExpectedAttempt {
  return {
    requestId: id,
    providerReference: id,
    phone: "+447700900801",
    expectedPredecessor: 0,
  }
}
function observeNative(r: Awaited<ReturnType<typeof backend.room>>) {
  const counts = { coordinator: 0, join: 0, answer: 0, hangup: 0 }
  const joinPhone = r.game.joinOrRebindPhoneCaller.bind(r.game),
    answer = r.game.submitPhoneAnswerByRosterId.bind(r.game),
    hangup = r.game.disconnectPhoneCallerByRosterId.bind(r.game)
  r.game.joinOrRebindPhoneCaller = (...args) => {
    counts.join++
    return joinPhone(...args)
  }
  r.game.submitPhoneAnswerByRosterId = (...args) => {
    counts.answer++
    return answer(...args)
  }
  r.game.disconnectPhoneCallerByRosterId = (...args) => {
    counts.hangup++
    return hangup(...args)
  }
  return counts
}
function snapshotDb(root: string, context: VerifiedServiceContext) {
  const path = join(root, "phone-lifecycle-v2a.sqlite"),
    db = new DatabaseSync(path, { readOnly: true })
  const scope = [context.owner, context.game, context.provider]
  try {
    const records = {
      authority: db
        .prepare(
          "SELECT service,issuer_sid,executor_id FROM game_authorities WHERE owner=? AND game=? AND provider=?",
        )
        .all(...scope),
      registrations: db
        .prepare(
          "SELECT request_id,registration_id,generation,state,roster_id,client_id,receipt FROM registrations WHERE owner=? AND game=? AND provider=? ORDER BY request_id",
        )
        .all(...scope),
      bindings: db
        .prepare(
          "SELECT caller_hash,generation,request_id,state FROM bindings WHERE owner=? AND game=? AND provider=?",
        )
        .all(...scope),
      operations: db
        .prepare(
          "SELECT operation_id,state,receipt FROM operations WHERE owner=? AND game=? AND provider=? ORDER BY operation_id",
        )
        .all(...scope),
      denials: db
        .prepare(
          "SELECT request_id,receipt FROM registration_denials WHERE owner=? AND game=? AND provider=? ORDER BY request_id",
        )
        .all(...scope),
    }
    return {
      records,
      files: [path, path + "-wal"]
        .filter(existsSync)
        .map((file) => ({
          name: file.endsWith("-wal") ? "wal" : "db",
          sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
        })),
    }
  } finally {
    db.close()
  }
}
function durableReplace(root: string, path: string, bytes: Buffer) {
  const fd = openSync(path, "w", 0o600)
  try {
    let offset = 0
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  const directory = openSync(root, "r")
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
}
function renameAndSync(root: string, from: string, to: string) {
  renameSync(from, to)
  const directory = openSync(root, "r")
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
}

test(
  "SCOPED-01 exited writer's complete durable tuple reopens before actual coordinator registration",
  { timeout: 20000 },
  async () => {
    const r = await backend.room(),
      root = backend.privateRoot(),
      verify = trustedVerifier(r),
      expected = attempt("scoped-valid")
    assert.equal(verify(r.context), true)
    const file = join(root, "trusted-writer-input.json")
    writeFileSync(
      file,
      JSON.stringify({ root, context: r.context, attempt: expected }),
      { flag: "wx", mode: 0o600 },
    )
    const child = fork(join(here, "scoped-journal-writer-child.ts"), [], {
      cwd: "/work",
      env: { ...process.env, PHONE_SCOPED_WRITER_INPUT: file },
      execArgv: process.execArgv,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    })
    const messages: unknown[] = []
    child.on("message", (message) => messages.push(message))
    const [exit, signal] = await once(child, "exit")
    assert.equal(exit, 0)
    assert.equal(signal, null)
    assert.deepEqual(messages, [
      { committed: true, fileAndDirectoryFsynced: true },
    ])
    const reopened = reopenScopedPrecommit(root, r.context, expected, verify)
    privateTokens.push(reopened.request.capability)
    assert.equal(
      lstatSync(join(root, expected.requestId + ".synthetic-journal")).mode &
        0o077,
      0,
    )
    const store = new PrototypeStore(root, r.context, verify),
      p = new LifecyclePrototype(store, r.facade, verify),
      counts = observeNative(r)
    try {
      const result = dispatchScopedRegistration(
        root,
        r.context,
        expected,
        verify,
        (scope, request) => {
          counts.coordinator++
          return p.register(scope, request)
        },
      )
      assert.equal(result.ok, true)
      assert.deepEqual(counts, {
        coordinator: 1,
        join: 1,
        answer: 0,
        hangup: 0,
      })
      const db = snapshotDb(root, r.context)
      assert.equal(db.records.registrations.length, 1)
      assert.equal(db.records.registrations[0].state, "ACTIVE")
      record({
        case: "SCOPED-01",
        writerExitedBeforeReopen: true,
        scopeKeys: Object.keys(reopened.scope),
        requestKeys: Object.keys(reopened.request),
        allScopeMatchedTrustedFixture: true,
        counters: counts,
        actualGame: r.snapshot(result.rosterPlayerId!),
        registrationCount: 1,
        rawCapabilityDisclosed: false,
        secondaryCaseFile: false,
      })
    } finally {
      store.close()
    }
  },
)

test("SCOPED-02 missing/mismatched durable records cause zero dispatch and unchanged real Game/SQLite", async () => {
  const r = await backend.room(),
    root = backend.privateRoot(),
    verify = trustedVerifier(r),
    expected = attempt("scoped-negative")
  const request = writeScopedPrecommit(root, r.context, expected, verify)
  privateTokens.push(request.capability)
  const path = join(root, expected.requestId + ".synthetic-journal"),
    validBytes = readFileSync(path)
  const validRecord = JSON.parse(validBytes.toString()) as ScopedFixtureRecord
  // A plausible secondary file is deliberately present. Nothing may recover
  // omitted journal fields or a missing journal from this private decoy.
  writeFileSync(
    join(root, "synthetic-case.json"),
    JSON.stringify({ context: r.context, request }),
    { flag: "wx", mode: 0o600 },
  )
  const store = new PrototypeStore(root, r.context, verify),
    p = new LifecyclePrototype(store, r.facade, verify),
    counts = observeNative(r)
  try {
    const active = dispatchScopedRegistration(
      root,
      r.context,
      expected,
      verify,
      (ctx, input) => {
        counts.coordinator++
        return p.register(ctx, input)
      },
    )
    assert.equal(active.ok, true)
    Object.assign(counts, { coordinator: 0, join: 0, answer: 0, hangup: 0 })
    const beforeGame = r.snapshot(active.rosterPlayerId!),
      beforeDb = snapshotDb(root, r.context),
      denied: string[] = []
    const dispatch = (
      ctx: VerifiedServiceContext,
      input: RegistrationInput,
    ) => {
      counts.coordinator++
      return p.register(ctx, input)
    }
    const rejected = (name: string) => {
      assert.throws(
        () =>
          dispatchScopedRegistration(
            root,
            r.context,
            expected,
            verify,
            dispatch,
          ),
        (error) => error instanceof ScopedFixtureError,
      )
      assert.deepEqual(counts, {
        coordinator: 0,
        join: 0,
        answer: 0,
        hangup: 0,
      })
      assert.deepEqual(r.snapshot(active.rosterPlayerId!), beforeGame)
      assert.deepEqual(snapshotDb(root, r.context), beforeDb)
      denied.push(name)
    }
    const backup = path + ".private-backup"
    renameAndSync(root, path, backup)
    try {
      rejected("missing-record-despite-case-json")
    } finally {
      renameAndSync(root, backup, path)
    }
    for (const key of Object.keys(validRecord.scope)) {
      for (const kind of ["missing", "mismatched"]) {
        const bad = structuredClone(validRecord) as unknown as {
          scope: Record<string, unknown>
        }
        if (kind === "missing") delete bad.scope[key]
        else
          bad.scope[key] =
            key === "actions"
              ? ["register"]
              : key === "expiresAt"
                ? r.context.expiresAt + 1
                : "wrong-scope"
        durableReplace(root, path, Buffer.from(JSON.stringify(bad) + "\n"))
        rejected(kind + "-scope-" + key)
      }
    }
    for (const key of [
      "requestId",
      "providerReference",
      "phone",
      "expectedPredecessor",
    ]) {
      for (const kind of ["missing", "mismatched"]) {
        const bad = structuredClone(validRecord) as unknown as {
          request: Record<string, unknown>
        }
        if (kind === "missing") delete bad.request[key]
        else
          bad.request[key] =
            key === "expectedPredecessor"
              ? 1
              : key === "phone"
                ? "+447700900899"
                : "wrong-attempt"
        durableReplace(root, path, Buffer.from(JSON.stringify(bad) + "\n"))
        rejected(kind + "-attempt-" + key)
      }
    }
    for (const raw of [
      "{invalid-json",
      JSON.stringify({ ...validRecord, protocol: 1 }) + "\n",
      JSON.stringify({
        ...validRecord,
        request: { ...request, capability: "" },
      }) + "\n",
      JSON.stringify({ ...validRecord, request: { ...expected } }) + "\n",
    ]) {
      durableReplace(root, path, Buffer.from(raw))
      rejected("invalid-protocol-or-record-" + denied.length)
    }
    durableReplace(root, path, validBytes)
    record({
      case: "SCOPED-02",
      deniedRecords: denied.length,
      variants: denied,
      counters: counts,
      beforeGame,
      afterGame: r.snapshot(active.rosterPlayerId!),
      beforeDatabase: beforeDb,
      afterDatabase: snapshotDb(root, r.context),
      secondaryCaseFilePresentButNeverUsed: true,
    })
  } finally {
    durableReplace(root, path, validBytes)
    store.close()
  }
})

test("SCOPED-03 journal scope cannot manufacture independently trusted expected authority", async () => {
  const r = await backend.room(),
    root = backend.privateRoot(),
    verify = trustedVerifier(r),
    expected = attempt("scoped-authority")
  const request = writeScopedPrecommit(root, r.context, expected, verify)
  privateTokens.push(request.capability)
  const path = join(root, expected.requestId + ".synthetic-journal"),
    validBytes = readFileSync(path)
  const store = new PrototypeStore(root, r.context, verify),
    p = new LifecyclePrototype(store, r.facade, verify),
    counts = observeNative(r)
  try {
    const before = snapshotDb(root, r.context)
    let denied = 0
    for (const key of [
      "owner",
      "game",
      "provider",
      "issuerSid",
      "service",
      "executorId",
    ]) {
      const falseExpected = { ...r.context, [key]: "untrusted-context" }
      const candidate = JSON.parse(validBytes.toString()) as {
        scope: Record<string, unknown>
      }
      candidate.scope[key] = "untrusted-context"
      durableReplace(root, path, Buffer.from(JSON.stringify(candidate) + "\n"))
      assert.throws(
        () =>
          dispatchScopedRegistration(
            root,
            falseExpected,
            expected,
            verify,
            (ctx, input) => {
              counts.coordinator++
              return p.register(ctx, input)
            },
          ),
        (error) =>
          error instanceof ScopedFixtureError &&
          error.reason === "expected_context_denied",
      )
      assert.deepEqual(counts, {
        coordinator: 0,
        join: 0,
        answer: 0,
        hangup: 0,
      })
      assert.equal(r.game.players.length, 0)
      assert.deepEqual(snapshotDb(root, r.context), before)
      denied++
    }
    record({
      case: "SCOPED-03",
      journalAndFalseExpectedMatchedButAuthorityDenied: denied,
      counters: counts,
      actualPlayers: 0,
      databaseUnchanged: true,
    })
  } finally {
    durableReplace(root, path, validBytes)
    store.close()
  }
})
