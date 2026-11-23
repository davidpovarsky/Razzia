// New independent acceptance fixture. Existing ten-case/crash fixtures stay frozen.
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import type {
  Action,
  OperationInput,
  RegistrationInput,
} from "../../../../../extensions/src/server/phone-lifecycle-v2/contracts"
import type { ServiceAddress } from "../../../../../extensions/src/server/phone-lifecycle-v2/auth/contracts"

assert.equal(process.env.PHONE_REMAINING_RUN, "isolated-actual-authority")
const parent = resolve(process.env.PHONE_REMAINING_FIXTURES ?? "/invalid")
const evidence = resolve(process.env.PHONE_REMAINING_EVIDENCE ?? "/invalid")
assert.ok(parent.startsWith("/fixtures/phone-remaining-"))
assert.ok(evidence.startsWith("/evidence/phone-remaining-"))
mkdirSync(parent, { mode: 0o700, recursive: true })
mkdirSync(evidence, { mode: 0o700, recursive: true })
const configRoot = mkdtempSync(join(parent, "account-config-"))
const fixtureJwtSecret = randomBytes(32).toString("hex")
const secrets = new Set<string>([fixtureJwtSecret])
for (const key of Object.keys(process.env)) {
  if (
    /^(?:TADA_|TADAZZ_|JWT_SECRET$|MANAGER_PASSWORD$|CONFIG_PATH$|GAME_SPEED$)/u.test(
      key,
    )
  )
    delete process.env[key]
}
process.env.CONFIG_PATH = configRoot
process.env.JWT_SECRET = fixtureJwtSecret
process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
process.env.TADAZZ_BILLING_ENABLED = "false"
process.env.RESEND_API_KEY = "synthetic-never-sent"
process.env.TADAZZ_AUTH_EMAIL_FROM = "remaining-authority@example.invalid"
const accountDb = await import("@razzia/socket/services/account-db")
export const account = await import("@razzia/socket/services/account-auth")
export const auth = await import("@razzia/socket/services/auth")
export const { SESSION_ROLES } = await import("@razzia/common/constants")
const { withAccount } = await import("@razzia/socket/services/account-scope")
const { initConfig } = await import("@razzia/socket/services/config")
const { createAdaptorServer } = await import("@hono/node-server")
const { app, createSocketServer } = await import("@razzia/socket/app")
export const { default: Game } = await import("@razzia/socket/services/game")
const { default: Registry } = await import("@razzia/socket/services/registry")
const { createQuestion, createQuizz } =
  await import("@razzia/socket/test/fixtures")
const { sign } = await import("hono/jwt")
export const { UnmountedPhoneAuthority } =
  await import("../../../../../extensions/src/server/phone-lifecycle-v2/auth/unmounted-factory")
const { PrivateAuthorityFiles } =
  await import("../../../../../extensions/src/server/phone-lifecycle-v2/auth/private-authority-files")
const { ReadonlyServiceLeaseReader } =
  await import("../../../../../extensions/src/server/phone-lifecycle-v2/auth/authority-store")
