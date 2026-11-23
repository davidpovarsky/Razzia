import assert from "node:assert/strict"
import {
  createDecipheriv,
  hkdfSync,
  randomBytes,
  randomUUID,
} from "node:crypto"
import { createRequire, syncBuiltinESMExports } from "node:module"
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { DatabaseSync } from "node:sqlite"
import { PrivateGatewayAdapter } from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/adapter"
import {
  PrivateCallPrecommit,
  CALL_PRECOMMIT_MARKER,
  CALL_PRECOMMIT_CONTENT,
  CALL_PRECOMMIT_PURPOSE,
} from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/call-precommit"
import {
  GATEWAY_KEY_PURPOSE,
  GATEWAY_ROOT_MARKER,
  GATEWAY_ROOT_CONTENT,
  type GatewayRegistrationAuthorityPort,
} from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/contracts"
import {
  digest,
  scopeText,
} from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/codec"
import * as real from "../gameplay-source/actual-gameplay-backend"

after(real.close)
async function fixture(mode: "normal" | "lost" | "revoke" = "normal") {
  const r = await real.room()
  await r.factory.initializeAuthority(r.subject.token, r.game.gameId)
  const issued = await r.factory.issue(r.subject.token, r.issue)
  assert.ok(issued.credential)
  real.remember(issued.credential)
  const target = {
    owner: r.subject.user.id,
    game: r.game.gameId,
    provider: r.issue.provider,
    service: issued.receipt.service,
  }
  const actual = await r.factory.openGatewayAuthority(r.subject.token, target)
  const observed: string[] = []
  let lose = mode === "lost"
  const authority: GatewayRegistrationAuthorityPort = {
    ...actual,
    async register(binding, credential, input) {
      real.remember(input.capability)
      observed.push(digest(JSON.stringify(input)))
      const receipt = await actual.register(binding, credential, input)
      if (lose) {
        lose = false
        throw Error(input.capability)
      }
      if (mode === "revoke")
        real.account.revokeAccountSession(r.subject.claims.sid!)
      return receipt
    },
  }
  const serviceRoot = real.privateRoot("call-service"),
    root = real.privateRoot("call-precommit"),
    key = randomBytes(32)
  real.remember(key.toString("hex"))
  writeFileSync(join(serviceRoot, GATEWAY_ROOT_MARKER), GATEWAY_ROOT_CONTENT, {
    mode: 0o600,
  })
  writeFileSync(join(root, CALL_PRECOMMIT_MARKER), CALL_PRECOMMIT_CONTENT, {
    mode: 0o600,
  })
  let callKeys = 0
  const keyPort = (call: boolean) => ({
    open() {
      if (call) callKeys++
      const bytes = Buffer.from(key)
      return {
        purpose: GATEWAY_KEY_PURPOSE,
        installationId: "call-fixture",
        keyId: "private-call-key",
        bytes,
        close() {
          bytes.fill(0)
        },
      }
    },
  })
  const service = new PrivateGatewayAdapter({
    enabled: true,
    root: serviceRoot,
    installationId: "call-fixture",
    keyId: "private-call-key",
    target,
    key: keyPort(false),
    authority,
  })
  service.initializeEmpty()
  await r.factory.deliverGatewayAttempt(r.subject.token, issued, service, 0)
  await service.activate(randomUUID())
  const input = {
    requestId: randomUUID(),
    providerReference: randomUUID(),
    phone: "+447700900891",
    expectedPredecessor: 0,
  }
  const options = {
    enabled: true,
    root,
    installationId: "call-fixture",
    keyId: "private-call-key",
    target,
    key: keyPort(true),
    dispatcher: service.registrationDispatcher(),
    attempt: input,
  }
  const journal = new PrivateCallPrecommit(options)
  return {
    r,
    target,
    service,
    actual,
    options,
    journal,
    root,
    key,
    input,
    observed,
    callKeys: () => callKeys,
  }
}
function inspectPrivateFixture(f: Awaited<ReturnType<typeof fixture>>) {
  const expectedAttempt = JSON.stringify([
    f.input.requestId,
    f.input.providerReference,
    f.input.phone,
    f.input.expectedPredecessor,
  ])
  const row = JSON.parse(readFileSync(join(f.root, "call.enc"), "utf8"))
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      f.key,
      Buffer.from(digest(scopeText(f.target))),
      Buffer.from(
        JSON.stringify([
          CALL_PRECOMMIT_PURPOSE,
          "call-fixture",
          "private-call-key",
          expectedAttempt,
        ]),
      ),
      32,
    ),
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
          CALL_PRECOMMIT_PURPOSE,
          "call-fixture",
          "private-call-key",
          scopeText(f.target),
          expectedAttempt,
        ]),
      ),
    )
    decipher.setAuthTag(Buffer.from(row.tag, "hex"))
    plain = Buffer.concat([
      decipher.update(Buffer.from(row.data, "hex")),
      decipher.final(),
    ])
    const body = JSON.parse(plain.toString())
    real.remember(body.input.capability)
    return body
  } finally {
    key.fill(0)
    plain?.fill(0)
  }
}

