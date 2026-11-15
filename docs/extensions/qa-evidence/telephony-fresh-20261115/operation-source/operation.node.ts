import assert from "node:assert/strict"
import { createDecipheriv, hkdfSync, randomUUID } from "node:crypto"
import { createRequire, syncBuiltinESMExports } from "node:module"
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { after, test } from "node:test"
import { PrivateCallOperationHost } from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/call-operation-host"
import {
  OPERATION_PRECOMMIT_PURPOSE,
  operationText,
} from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/operation-precommit"
import {
  digest,
  scopeText,
} from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/codec"
import { fixture, manager, close, real } from "./actual-operation-backend"
after(close)
type Fixture = Awaited<ReturnType<typeof fixture>>
function readPrivateIntent(
  f: Fixture,
  options: ReturnType<Fixture["options"]>,
) {
  const callText = JSON.stringify([
    f.input.requestId,
    f.input.providerReference,
    f.input.phone,
    f.input.expectedPredecessor,
  ])
  const context = JSON.stringify([callText, operationText(options.intent)])
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      f.key,
      Buffer.from(digest(scopeText(f.target))),
      Buffer.from(
        JSON.stringify([
          OPERATION_PRECOMMIT_PURPOSE,
          "operation-fixture",
          "gateway-key",
          context,
        ]),
      ),
      32,
    ),
  )
  const row = JSON.parse(
    readFileSync(join(options.root, "operation.enc"), "utf8"),
  )
  let plain: Buffer | undefined
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(row.iv, "hex"),
    )
    decipher.setAAD(
      Buffer.from(
        JSON.stringify([
          OPERATION_PRECOMMIT_PURPOSE,
          "operation-fixture",
          "gateway-key",
          scopeText(f.target),
          context,
        ]),
      ),
    )
    decipher.setAuthTag(Buffer.from(row.tag, "hex"))
    plain = Buffer.concat([
      decipher.update(Buffer.from(row.data, "hex")),
      decipher.final(),
    ])
    return JSON.parse(plain.toString())
  } finally {
    key.fill(0)
    plain?.fill(0)
  }
}
async function deniedWithoutSecret(work: () => Promise<unknown>) {
  let safe = false
  try {
    await work()
  } catch (error) {
    safe = error instanceof Error && error.message === "gateway_custody_denied"
  }
  assert.equal(safe, true)
}

test("OP-01 full immutable poll intent precedes send; lost ACK/reopen/service rotation reuse exact backend receipt", async () => {
  const f = await fixture("lost-poll"),
    intent = f.intent("poll"),
    options = f.options(intent),
    op = f.operator.operation(options)
  assert.equal("operation" in f.call, false)
  assert.equal("executeOperation" in f.call, false)
  assert.equal("register" in f.operator, false)
  assert.equal("prepare" in f.operator, false)
  assert.deepEqual(op.prepare(), {
    operationId: intent.operationId,
    precommitted: true,
  })
  assert.equal(f.native.length, 0)
  const body = readPrivateIntent(f, options)
  assert.deepEqual(body.binding, f.actual.current().binding)
  assert.deepEqual(body.call, f.input)
  assert.deepEqual(body.intent, intent)
  assert.equal(JSON.stringify(body).includes("capability"), false)
  const before = readFileSync(join(options.root, "operation.enc"))
  await deniedWithoutSecret(() => op.execute())
  assert.deepEqual(f.native, ["poll"])
  const receipt = await f.operator.operation(options).execute()
  assert.equal(receipt.ok, true)
  assert.equal(receipt.status, "observed")
  assert.deepEqual(f.native, ["poll"])
  assert.throws(() => f.operator.operation(options).prepare())
  const rotated = await f.r.factory.rotate(f.r.subject.token, f.target, {
    requestId: randomUUID(),
    expectedVersion: 1,
  })
  assert.ok(rotated.credential)
  real.remember(rotated.credential)
  const keys = f.opKeys()
  await deniedWithoutSecret(() => op.execute())
  assert.equal(f.opKeys(), keys)
  await f.r.factory.deliverGatewayAttempt(
    f.r.subject.token,
    rotated,
    f.service,
    1,
  )
  await f.service.activate(randomUUID())
  assert.deepEqual(await op.execute(), receipt)
  assert.deepEqual(f.native, ["poll"])
  assert.equal(
    before.equals(readFileSync(join(options.root, "operation.enc"))),
    true,
  )
  real.record({
    test: "OP-01",
    fullPrecommitReadback: true,
    operationFileContainsCapability: false,
    native: f.native,
    lostACKSameReceipt: true,
    serviceVersion: 2,
    intentUnchanged: true,
  })
})