accountDb.checkAccountConfiguration()
initConfig()
const server = createAdaptorServer(app),
  io = createSocketServer(server)
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
export const registry = Registry.getInstance()
const factories: InstanceType<typeof UnmountedPhoneAuthority>[] = []
const observations: unknown[] = []
const actions: Action[] = ["register", "poll", "answer", "hangup"]
export const remember = (value: string) => {
  secrets.add(value)
  return value
}
export const record = (value: unknown) => {
  observations.push(value)
}
export const getAccountDb = accountDb.getAccountDb
export function privateRoot(label: string) {
  const root = mkdtempSync(join(parent, label + "-"))
  writeFileSync(
    join(root, "PHONE_V2A_SYNTHETIC_ONLY"),
    "synthetic-v2a-only\n",
    { mode: 0o600 },
  )
  return root
}
export async function signFixtureClaims(claims: Record<string, unknown>) {
  return remember(await sign(claims, fixtureJwtSecret, "HS256"))
}
export async function owner(verified = true) {
  const password = remember(randomBytes(24).toString("hex"))
  const user = await account.registerAccount(
    randomUUID() + "@example.invalid",
    password,
  )
  assert.equal(await account.authenticate(user.email, password), null)
  if (verified) {
    assert.ok(
      account.consumeCode(
        user.email,
        "verify",
        account.issueCode(user.id, "verify"),
      )?.verified,
    )
    assert.equal(
      (await account.authenticate(user.email, password))?.id,
      user.id,
    )
    const session = await auth.mintToken(user.id, SESSION_ROLES.MANAGER)
    remember(session.token)
    const claims = await auth.verifyToken(session.token)
    assert.ok(claims.sid)
    return { user, password, token: session.token, claims }
  }
  // A genuinely signed hostile claim with a real unverified account/session row.
  // Normal mintToken refuses this account; no verifier/account predicate is mocked.
  await assert.rejects(auth.mintToken(user.id, SESSION_ROLES.MANAGER))
  const iat = Math.floor(Date.now() / 1000),
    exp = iat + 300
  const sid = account.createAccountSession(user.id, exp)
  const claims = { sub: user.id, role: SESSION_ROLES.MANAGER, sid, iat, exp }
  return { user, password, token: await signFixtureClaims(claims), claims }
}
export type Owner = Awaited<ReturnType<typeof owner>>
export async function nativeGame(subject: Owner) {
  return withAccount(
    subject.user.id,
    () => new Game(io, subject.user.id, createQuizz([createQuestion()])),
  )
}
export async function room(subjectArgument?: Owner) {
  const subject = subjectArgument ?? (await owner())
  const game = await nativeGame(subject)
  registry.addGame(game)
  const root = privateRoot("authority"),
    lifecycle = privateRoot("lifecycle")
  const counters = { lifecycleRoots: 0, nativeJoin: 0 }
  const nativeJoin = game.joinOrRebindPhoneCaller.bind(game)
  game.joinOrRebindPhoneCaller = (...args) => {
    counters.nativeJoin++
    return nativeJoin(...args)
  }
  const factory = new UnmountedPhoneAuthority({
    authorityRoot: root,
    allowedProviders: ["synthetic-provider", "synthetic-other"],
    nativeAdoption: true,
    lifecycleRoot: (verifiedOwner, verifiedGame) => {
      assert.equal(verifiedOwner, subject.user.id)
      assert.equal(verifiedGame, game.gameId)
      counters.lifecycleRoots++
      return lifecycle
    },
  })
  factories.push(factory)
  const issue = {
    game: game.gameId,
    provider: "synthetic-provider",
    requestId: randomUUID(),
    expiresAt: Date.now() + 300000,
    initialActions: actions,
  }
  const reader = new ReadonlyServiceLeaseReader(new PrivateAuthorityFiles(root))
  return { subject, game, root, lifecycle, counters, factory, issue, reader }
}
export type Room = Awaited<ReturnType<typeof room>>
export async function provision(r: Room, leaseMs?: number) {
  await r.factory.initializeAuthority(r.subject.token, r.game.gameId)
  if (leaseMs !== undefined) r.issue.expiresAt = Date.now() + leaseMs
  const issued = await r.factory.issue(r.subject.token, r.issue)
  assert.ok(issued.receipt.ok && issued.credential)
  const credential = remember(issued.credential)
  const address: ServiceAddress = {
    owner: r.subject.user.id,
    game: r.game.gameId,
    provider: r.issue.provider,
    service: issued.receipt.service,
    version: 1,
  }
  assert.equal(
    (
      await r.factory.activate(address, credential, {
        requestId: randomUUID(),
        expectedVersion: 1,
      })
    ).receipt.state,
    "ACTIVE",
  )
  return { address, credential }
}
export function registration(): RegistrationInput {
  const id = randomUUID()
  return {
    requestId: id,
    providerReference: id,
    expectedPredecessor: 0,
    phone: "+447700900861",
    capability: remember(randomBytes(32).toString("hex")),
  }
}
export async function participant(r: Room) {
  const p = await provision(r),
    input = registration()
  const joined = await r.factory.register(p.address, p.credential, input)
  assert.ok(
    joined.ok &&
      joined.registrationId &&
      joined.generation &&
      joined.rosterPlayerId &&
      joined.clientId,
  )
  const operation: OperationInput = {
    requestId: input.requestId,
    registrationId: joined.registrationId,
    generation: joined.generation,
    capability: input.capability,
    operationId: randomUUID(),
    action: "poll",
  }
  const receipt = await r.factory.operate(p.address, p.credential, operation)
  assert.equal(receipt.ok, true)
  return { ...p, input, joined, operation, receipt }
}
export const authorityPath = (r: Room) =>
  join(r.root, "phone-service-authority.sqlite")
export const snapshot = (r: Room) =>
  JSON.stringify({
    players: r.game.players,
    roster: r.game.getHostPresenceSnapshot(),
  })
export function trackFactory(
  factory: InstanceType<typeof UnmountedPhoneAuthority>,
) {
  factories.push(factory)
}
export async function close() {
  for (const factory of factories) factory.close()
  for (const game of registry.getAllGames()) registry.removeGame(game.gameId)
  registry.cleanup()
  io.disconnectSockets(true)
  await new Promise<void>((done) => io.close(() => done()))
  accountDb.closeAccountDb()
  const report =
    JSON.stringify(
      {
        scope:
          "new actual unmounted authority acceptance; no provider/PSTN or production mount",
        observations,
      },
      null,
      2,
    ) + "\n"
  assert.equal(
    [...secrets].some((secret) => report.includes(secret)),
    false,
  )
  const scan = (root: string): string[] =>
    readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? scan(join(root, entry.name))
        : entry.isFile()
          ? [join(root, entry.name)]
          : [],
    )
  for (const file of [...scan(parent), ...scan(evidence)]) {
    const bytes = readFileSync(file)
    assert.equal(
      [...secrets].some((secret) => bytes.includes(Buffer.from(secret))),
      false,
      "Raw credential outside ephemeral request memory",
    )
  }
  writeFileSync(join(evidence, "remaining-observations.json"), report)
}
export function rootUnchanged(r: Room, before: string[]) {
  assert.deepEqual(readdirSync(r.root), before)
  assert.equal(existsSync(authorityPath(r)), false)
  assert.deepEqual(r.counters, { lifecycleRoots: 0, nativeJoin: 0 })
  assert.equal(r.game.players.length, 0)
}
