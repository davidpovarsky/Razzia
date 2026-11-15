import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { createRequire, syncBuiltinESMExports } from "node:module"
import {
  existsSync,
  linkSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { PrivateGatewayAdapter } from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/adapter"
import {
  GATEWAY_KEY_PURPOSE,
  GATEWAY_ROOT_CONTENT,
  GATEWAY_ROOT_MARKER,
  type GatewayAuthorityPort,
  type GatewayDelivery,
  type GatewayDeliveryDestination,
  type GatewayPrivateKeyPort,
} from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/contracts"
import * as real from "../remaining-source/actual-auth-backend"

after(real.close)
const provider = "synthetic-provider"
async function fixture() {
  const subject = await real.owner(),
    game = await real.nativeGame(subject)
  const root = real.privateRoot("gateway-authority"),
    lifecycle = real.privateRoot("gateway-lifecycle")
  const factory = new real.UnmountedPhoneAuthority({
    authorityRoot: root,
    nativeAdoption: true,
    gatewayDelivery: true,
    allowedProviders: [provider],
    lifecycleRoot: () => lifecycle,
  })
  real.trackFactory(factory)
  factory.stageFreshGatewayGame(game)
  real.registry.addGame(game)
  await factory.initializeAuthority(subject.token, game.gameId)
  const issue = {
    game: game.gameId,
    provider,
    requestId: randomUUID(),
    expiresAt: Date.now() + 300000,
    initialActions: ["register", "poll", "answer", "hangup"] as const,
  }
  const attempt = await factory.issue(subject.token, issue)
  assert.ok(attempt.credential)
  real.remember(attempt.credential)
  const target = {
    owner: subject.user.id,
    game: game.gameId,
    provider,
    service: attempt.receipt.service,
  }
  const authority = await factory.openGatewayAuthority(subject.token, target)
  const custodyRoot = real.privateRoot("gateway-custody")
  writeFileSync(join(custodyRoot, GATEWAY_ROOT_MARKER), GATEWAY_ROOT_CONTENT, {
    mode: 0o600,
  })
  const keyBytes = randomBytes(32)
  real.remember(keyBytes.toString("hex"))
  let opens = 0,
    closes = 0
  const key: GatewayPrivateKeyPort = {
    open() {
      opens++
      const bytes = Buffer.from(keyBytes)
      return {
        purpose: GATEWAY_KEY_PURPOSE,
        installationId: "synthetic-gateway",
        keyId: "synthetic-key-v1",
        bytes,
        close() {
          closes++
          bytes.fill(0)
        },
      }
    },
  }
  const options = {
    enabled: true,
    root: custodyRoot,
    installationId: "synthetic-gateway",
    keyId: "synthetic-key-v1",
    target,
    key,
    authority,
  }
  const adapter = new PrivateGatewayAdapter(options)
  adapter.initializeEmpty()
  const deliver = (
    destination: GatewayDeliveryDestination = adapter,
    expected = 0,
  ) =>
    factory.deliverGatewayAttempt(subject.token, attempt, destination, expected)
  const rotate = async (version: number) => {
    const next = await factory.rotate(subject.token, target, {
      requestId: randomUUID(),
      expectedVersion: version,
    })
    assert.ok(next.credential)
    real.remember(next.credential)
    return next
  }
  return {
    subject,
    game,
    root,
    factory,
    issue,
    attempt,
    target,
    authority,
    custodyRoot,
    keyBytes,
    key,
    options,
    adapter,
    deliver,
    rotate,
    counts: () => ({ opens, closes }),
  }
}

test("actual first-attempt binding delivery, explicit activation and a fresh adapter/key handle", async () => {
  const f = await fixture()
  assert.throws(() => f.adapter.inspect())
  const ack = await f.deliver()
  assert.deepEqual(Object.keys(ack).sort(), [
    "deliveryId",
    "installationId",
    "protocol",
    "service",
    "storedVersion",
  ])
  assert.equal(ack.storedVersion, 1)
  assert.deepEqual(Object.keys(f.attempt).sort(), ["credential", "receipt"])
  assert.throws(() => f.adapter.authorization("poll"))
  assert.equal((await f.adapter.activate(randomUUID())).state, "ACTIVE")
  const restarted = new PrivateGatewayAdapter(f.options)
  assert.equal(restarted.authorization("poll").storedVersion, 1)
  assert.equal(restarted.inspect().deliveryId, ack.deliveryId)
  await assert.rejects(f.deliver())
  await assert.rejects(
    f.factory.deliverGatewayAttempt(
      f.subject.token,
      { ...f.attempt },
      f.adapter,
      0,
    ),
  )
  const retry = await f.factory.issue(f.subject.token, f.issue)
  assert.equal(retry.credential, undefined)
  await assert.rejects(
    f.factory.deliverGatewayAttempt(f.subject.token, retry, f.adapter, 0),
  )
  assert.equal(f.game.players.length, 0)
  assert.deepEqual(f.counts(), {
    opens: f.counts().closes,
    closes: f.counts().closes,
  })
  real.record({
    test: "gateway-delivery-activation-fresh-adapter",
    ...f.counts(),
    storedVersion: 1,
    nativePlayers: 0,
    fresh_process: false,
    raw_secret_fields_in_ack: false,
  })
})

test("lost ACK stays committed; exact duplicate, explicit version skip and stale/CAS denial", async () => {
  const f = await fixture()
  let captured: GatewayDelivery | undefined
  await assert.rejects(
    f.deliver({
      async acceptDelivery(value) {
        captured = value
        await f.adapter.acceptDelivery(value)
        throw Error("synthetic lost ACK")
      },
    }),
  )
  assert.ok(captured)
  assert.equal(new PrivateGatewayAdapter(f.options).inspect().storedVersion, 1)
  const before = readFileSync(join(f.custodyRoot, "credential.enc"))
  assert.equal((await f.adapter.acceptDelivery(captured)).storedVersion, 1)
  assert.ok(before.equals(readFileSync(join(f.custodyRoot, "credential.enc"))))
  const second = await f.rotate(1),
    third = await f.rotate(2)
  await assert.rejects(
    f.factory.deliverGatewayAttempt(f.subject.token, second, f.adapter, 1),
  )
  assert.equal(
    (
      await f.factory.deliverGatewayAttempt(
        f.subject.token,
        third,
        f.adapter,
        1,
      )
    ).storedVersion,
    3,
  )
  await assert.rejects(f.adapter.acceptDelivery(captured))
  const fourth = await f.rotate(3)
  await assert.rejects(
    f.factory.deliverGatewayAttempt(f.subject.token, fourth, f.adapter, 0),
  )
  await assert.rejects(
    f.factory.deliverGatewayAttempt(f.subject.token, fourth, f.adapter, 3),
  )
  assert.throws(() => f.adapter.inspect())
  real.record({
    test: "lost-ACK-and-CAS",
    committed_after_lost_ack: true,
    exact_duplicate_no_overwrite: true,
    skipped_to: 3,
    stale_and_wrong_CAS_denied: true,
    consumed_failed_attempt: true,
  })
})

test("default OFF and actual fresh Game publication fence; caller/session revocation before key access", async () => {
  const subject = await real.owner(),
    game = await real.nativeGame(subject)
  real.registry.addGame(game)
  const factory = new real.UnmountedPhoneAuthority({
    authorityRoot: real.privateRoot("off"),
    allowedProviders: [provider],
    lifecycleRoot: () => "/invalid",
  })
  real.trackFactory(factory)
  assert.throws(() => factory.stageFreshGatewayGame(game))
  const enabled = new real.UnmountedPhoneAuthority({
    authorityRoot: real.privateRoot("late"),
    nativeAdoption: true,
    gatewayDelivery: true,
    allowedProviders: [provider],
    lifecycleRoot: () => "/invalid",
  })
  real.trackFactory(enabled)
  assert.throws(() => enabled.stageFreshGatewayGame(game))
  await enabled.initializeAuthority(subject.token, game.gameId)
  await assert.rejects(
    enabled.issue(subject.token, {
      game: game.gameId,
      provider,
      requestId: randomUUID(),
      expiresAt: Date.now() + 20000,
      initialActions: ["register", "poll", "answer", "hangup"],
    }),
  )
  const f = await fixture()
  await f.deliver()
  const before = f.counts()
  real.account.revokeAccountSession(f.subject.claims.sid!)
  assert.throws(() => f.adapter.inspect())
  assert.throws(() => new PrivateGatewayAdapter(f.options).initializeEmpty())
  await assert.rejects(f.adapter.activate(randomUUID()))
  assert.deepEqual(f.counts(), before)
  real.record({
    test: "fresh-composition-and-revocation",
    published_Game_denied: true,
    disabled_denied: true,
    keys_opened_after_revoke: 0,
  })
})

test("key/purpose/scope/ciphertext/missing/lock/temp/link/root substitution all deny without native work", async () => {
  const f = await fixture()
  await f.deliver()
  const file = join(f.custodyRoot, "credential.enc"),
    original = readFileSync(file)
  const negative = (overrides: Partial<typeof f.options>) =>
    assert.throws(() =>
      new PrivateGatewayAdapter({ ...f.options, ...overrides }).inspect(),
    )
  negative({ keyId: "wrong-key" })
  negative({ installationId: "wrong-installation" })
  negative({ target: { ...f.target, service: "wrong-service" } })
  negative({
    key: {
      open() {
        const h = f.key.open()
        return { ...h, bytes: randomBytes(32) }
      },
    },
  })
  negative({
    key: {
      open() {
        return {
          ...f.key.open(),
          purpose: "mcp-key" as typeof GATEWAY_KEY_PURPOSE,
        }
      },
    },
  })
  const changed = JSON.parse(original.toString())
  changed.header.storedVersion++
  writeFileSync(file, JSON.stringify(changed))
  assert.throws(() => f.adapter.inspect())
  writeFileSync(file, original)
  const backup = join(f.custodyRoot, "preserved.enc")
  renameSync(file, backup)
  assert.throws(() => new PrivateGatewayAdapter(f.options).inspect())
  assert.throws(() => new PrivateGatewayAdapter(f.options).initializeEmpty())
  symlinkSync(backup, file)
  assert.throws(() => f.adapter.inspect())
  unlinkSync(file)
  linkSync(backup, file)
  assert.throws(() => f.adapter.inspect())
  unlinkSync(file)
  renameSync(backup, file)
  for (const name of ["custody.writer-lock", "credential.next"]) {
    const path = join(f.custodyRoot, name)
    writeFileSync(path, "synthetic uncertainty\n", { mode: 0o600 })
    assert.throws(() => new PrivateGatewayAdapter(f.options).inspect())
    unlinkSync(path)
  }
  const moved = f.custodyRoot + "-preserved"
  renameSync(f.custodyRoot, moved)
  symlinkSync(moved, f.custodyRoot)
  assert.throws(() => f.adapter.inspect())
  unlinkSync(f.custodyRoot)
  renameSync(moved, f.custodyRoot)
  assert.equal(f.game.players.length, 0)
  real.record({
    test: "custody-negative-files-and-keys",
    checks: 12,
    nativePlayers: 0,
    controlled_fixture_restoration_only: true,
    automatic_repair: false,
  })
})

test("sender closes after actual receiver COMMIT; receiver keeps ciphertext and denies ACK/read", async () => {
  const f = await fixture()
  await assert.rejects(
    f.deliver({
      async acceptDelivery(value) {
        const ack = await f.adapter.acceptDelivery(value)
        f.factory.close()
        return ack
      },
    }),
  )
  assert.ok(existsSync(join(f.custodyRoot, "credential.enc")))
  assert.equal(existsSync(join(f.custodyRoot, "custody.writer-lock")), false)
  const before = f.counts()
  assert.throws(() => new PrivateGatewayAdapter(f.options).inspect())
  assert.deepEqual(f.counts(), before)
  real.record({
    test: "sender-close-after-receiver-commit",
    ciphertext_preserved: true,
    ACK_denied: true,
    compensation: false,
  })
})

test("real activation COMMIT then issuer revocation across await denies receipt without rollback", async () => {
  const f = await fixture()
  await f.deliver()
  const authority: GatewayAuthorityPort = {
    ...f.authority,
    async activate(...args) {
      const receipt = await f.authority.activate(...args)
      real.account.revokeAccountSession(f.subject.claims.sid!)
      return receipt
    },
  }
  await assert.rejects(
    new PrivateGatewayAdapter({ ...f.options, authority }).activate(
      randomUUID(),
    ),
  )
  const sqlite = await import("node:sqlite")
  const db = new sqlite.DatabaseSync(
    join(f.root, "phone-service-authority.sqlite"),
    { readOnly: true },
  )
  let state: unknown
  try {
    state = db
      .prepare("SELECT state FROM leases WHERE service=?")
      .get(f.target.service)?.state
  } finally {
    db.close()
  }
  assert.equal(state, "ACTIVE")
  real.record({
    test: "post-await-revocation",
    committed_state: state,
    receipt_denied: true,
    compensation: false,
  })
})

test("actual temp close and post-rename uncertainty retain barriers and deny fresh reopen", async () => {
  const require = createRequire(import.meta.url),
    fs = require("node:fs") as typeof import("node:fs")
  for (const fault of ["close", "rename"] as const) {
    const f = await fixture()
    const close = fs.closeSync,
      rename = fs.renameSync,
      open = fs.openSync
    let targetFd: number | undefined,
      triggered = false
    try {
      fs.openSync = ((...args: Parameters<typeof open>) => {
        const fd = open(...args)
        if (String(args[0]) === join(f.custodyRoot, "credential.next"))
          targetFd = fd
        return fd
      }) as typeof open
      fs.closeSync = (fd) => {
        close(fd)
        if (fault === "close" && fd === targetFd && !triggered) {
          triggered = true
          throw Error("synthetic close uncertainty after actual close")
        }
      }
      fs.renameSync = (from, to) => {
        rename(from, to)
        if (
          fault === "rename" &&
          String(to) === join(f.custodyRoot, "credential.enc") &&
          !triggered
        ) {
          triggered = true
          throw Error("synthetic rename uncertainty after actual rename")
        }
      }
      syncBuiltinESMExports()
      await assert.rejects(f.deliver())
    } finally {
      fs.openSync = open
      fs.closeSync = close
      fs.renameSync = rename
      syncBuiltinESMExports()
    }
    assert.equal(triggered, true)
    assert.ok(existsSync(join(f.custodyRoot, "custody.writer-lock")))
    assert.throws(() => new PrivateGatewayAdapter(f.options).inspect())
    assert.throws(() => new PrivateGatewayAdapter(f.options).initializeEmpty())
    real.record({
      test: "actual-file-uncertainty",
      fault,
      barrier_retained: true,
      fresh_reopen_denied: true,
      automatic_repair: false,
    })
  }
})
