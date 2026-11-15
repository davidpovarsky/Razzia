// Isolated synthetic account/SQLite proof, never ordinary Vitest or production.
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { randomBytes } from "node:crypto"
import { fork } from "node:child_process"
import { once } from "node:events"
import { DatabaseSync } from "node:sqlite"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Action, RegistrationInput } from "../../../../../extensions/src/server/phone-lifecycle-v2/contracts"
import type { ServiceAddress } from "../../../../../extensions/src/server/phone-lifecycle-v2/auth/contracts"

assert.equal(process.env.PHONE_AUTHORITY_SOURCE_RUN, "granted")
const parent = resolve(process.env.PHONE_AUTHORITY_FIXTURES ?? "/invalid")
assert.ok(parent.startsWith("/fixtures/phone-auth-"))
mkdirSync(parent, { recursive: true, mode: 0o700 })
const fixture = mkdtempSync(join(parent, "strict-account-")), evidence = process.env.PHONE_AUTHORITY_EVIDENCE!
assert.ok(evidence.startsWith("/evidence/phone-auth-"))
process.env.CONFIG_PATH = fixture
const fixtureJwtSecret = randomBytes(32).toString("hex")
process.env.JWT_SECRET = fixtureJwtSecret
process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
process.env.TADAZZ_BILLING_ENABLED = "false" // Auth proof does not assert paid entitlement.
process.env.RESEND_API_KEY = "synthetic-no-network"
process.env.TADAZZ_AUTH_EMAIL_FROM = "phone-auth@example.invalid"
const { checkAccountConfiguration, closeAccountDb } = await import("@razzia/socket/services/account-db")
const account = await import("@razzia/socket/services/account-auth")
const auth = await import("@razzia/socket/services/auth")
const { SESSION_ROLES } = await import("@razzia/common/constants")
const { withAccount } = await import("@razzia/socket/services/account-scope")
const { initConfig } = await import("@razzia/socket/services/config")
const { createAdaptorServer } = await import("@hono/node-server")
const { app, createSocketServer } = await import("@razzia/socket/app")
const { default: Game } = await import("@razzia/socket/services/game")
const { default: Registry } = await import("@razzia/socket/services/registry")
const { createQuestion, createQuizz } = await import("@razzia/socket/test/fixtures")
const { UnmountedPhoneAuthority } = await import("../../../../../extensions/src/server/phone-lifecycle-v2/auth/unmounted-factory")
const { PrivateAuthorityFiles } = await import("../../../../../extensions/src/server/phone-lifecycle-v2/auth/private-authority-files")
const { ReadonlyServiceLeaseReader } = await import("../../../../../extensions/src/server/phone-lifecycle-v2/auth/authority-store")
const { NativeAccountAuthority } = await import("../../../../../extensions/src/telephony/pilot-runtime/service-auth-v2/native-account-authority")
checkAccountConfiguration(); initConfig()
const server = createAdaptorServer(app), io = createSocketServer(server), registry = Registry.getInstance()
await new Promise<void>(done => server.listen(0, "127.0.0.1", done))
const factories: InstanceType<typeof UnmountedPhoneAuthority>[] = [], observations: unknown[] = []
const secrets: string[] = [fixtureJwtSecret]
const phoneActions: Action[] = ["register", "poll", "answer", "hangup"]
const password = randomBytes(24).toString("hex")
const owner = await account.registerAccount("phone-owner@example.invalid", password)
assert.equal(await account.authenticate(owner.email, password), null)
const code = account.issueCode(owner.id, "verify")
assert.ok(account.consumeCode(owner.email, "verify", code)?.verified)
assert.equal((await account.authenticate(owner.email, password))?.id, owner.id)
const session = await auth.mintToken(owner.id, SESSION_ROLES.MANAGER)
secrets.push(session.token)
const claims = await auth.verifyToken(session.token); assert.ok(claims.sid)