test(
  "OP-02 actual answer scores once through lost ACK; conflicting payload denied and hangup keeps terminal generation",
  { timeout: 45000 },
  async () => {
    const f = await fixture("lost-answer"),
      host = await manager(f)
    await host.start()
    const epoch = f.r.game.getQuestionStateForGateway().epoch
    const intent = f.intent("answer", { epoch, answerIndex: 0 }),
      options = f.options(intent),
      answer = f.operator.operation(options)
    answer.prepare()
    await deniedWithoutSecret(() => answer.execute())
    assert.deepEqual(f.native, ["answer"])
    assert.equal(
      f.r.game.getQuestionStateForGateway(f.joined.rosterPlayerId)
        .answeredCurrentQuestion,
      true,
    )
    const receipt = await f.operator.operation(options).execute()
    assert.equal(receipt.accepted, true)
    assert.deepEqual(f.native, ["answer"])
    const conflicting = f.operator.operation(
      f.options({ ...intent, answerIndex: 1 }),
    )
    conflicting.prepare()
    assert.equal((await conflicting.execute()).status, "operation_conflict")
    assert.deepEqual(f.native, ["answer"])
    await host.until(() => f.r.game.players[0].points > 0)
    const ledger = f.r.game.roundManager.getQuestionLedgerEntry(0)!
    assert.equal(ledger.answers.length, 1)
    assert.deepEqual(ledger.answers[0].answerIds, [0])
    const points = f.r.game.players[0].points
    const hangupOptions = f.options(f.intent("hangup")),
      hangup = f.operator.operation(hangupOptions)
    hangup.prepare()
    assert.equal((await hangup.execute()).ok, true)
    assert.equal(
      (await f.operator.operation(hangupOptions).execute()).status,
      "registration_retired",
    )
    assert.equal((await f.call.register()).status, "registration_retired")
    assert.deepEqual(f.native, ["answer", "hangup"])
    assert.equal(f.r.counters.nativeJoin, 1)
    assert.equal(f.r.game.players[0].points, points)
    assert.equal(f.r.game.players[0].connected, false)
    real.record({
      test: "OP-02",
      actualManagerSocket: true,
      native: f.native,
      archivedAnswers: 1,
      actualPoints: points,
      retiredAfterHangup: true,
      nativeJoin: f.r.counters.nativeJoin,
      implicitRejoin: false,
    })
  },
)

test("OP-03 missing/corrupt/substituted/foreign intent and actual temp-close uncertainty never project or auto-register", async () => {
  const f = await fixture(),
    intent = f.intent("poll"),
    options = f.options(intent),
    op = f.operator.operation(options)
  assert.throws(() => f.operator.operation({ ...options, enabled: false }))
  assert.throws(() =>
    f.operator.operation({
      ...options,
      intent: { ...intent, action: "answer", epoch: 0, answerIndex: 5 },
    }),
  )
  await deniedWithoutSecret(() => op.execute())
  const parentPath = join(f.root, "call.enc")
  renameSync(parentPath, parentPath + ".preserved")
  assert.throws(() => op.prepare())
  assert.equal(existsSync(join(options.root, "operation.initialized")), false)
  renameSync(parentPath + ".preserved", parentPath)
  op.prepare()
  const file = join(options.root, "operation.enc"),
    before = readFileSync(file),
    row = JSON.parse(before.toString())
  row.tag = (row.tag.startsWith("00") ? "01" : "00") + row.tag.slice(2)
  writeFileSync(file, JSON.stringify(row))
  await deniedWithoutSecret(() => op.execute())
  writeFileSync(file, before)
  await deniedWithoutSecret(() =>
    f.operator
      .operation({
        ...options,
        intent: { ...intent, operationId: randomUUID() },
      })
      .execute(),
  )
  const otherCall = new PrivateCallOperationHost({
    ...f.callOptions,
    dispatcher: f.service.operationDispatcher(),
    attempt: { ...f.input, requestId: randomUUID() },
  })
  await deniedWithoutSecret(() => otherCall.operation(options).execute())
  const foreign = f.operator.operation(
    f.options({ ...intent, registrationId: randomUUID() }),
  )
  foreign.prepare()
  assert.equal((await foreign.execute()).status, "binding_denied")
  assert.equal(f.native.length, 0)
  assert.equal(f.r.counters.nativeJoin, 1)
  const uncertainOptions = f.options(f.intent("poll")),
    uncertain = f.operator.operation(uncertainOptions)
  const require = createRequire(import.meta.url),
    fs = require("node:fs") as typeof import("node:fs")
  const originalOpen = fs.openSync,
    originalClose = fs.closeSync
  let targetFd: number | undefined,
    triggered = false
  try {
    fs.openSync = ((...args: Parameters<typeof originalOpen>) => {
      const fd = originalOpen(...args)
      if (String(args[0]) === join(uncertainOptions.root, "operation.next"))
        targetFd = fd
      return fd
    }) as typeof originalOpen
    fs.closeSync = (fd) => {
      originalClose(fd)
      if (fd === targetFd && !triggered) {
        triggered = true
        throw Error("synthetic uncertainty after actual operation temp close")
      }
    }
    syncBuiltinESMExports()
    assert.throws(() => uncertain.prepare())
  } finally {
    fs.openSync = originalOpen
    fs.closeSync = originalClose
    syncBuiltinESMExports()
  }
  assert.equal(triggered, true)
  assert.ok(existsSync(join(uncertainOptions.root, "operation.writer-lock")))
  await deniedWithoutSecret(() =>
    f.operator.operation(uncertainOptions).execute(),
  )
  assert.equal(f.native.length, 0)
  real.record({
    test: "OP-03",
    negativeCasesNative: 0,
    actualTempCloseBarrierRetained: true,
    freshReopenDenied: true,
    nativeJoinRemains: f.r.counters.nativeJoin,
    automaticRegister: false,
    controlledFixtureRestoreOnly: true,
  })
})