test("CALL-01 complete encrypted tuple precedes real REGISTER; lost ACK/reopen/rotation retry never mint a new call", async () => {
  const f = await fixture("lost")
  const prepared = f.journal.prepare(f.input)
  assert.deepEqual(prepared, {
    requestId: f.input.requestId,
    precommitted: true,
  })
  assert.equal(f.r.counters.nativeJoin, 0)
  const stored = inspectPrivateFixture(f)
  assert.deepEqual(stored.binding, f.actual.current().binding)
  assert.deepEqual(
    { ...stored.input, capability: undefined },
    { ...f.input, capability: undefined },
  )
  assert.match(stored.input.capability, /^[a-f0-9]{64}$/u)
  const before = readFileSync(join(f.root, "call.enc"))
  let safeLostAck = false
  try {
    await f.journal.register()
  } catch (error) {
    safeLostAck =
      error instanceof Error && error.message === "gateway_custody_denied"
  }
  assert.equal(safeLostAck, true)
  assert.equal(f.r.game.players.length, 1)
  const receipt = await new PrivateCallPrecommit(f.options).register()
  assert.equal(receipt.ok, true)
  assert.equal(f.r.counters.nativeJoin, 1)
  assert.equal(new Set(f.observed).size, 1)
  assert.equal(before.equals(readFileSync(join(f.root, "call.enc"))), true)
  assert.throws(() =>
    f.journal.prepare({ ...f.input, requestId: randomUUID() }),
  )
  const rotated = await f.r.factory.rotate(f.r.subject.token, f.target, {
    requestId: randomUUID(),
    expectedVersion: 1,
  })
  assert.ok(rotated.credential)
  real.remember(rotated.credential)
  const keys = f.callKeys()
  await assert.rejects(f.journal.register())
  assert.equal(f.callKeys(), keys)
  await f.r.factory.deliverGatewayAttempt(
    f.r.subject.token,
    rotated,
    f.service,
    1,
  )
  await f.service.activate(randomUUID())
  assert.deepEqual(await f.journal.register(), receipt)
  assert.equal(f.r.counters.nativeJoin, 1)
  const db = new DatabaseSync(
    join(f.r.lifecycle, "phone-lifecycle-v2a.sqlite"),
    { readOnly: true },
  )
  try {
    assert.equal(
      db
        .prepare("SELECT capability_hash FROM registrations WHERE request_id=?")
        .get(f.input.requestId)?.capability_hash,
      digest(stored.input.capability),
    )
  } finally {
    db.close()
  }
  real.record({
    test: "CALL-01",
    encryptedCompleteTupleReadback: true,
    lostACKPreservedJoin: true,
    exactRetryDigestCount: new Set(f.observed).size,
    nativeJoin: f.r.counters.nativeJoin,
    serviceVersion: 2,
    rawSecretGetter: false,
  })
})