function privateRoot() {
  const root = mkdtempSync(join(parent, "authority-"))
  writeFileSync(join(root, "PHONE_V2A_SYNTHETIC_ONLY"), "synthetic-v2a-only\n", { mode: 0o600 })
  return root
}
async function setup(id: string) {
  const game = await withAccount(owner.id, () => new Game(io, owner.id, createQuizz([createQuestion()])))
  registry.addGame(game)
  const root = privateRoot(), lifecycle = privateRoot(), counters = { root: 0, nativeJoin: 0 }
  const joinPhone = game.joinOrRebindPhoneCaller.bind(game)
  game.joinOrRebindPhoneCaller = (...args) => { counters.nativeJoin++; return joinPhone(...args) }
  const factory = new UnmountedPhoneAuthority({ authorityRoot: root, allowedProviders: ["synthetic-provider"],
    lifecycleRoot: (verifiedOwner, verifiedGame) => {
      assert.equal(verifiedOwner, owner.id); assert.equal(verifiedGame, game.gameId)
      counters.root++; return lifecycle
    } })
  factories.push(factory)
  const issue = { game: game.gameId, provider: "synthetic-provider", requestId: id,
    expiresAt: Date.now() + 300000, initialActions: phoneActions }
  const reader = new ReadonlyServiceLeaseReader(new PrivateAuthorityFiles(root))
  return { game, root, factory, counters, issue, reader }
}
function address(game: string, service: string, version = 1): ServiceAddress {
  return { owner: owner.id, game, provider: "synthetic-provider", service, version }
}
function call(id: string): RegistrationInput {
  const capability = randomBytes(32).toString("hex"); secrets.push(capability)
  return { requestId: id, providerReference: id, expectedPredecessor: 0, phone: "+447700900851", capability }
}
function authorityBytes(root: string) { return readFileSync(join(root, "phone-service-authority.sqlite")) }
after(async () => {
  for (const factory of factories) factory.close()
  for (const game of registry.getAllGames()) registry.removeGame(game.gameId)
  registry.cleanup(); io.disconnectSockets(true)
  await new Promise<void>(done => io.close(() => done()))
  closeAccountDb()
  const report = JSON.stringify({ scope: "unmounted actual native account/session/Game source candidate", observations }, null, 2) + "\n"
  assert.equal(secrets.some(secret => report.includes(secret)), false)
  const scan = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? scan(join(root, entry.name)) : entry.isFile() ? [join(root, entry.name)] : [])
  for (const file of [...scan(parent), ...scan(evidence)]) {
    const bytes = readFileSync(file)
    assert.equal(secrets.some(secret => bytes.includes(Buffer.from(secret))), false, "raw private value outside ephemeral request memory")
  }
  writeFileSync(join(evidence, "authority-observations.json"), report)
})

test("AUTH-01 readonly missing/corrupt/uncertain roots never initialize; ACTIVE proof precedes lifecycle access", async () => {
  const r = await setup("issue-one"), unknown = address(r.game.gameId, "unknown")
  const filesBefore = readdirSync(r.root)
  assert.throws(() => r.reader.readCurrent(unknown)); assert.deepEqual(readdirSync(r.root), filesBefore)
  const corrupt = privateRoot(), badPath = join(corrupt, "phone-service-authority.sqlite")
  writeFileSync(badPath, "not a database", { mode: 0o600 })
  const beforeBad = readFileSync(badPath)
  assert.throws(() => new ReadonlyServiceLeaseReader(new PrivateAuthorityFiles(corrupt)).readCurrent(unknown))
  assert.deepEqual(readFileSync(badPath), beforeBad)
  await r.factory.initializeAuthority(session.token, r.game.gameId)
  const issued = await r.factory.issue(session.token, r.issue); assert.ok(issued.receipt.ok)
  assert.equal(typeof issued.credential, "string"); const credential = issued.credential!; secrets.push(credential)
  const retry = await r.factory.issue(session.token, r.issue)
  assert.equal("credential" in retry, false); assert.deepEqual(retry.receipt, issued.receipt)
  const a = address(r.game.gameId, issued.receipt.service), input = call("call-one")
  await assert.rejects(r.factory.register(a, credential, input))
  assert.deepEqual(r.counters, { root: 0, nativeJoin: 0 })
  await r.factory.activate(a, credential, { requestId: "activate-one", expectedVersion: 1 })
  const joined = await r.factory.register(a, credential, input); assert.equal(joined.ok, true)
  const replay = await r.factory.register(a, credential, input); assert.deepEqual(replay, joined)
  assert.deepEqual(r.counters, { root: 1, nativeJoin: 1 })
  assert.equal(authorityBytes(r.root).includes(Buffer.from(credential)), false)
  const uncertain = privateRoot()
  writeFileSync(join(uncertain, "phone-service-authority.writer-lock"), "uncertain", { mode: 0o600 })
  assert.throws(() => new ReadonlyServiceLeaseReader(new PrivateAuthorityFiles(uncertain)).readCurrent(unknown))
  assert.equal(existsSync(join(uncertain, "phone-service-authority.writer-lock")), true)
  observations.push({ case: "AUTH-01", verifiedAccountAndRealSid: true, readonlyDenialsUnchanged: true,
    pendingHadZeroLifecycleAccess: true, actualCounters: r.counters, returnedSecretOnRetry: false })
})