test("OP-04 actual SQL finalization failure stays UNKNOWN; actual post-commit revoke denies result without compensation", async () => {
  const f = await fixture(),
    options = f.options(f.intent("poll")),
    op = f.operator.operation(options)
  op.prepare()
  const db = new DatabaseSync(join(f.r.lifecycle, "phone-lifecycle-v2a.sqlite"))
  db.exec(
    "CREATE TRIGGER fixture_operation_finalization BEFORE UPDATE OF state ON operations WHEN NEW.state='APPLIED' BEGIN SELECT RAISE(ABORT,'synthetic finalization failure'); END;",
  )
  try {
    assert.equal((await op.execute()).status, "outcome_unknown")
    assert.equal(
      (await f.operator.operation(options).execute()).status,
      "operation_pending_unknown",
    )
    const later = f.operator.operation(f.options(f.intent("poll")))
    later.prepare()
    assert.equal((await later.execute()).status, "binding_pending_unknown")
    assert.equal(
      db
        .prepare("SELECT state FROM operations WHERE operation_id=?")
        .get(options.intent.operationId)?.state,
      "PENDING",
    )
    assert.deepEqual(f.native, ["poll"])
  } finally {
    db.close()
  }
  const revoked = await fixture("revoke-poll"),
    revokedOptions = revoked.options(revoked.intent("poll")),
    revokedOp = revoked.operator.operation(revokedOptions)
  revokedOp.prepare()
  const before = readFileSync(join(revokedOptions.root, "operation.enc"))
  await deniedWithoutSecret(() => revokedOp.execute())
  const read = new DatabaseSync(
    join(revoked.r.lifecycle, "phone-lifecycle-v2a.sqlite"),
    { readOnly: true },
  )
  try {
    assert.equal(
      read
        .prepare("SELECT state FROM operations WHERE operation_id=?")
        .get(revokedOptions.intent.operationId)?.state,
      "APPLIED",
    )
  } finally {
    read.close()
  }
  assert.deepEqual(revoked.native, ["poll"])
  assert.equal(
    before.equals(readFileSync(join(revokedOptions.root, "operation.enc"))),
    true,
  )
  const count = revoked.opKeys()
  await deniedWithoutSecret(() =>
    revoked.operator.operation(revokedOptions).execute(),
  )
  assert.equal(revoked.opKeys(), count)
  assert.equal(revoked.r.game.players.length, 1)
  real.record({
    test: "OP-04",
    actualPendingNoReplayNative: f.native,
    pendingState: "PENDING",
    actualCommittedState: "APPLIED",
    actualRevokeAfterCommit: true,
    receiptDenied: true,
    operationIntentUnchanged: true,
    compensation: false,
  })
})