test("CALL-02 malformed/missing/corrupt/wrong-scope/key records never register or initialize implicitly", async () => {
  const f = await fixture()
  const keys = f.callKeys()
  assert.throws(() =>
    f.journal.prepare({ ...f.input, expectedPredecessor: -1 }),
  )
  assert.equal(f.callKeys(), keys)
  f.journal.prepare(f.input)
  const path = join(f.root, "call.enc"),
    original = readFileSync(path),
    row = JSON.parse(original.toString())
  row.data = (row.data.startsWith("00") ? "01" : "00") + row.data.slice(2)
  writeFileSync(path, JSON.stringify(row))
  await assert.rejects(f.journal.register())
  writeFileSync(path, original) // Controlled fixture restoration, no module repair.
  const negative = new PrivateCallPrecommit({
    ...f.options,
    target: { ...f.target, game: "foreign-game" },
  })
  const before = f.callKeys()
  await assert.rejects(negative.register())
  assert.equal(f.callKeys(), before)
  const badKey = new PrivateCallPrecommit({
    ...f.options,
    key: {
      open() {
        const handle = f.options.key.open()
        return {
          ...handle,
          purpose: "mcp-purpose" as typeof GATEWAY_KEY_PURPOSE,
        }
      },
    },
  })
  await assert.rejects(badKey.register())
  const crossCall = new PrivateCallPrecommit({
    ...f.options,
    attempt: { ...f.input, requestId: randomUUID() },
  })
  await assert.rejects(crossCall.register())
  renameSync(path, path + ".preserved")
  await assert.rejects(new PrivateCallPrecommit(f.options).register())
  assert.throws(() => new PrivateCallPrecommit(f.options).prepare(f.input))
  renameSync(path + ".preserved", path)
  assert.equal(f.r.counters.nativeJoin, 0)
  assert.equal((await f.journal.register()).ok, true)
  assert.equal(f.r.counters.nativeJoin, 1)
  real.record({
    test: "CALL-02",
    negativeCasesNoNative: true,
    missingRecordNotReinitialized: true,
    controlledFixtureRestoreOnly: true,
    validControlNative: 1,
  })
})

test("CALL-03 actual file-close uncertainty bars reopen; real post-commit issuer revocation denies receipt without compensation", async () => {
  const f = await fixture(),
    require = createRequire(import.meta.url),
    fs = require("node:fs") as typeof import("node:fs")
  const originalOpen = fs.openSync,
    originalClose = fs.closeSync
  let targetFd: number | undefined,
    triggered = false
  try {
    fs.openSync = ((...args: Parameters<typeof originalOpen>) => {
      const fd = originalOpen(...args)
      if (String(args[0]) === join(f.root, "call.next")) targetFd = fd
      return fd
    }) as typeof originalOpen
    fs.closeSync = (fd) => {
      originalClose(fd)
      if (fd === targetFd && !triggered) {
        triggered = true
        throw Error("synthetic uncertainty after actual close")
      }
    }
    syncBuiltinESMExports()
    assert.throws(() => f.journal.prepare(f.input))
  } finally {
    fs.openSync = originalOpen
    fs.closeSync = originalClose
    syncBuiltinESMExports()
  }
  assert.equal(triggered, true)
  assert.ok(existsSync(join(f.root, "call.writer-lock")))
  await assert.rejects(new PrivateCallPrecommit(f.options).register())
  assert.equal(f.r.counters.nativeJoin, 0)
  const revoked = await fixture("revoke")
  revoked.journal.prepare(revoked.input)
  const before = readFileSync(join(revoked.root, "call.enc"))
  await assert.rejects(revoked.journal.register())
  assert.equal(revoked.r.game.players.length, 1)
  const db = new DatabaseSync(
    join(revoked.r.lifecycle, "phone-lifecycle-v2a.sqlite"),
    { readOnly: true },
  )
  try {
    assert.equal(
      db
        .prepare("SELECT state FROM registrations WHERE request_id=?")
        .get(revoked.input.requestId)?.state,
      "ACTIVE",
    )
  } finally {
    db.close()
  }
  assert.equal(
    before.equals(readFileSync(join(revoked.root, "call.enc"))),
    true,
  )
  const count = revoked.callKeys()
  await assert.rejects(new PrivateCallPrecommit(revoked.options).register())
  assert.equal(revoked.callKeys(), count)
  real.record({
    test: "CALL-03",
    actualCloseFaultBarrierRetained: true,
    freshReopenDenied: true,
    actualNativeJoinBeforeRevocation: revoked.r.counters.nativeJoin,
    postAwaitDisclosureDenied: true,
    compensation: false,
  })
})