test("AUTH-02 hash-only lost/reordered delivery, expected-version rotation and revoke preserve one authority", async () => {
  const r = await setup("issue-two")
  await r.factory.initializeAuthority(session.token, r.game.gameId)
  const issued = await r.factory.issue(session.token, r.issue), first = issued.credential!; secrets.push(first)
  let a = address(r.game.gameId, issued.receipt.service)
  await r.factory.activate(a, first, { requestId: "activate-v1", expectedVersion: 1 })
  const target = { game: a.game, provider: a.provider, service: a.service }
  const rotate = { requestId: "rotate-v1", expectedVersion: 1 }
  const v2 = await r.factory.rotate(session.token, target, rotate), second = v2.credential!; secrets.push(second)
  const replay = await r.factory.rotate(session.token, target, rotate)
  assert.equal("credential" in replay, false); assert.deepEqual(replay.receipt, v2.receipt)
  // Model a lost v2 response: retry cannot reveal it, and explicit rotation is required.
  const v3 = await r.factory.rotate(session.token, target, { requestId: "rotate-v2", expectedVersion: 2 })
  const third = v3.credential!; secrets.push(third)
  await assert.rejects(r.factory.activate(a, first, { requestId: "late-v1", expectedVersion: 1 }))
  await assert.rejects(r.factory.activate({ ...a, version: 2 }, second, { requestId: "late-v2", expectedVersion: 2 }))
  assert.deepEqual(r.counters, { root: 0, nativeJoin: 0 })
  a = { ...a, version: 3 }
  await r.factory.activate(a, third, { requestId: "activate-v3", expectedVersion: 3 })
  const input = call("call-two"), joined = await r.factory.register(a, third, input); assert.equal(joined.ok, true)
  const revoked = await r.factory.revoke(session.token, target, { requestId: "revoke-v3", expectedVersion: 3 })
  assert.equal(revoked.receipt.state, "REVOKED"); assert.equal(revoked.receipt.version, 4)
  await assert.rejects(r.factory.register(a, third, input)) // Even cached lifecycle receipt denies.
  assert.deepEqual(r.counters, { root: 1, nativeJoin: 1 })
  observations.push({ case: "AUTH-02", oldVersionsDenied: 2, lostSecretRetryDidNotReveal: true,
    monotonicTerminalVersion: 4, actualCounters: r.counters })
})

test("AUTH-04 factory close during real manager preparation prevents initialization", async () => {
  const r = await setup("close-preparation"), before = readdirSync(r.root)
  const original = NativeAccountAuthority.prototype.prepareManager
  try {
    NativeAccountAuthority.prototype.prepareManager = async function (...args) {
      const prepared = await original.apply(this, args)
      r.factory.close()
      return prepared
    }
    await assert.rejects(r.factory.initializeAuthority(session.token, r.game.gameId))
  } finally { NativeAccountAuthority.prototype.prepareManager = original }
  assert.deepEqual(readdirSync(r.root), before)
  assert.deepEqual(r.counters, { root: 0, nativeJoin: 0 })
  observations.push({ case: "AUTH-04", actualManagerPrepared: true, postCloseInitialization: false })
})

test("AUTH-05 factory close after committed issue/rotation/activation denies disclosure and preserves decisions", async () => {
  for (const action of ["issue", "rotate", "activate", "register"] as const) {
    const r = await setup("close-disclosure-" + action)
    await r.factory.initializeAuthority(session.token, r.game.gameId)
    let a: ServiceAddress | undefined, credential: string | undefined
    if (action !== "issue") {
      const issued = await r.factory.issue(session.token, r.issue)
      credential = issued.credential!; secrets.push(credential)
      a = address(r.game.gameId, issued.receipt.service)
      if (action !== "activate") await r.factory.activate(a, credential, { requestId: "activate-before-close", expectedVersion: 1 })
    }
    const original = DatabaseSync.prototype.exec
    let commits = 0
    try {
      DatabaseSync.prototype.exec = function (this: DatabaseSync, sql: string) {
        const result = original.call(this, sql)
        if (sql === "COMMIT") {
          commits++
          // Runs after the synchronous owning turn, before withAccount's caller resumes.
          queueMicrotask(() => r.factory.close())
        }
        return result
      }
      await assert.rejects(action === "issue" ? r.factory.issue(session.token, r.issue) :
        action === "rotate" ? r.factory.rotate(session.token, { game: a!.game, provider: a!.provider, service: a!.service },
          { requestId: "rotate-before-close", expectedVersion: 1 }) :
        action === "activate" ? r.factory.activate(a!, credential!, { requestId: "activate-before-close", expectedVersion: 1 }) :
        r.factory.register(a!, credential!, call("register-before-close")))
    } finally { DatabaseSync.prototype.exec = original }
    assert.ok(commits > 0)
    if (action === "issue") {
      const db = new DatabaseSync(join(r.root, "phone-service-authority.sqlite"), { readOnly: true })
      try { assert.equal((db.prepare("SELECT count(*) AS n FROM leases").get() as { n: number }).n, 1) }
      finally { db.close() }
    } else {
      const current = r.reader.readCurrent(a!)
      assert.equal(current?.version, action === "rotate" ? 2 : 1)
      assert.equal(current?.state, action === "rotate" ? "PENDING_DELIVERY" : "ACTIVE")
      if (action === "register") assert.equal(r.game.players.length, 1)
    }
    observations.push({ case: "AUTH-05", action, actualCommits: commits, disclosureDenied: true, decisionPreserved: true })
  }
})

test("AUTH-06 uncertain SQLite close denies initializer/revoker and retains committed state plus reopen barrier", async () => {
  for (const action of ["initialize", "revoke"] as const) {
    const r = await setup("close-error-" + action)
    let a: ServiceAddress | undefined
    if (action === "revoke") {
      await r.factory.initializeAuthority(session.token, r.game.gameId)
      const issued = await r.factory.issue(session.token, r.issue)
      secrets.push(issued.credential!)
      a = address(r.game.gameId, issued.receipt.service)
    }
    const originalExec = DatabaseSync.prototype.exec, originalClose = DatabaseSync.prototype.close
    const committed = new WeakSet<DatabaseSync>()
    let closeErrors = 0
    try {
      DatabaseSync.prototype.exec = function (this: DatabaseSync, sql: string) {
        const result = originalExec.call(this, sql)
        if (sql === "COMMIT") committed.add(this)
        return result
      }
      DatabaseSync.prototype.close = function (this: DatabaseSync) {
        originalClose.call(this)
        if (committed.has(this)) { closeErrors++; throw new Error("synthetic uncertain close after actual SQLite commit") }
      }
      await assert.rejects(action === "initialize" ? r.factory.initializeAuthority(session.token, r.game.gameId) :
        r.factory.revoke(session.token, { game: a!.game, provider: a!.provider, service: a!.service },
          { requestId: "revoke-close-error", expectedVersion: 1 }))
    } finally { DatabaseSync.prototype.exec = originalExec; DatabaseSync.prototype.close = originalClose }
    assert.equal(closeErrors, 1)
    assert.ok(existsSync(join(r.root, "phone-service-authority.writer-lock")))
    const reopened = new ReadonlyServiceLeaseReader(new PrivateAuthorityFiles(r.root))
    assert.throws(() => reopened.readCurrent(a ?? address(r.game.gameId, "unknown")))
    await assert.rejects(r.factory.initializeAuthority(session.token, r.game.gameId))
    const db = new DatabaseSync(join(r.root, "phone-service-authority.sqlite"), { readOnly: true })
    try {
      assert.equal((db.prepare("SELECT count(*) AS n FROM authority_meta").get() as { n: number }).n, 1)
      if (action === "revoke") assert.equal((db.prepare("SELECT state FROM leases").get() as { state: string }).state, "REVOKED")
    } finally { db.close() }
    observations.push({ case: "AUTH-06", action, closeErrors, callerDenied: true, markerPreserved: true,
      reopenDenied: true, knownCommitPreserved: true })
  }
})

test("AUTH-03 actual session revocation while SQLite BEGIN waits blocks control effect and disclosure", { timeout: 30000 }, async (t) => {
  const r = await setup("issue-three")
  await r.factory.initializeAuthority(session.token, r.game.gameId)
  const issued = await r.factory.issue(session.token, r.issue), credential = issued.credential!; secrets.push(credential)
  const a = address(r.game.gameId, issued.receipt.service)
  await r.factory.activate(a, credential, { requestId: "activate-three", expectedVersion: 1 })
  const before = r.reader.readCurrent(a), entered = join(r.root, "writer-entered-begin")
  const input = join(r.root, "private-wait-input.json")
  writeFileSync(input, JSON.stringify({ authorityFile: join(r.root, "phone-service-authority.sqlite"),
    entered, sid: claims.sid }), { mode: 0o600, flag: "wx" })
  const child = fork(join(dirname(fileURLToPath(import.meta.url)), "revoke-after-sql-wait.child.ts"), [], {
    env: { ...process.env, PHONE_AUTHORITY_WAIT_INPUT: input }, execArgv: process.execArgv,
    stdio: ["ignore", "inherit", "inherit", "ipc"], cwd: "/work" })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL") })
  const held = await new Promise<unknown>((done, reject) => {
    const timer = setTimeout(() => reject(new Error("No SQL-lock handshake")), 15000)
    child.once("message", message => { clearTimeout(timer); done(message) })
    child.once("error", error => { clearTimeout(timer); reject(error) })
    child.once("exit", () => { clearTimeout(timer); reject(new Error("Early SQL-lock child exit")) })
  })
  assert.deepEqual(held, { held: true })
  const childExit = once(child, "exit"), original = DatabaseSync.prototype.exec,
    originalPrepare = DatabaseSync.prototype.prepare
  let beginReturned = false, leaseMutationCalls = 0
  try {
    // Transparent observation of actual SQL entry, not a replacement DB/admission.
    DatabaseSync.prototype.exec = function (this: DatabaseSync, sql: string) {
      if (sql === "BEGIN IMMEDIATE") writeFileSync(entered, "entered", { mode: 0o600 })
      const result = original.call(this, sql)
      if (sql === "BEGIN IMMEDIATE") beginReturned = true
      return result
    }
    DatabaseSync.prototype.prepare = function (this: DatabaseSync, sql: string) {
      const statement = originalPrepare.call(this, sql)
      if (!/^(?:UPDATE leases|INSERT INTO control_receipts)/u.test(sql.trim())) return statement
      return new Proxy(statement, { get(target, property) {
        if (property === "run") return (...args: Parameters<typeof statement.run>) => {
          leaseMutationCalls++; return Reflect.apply(statement.run, statement, args)
        }
        const value: unknown = Reflect.get(target, property, target)
        return typeof value === "function" ? value.bind(target) : value
      } })
    }
    await assert.rejects(r.factory.rotate(session.token, { game: a.game, provider: a.provider, service: a.service },
      { requestId: "revoked-during-wait", expectedVersion: 1 }))
  } finally { DatabaseSync.prototype.exec = original; DatabaseSync.prototype.prepare = originalPrepare }
  const [exit] = await childExit; assert.equal(exit, 0)
  assert.equal(account.isAccountSessionValid(owner.id, claims.sid), false)
  assert.equal(beginReturned, true); assert.equal(leaseMutationCalls, 0)
  assert.deepEqual(r.reader.readCurrent(a), before)
  assert.deepEqual(r.counters, { root: 0, nativeJoin: 0 }); assert.equal(r.game.players.length, 0)
  observations.push({ case: "AUTH-03", actualSidRevokedAfterObservedBegin: true,
    beginReturned, leaseMutationCalls, leaseUnchanged: true, actualCounters: r.counters, actualPlayers: 0 })
})
