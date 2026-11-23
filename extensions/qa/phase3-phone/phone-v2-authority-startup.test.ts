import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../../..")
const tsconfigPath = resolve(repoRoot, "tsconfig.json")
const unmountedFactoryPath = resolve(
  repoRoot,
  "extensions/src/server/phone-lifecycle-v2/auth/unmounted-factory.ts",
)
const nativeAuthorityPath = resolve(
  repoRoot,
  "extensions/src/telephony/pilot-runtime/service-auth-v2/native-account-authority.ts",
)

const honoNodeServerUrl = import.meta.resolve("@hono/node-server")
const honoJwtUrl = import.meta.resolve("hono/jwt")
const socketIoClientUrl = import.meta.resolve("socket.io-client")

function resolveTsxCli(): string {
  const candidates = [
    resolve(repoRoot, "extensions/node_modules/tsx/dist/cli.mjs"),
    "/cleanup/extensions/node_modules/tsx/dist/cli.mjs",
  ]
  const found = candidates.find((candidate) => existsSync(candidate))

  if (!found) {
    throw new Error(`Unable to locate tsx CLI in: ${candidates.join(", ")}`)
  }

  return found
}

interface ChildProbeResult {
  status: number | null
  stdout: string
  stderr: string
  json: Record<string, unknown>
}

function runIsolatedTsxProbe(
  tempDirs: string[],
  source: string,
): ChildProbeResult {
  const dir = mkdtempSync(join(tmpdir(), "phase3-phone-startup-"))
  tempDirs.push(dir)
  const entry = join(dir, "probe.mts")
  writeFileSync(entry, source, "utf8")

  const env: NodeJS.ProcessEnv = { ...process.env }

  for (const key of Object.keys(env)) {
    if (
      /^(?:TADA_|TADAZZ_|JWT_SECRET$|MANAGER_PASSWORD$|CONFIG_PATH$|GAME_SPEED$|NODE_OPTIONS$)/u.test(
        key,
      )
    ) {
      Reflect.deleteProperty(env, key)
    }
  }

  const result = spawnSync(
    process.execPath,
    [resolveTsxCli(), "--tsconfig", tsconfigPath, entry],
    {
      cwd: here,
      env,
      encoding: "utf8",
      timeout: 30_000,
    },
  )

  const lines = result.stdout
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("{"))
  const lastJson = lines.at(-1)

  if (!lastJson) {
    throw new Error(
      `Probe produced no JSON output (exit=${result.status}):\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    )
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: JSON.parse(lastJson) as Record<string, unknown>,
  }
}

describe("Phase 3 Unit C: full-chain fixture authority startup & 20s window contract", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
    }
  })

  it("reproduces owner_authority_denied and frozen gameSpeed=1 when UnmountedPhoneAuthority is statically imported before JWT_SECRET", () => {
    const probe = runIsolatedTsxProbe(
      tempDirs,
      `
import { randomBytes, randomUUID } from "node:crypto"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SESSION_ROLES } from "@razzia/common/constants"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import { UnmountedPhoneAuthority } from ${JSON.stringify(pathToFileURL(unmountedFactoryPath).href)}

const scratchRoot = realpathSync(mkdtempSync(join(tmpdir(), "phase3-red-")))
try {
  const configRoot = join(scratchRoot, "account-config")
  mkdirSync(configRoot, { recursive: true })
  const fixtureJwtSecret = randomBytes(32).toString("hex")
  process.env.CONFIG_PATH = configRoot
  process.env.JWT_SECRET = fixtureJwtSecret
  process.env.GAME_SPEED = "10"
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  process.env.TADAZZ_BILLING_ENABLED = "false"
  process.env.RESEND_API_KEY = "synthetic-never-sent"
  process.env.TADAZZ_AUTH_EMAIL_FROM = "phase3-phone-qa@example.invalid"

  const accountDb = await import("@razzia/socket/services/account-db")
  const account = await import("@razzia/socket/services/account-auth")
  const auth = await import("@razzia/socket/services/auth")
  const { withAccount } = await import("@razzia/socket/services/account-scope")
  const { initConfig } = await import("@razzia/socket/services/config")
  const { createFakeIo } = await import("@razzia/socket/test/fake-io")
  const { default: Game } = await import("@razzia/socket/services/game")
  const { default: Registry } = await import("@razzia/socket/services/registry")
  const { jwtSecret: envJwtSecret, gameSpeed: envGameSpeed } = await import("@razzia/socket/env")

  accountDb.checkAccountConfiguration()
  initConfig()
  const user = await account.registerAccount(randomUUID() + "@example.invalid", randomBytes(24).toString("hex"))
  account.consumeCode(user.email, "verify", account.issueCode(user.id, "verify"))
  const session = await auth.mintToken(user.id, SESSION_ROLES.MANAGER)
  const game = await withAccount(user.id, () => new Game(createFakeIo().io, user.id, createQuizz([createQuestion()])))
  const authorityRoot = realpathSync(mkdtempSync(join(scratchRoot, "authority-")))
  writeFileSync(join(authorityRoot, "PHONE_V2A_SYNTHETIC_ONLY"), "synthetic-v2a-only\\n")
  const lifecycleRoot = realpathSync(mkdtempSync(join(scratchRoot, "lifecycle-")))
  writeFileSync(join(lifecycleRoot, "PHONE_V2A_SYNTHETIC_ONLY"), "synthetic-v2a-only\\n")
  const factory = new UnmountedPhoneAuthority({
    authorityRoot,
    allowedProviders: ["synthetic-provider"],
    nativeAdoption: true,
    gatewayDelivery: true,
    lifecycleRoot: () => lifecycleRoot,
  })
  factory.stageFreshGatewayGame(game)
  Registry.getInstance().addGame(game)

  let errorReason: string | null = null
  let prepareStackFrame = false
  try {
    await factory.initializeAuthority(session.token, game.gameId)
  } catch (err) {
    errorReason = (err as { reason?: string; message?: string }).reason ?? (err as Error).message
    prepareStackFrame = String((err as Error).stack ?? "").includes("NativeAccountAuthority.prepareManager")
  } finally {
    factory.close()
    game.dispose()
    Registry.getInstance().cleanup()
    accountDb.closeAccountDb()
  }

  console.log(JSON.stringify({
    envJwtMatchesFixture: envJwtSecret === fixtureJwtSecret,
    envGameSpeed,
    errorReason,
    prepareStackFrame,
  }))
} finally {
  rmSync(scratchRoot, { recursive: true, force: true })
}
`,
    )

    expect(probe.status).toBe(0)
    expect(probe.json).toEqual({
      envJwtMatchesFixture: false,
      envGameSpeed: 1,
      errorReason: "owner_authority_denied",
      prepareStackFrame: true,
    })
  })

  it("prepares real NativeAccountAuthority and applies GAME_SPEED=10 when imported after env setup while rejecting unverified owners", () => {
    const unmountedUrl = pathToFileURL(unmountedFactoryPath).href
    const nativeAuthUrl = pathToFileURL(nativeAuthorityPath).href
    const probe = runIsolatedTsxProbe(
      tempDirs,
      `
import { randomBytes, randomUUID } from "node:crypto"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SESSION_ROLES } from "@razzia/common/constants"

const scratchRoot = realpathSync(mkdtempSync(join(tmpdir(), "phase3-green-")))
try {
  const configRoot = join(scratchRoot, "account-config")
  mkdirSync(configRoot, { recursive: true })
  const fixtureJwtSecret = randomBytes(32).toString("hex")
  process.env.CONFIG_PATH = configRoot
  process.env.JWT_SECRET = fixtureJwtSecret
  process.env.GAME_SPEED = "10"
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  process.env.TADAZZ_BILLING_ENABLED = "false"
  process.env.RESEND_API_KEY = "synthetic-never-sent"
  process.env.TADAZZ_AUTH_EMAIL_FROM = "phase3-phone-qa@example.invalid"

  const { createQuestion, createQuizz } = await import("@razzia/socket/test/fixtures")
  const { UnmountedPhoneAuthority } = await import(${JSON.stringify(unmountedUrl)})
  const { NativeAccountAuthority } = await import(${JSON.stringify(nativeAuthUrl)})
  const accountDb = await import("@razzia/socket/services/account-db")
  const account = await import("@razzia/socket/services/account-auth")
  const auth = await import("@razzia/socket/services/auth")
  const { withAccount } = await import("@razzia/socket/services/account-scope")
  const { initConfig } = await import("@razzia/socket/services/config")
  const { createFakeIo } = await import("@razzia/socket/test/fake-io")
  const { default: Game } = await import("@razzia/socket/services/game")
  const { default: Registry } = await import("@razzia/socket/services/registry")
  const { jwtSecret: envJwtSecret, gameSpeed: envGameSpeed } = await import("@razzia/socket/env")
  const { SECOND_MS } = await import("@razzia/socket/utils/sleep")
  const { sign } = await import(${JSON.stringify(honoJwtUrl)})

  accountDb.checkAccountConfiguration()
  initConfig()

  const verifiedUser = await account.registerAccount(randomUUID() + "@example.invalid", randomBytes(24).toString("hex"))
  account.consumeCode(verifiedUser.email, "verify", account.issueCode(verifiedUser.id, "verify"))
  const verifiedSession = await auth.mintToken(verifiedUser.id, SESSION_ROLES.MANAGER)

  const unverifiedUser = await account.registerAccount(randomUUID() + "@example.invalid", randomBytes(24).toString("hex"))
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 300
  const unverifiedSid = account.createAccountSession(unverifiedUser.id, exp)
  const unverifiedToken = await sign({ sub: unverifiedUser.id, role: SESSION_ROLES.MANAGER, sid: unverifiedSid, iat, exp }, fixtureJwtSecret, "HS256")

  const game = await withAccount(verifiedUser.id, () => new Game(createFakeIo().io, verifiedUser.id, createQuizz([createQuestion()])))
  const authorityRoot = realpathSync(mkdtempSync(join(scratchRoot, "authority-")))
  writeFileSync(join(authorityRoot, "PHONE_V2A_SYNTHETIC_ONLY"), "synthetic-v2a-only\\n", { mode: 0o600 })
  const lifecycleRoot = realpathSync(mkdtempSync(join(scratchRoot, "lifecycle-")))
  writeFileSync(join(lifecycleRoot, "PHONE_V2A_SYNTHETIC_ONLY"), "synthetic-v2a-only\\n", { mode: 0o600 })
  const factory = new UnmountedPhoneAuthority({
    authorityRoot,
    allowedProviders: ["synthetic-provider"],
    nativeAdoption: true,
    gatewayDelivery: true,
    lifecycleRoot: () => lifecycleRoot,
  })
  factory.stageFreshGatewayGame(game)
  Registry.getInstance().addGame(game)

  const nativeAuthority = new NativeAccountAuthority()
  const prepared = await nativeAuthority.prepareManager(verifiedSession.token, game.gameId)
  const live = nativeAuthority.revalidateManager(prepared)
  nativeAuthority.releaseManager(prepared)

  let unverifiedReason: string | null = null
  try {
    await nativeAuthority.prepareManager(unverifiedToken, game.gameId)
  } catch (err) {
    unverifiedReason = (err as { reason?: string; message?: string }).reason ?? (err as Error).message
  }

  let initOutcome: string | null = null
  try {
    const ready = await factory.initializeAuthority(verifiedSession.token, game.gameId)
    initOutcome = ready.status
  } catch (err) {
    initOutcome = (err as { reason?: string; message?: string }).reason ?? (err as Error).message
  } finally {
    factory.close()
    game.dispose()
    Registry.getInstance().cleanup()
    accountDb.closeAccountDb()
  }

  console.log(JSON.stringify({
    platform: process.platform,
    envJwtMatchesFixture: envJwtSecret === fixtureJwtSecret,
    envGameSpeed,
    secondMs: SECOND_MS,
    preparedKind: prepared.kind,
    liveMatches: live.owner === verifiedUser.id && live.nativeGame === game,
    unverifiedReason,
    initOutcome,
  }))
} finally {
  rmSync(scratchRoot, { recursive: true, force: true })
}
`,
    )

    expect(probe.status).toBe(0)
    expect(probe.json.envJwtMatchesFixture).toBe(true)
    expect(probe.json.envGameSpeed).toBe(10)
    expect(probe.json.secondMs).toBe(100)
    expect(probe.json.preparedKind).toBe("prepared-manager-authority")
    expect(probe.json.liveMatches).toBe(true)
    expect(probe.json.unverifiedReason).toBe("owner_authority_denied")
    expect(probe.json.initOutcome).toBe(
      process.platform === "win32" ? "authority_unavailable" : "ready",
    )
  })

  it("emits question time=20 on STATUS.SELECT_ANSWER over Socket.IO while STATUS.SHOW_QUESTION carries cooldown only", () => {
    const probe = runIsolatedTsxProbe(
      tempDirs,
      `
import { randomBytes, randomUUID } from "node:crypto"
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EVENTS, QUIZZ_MODES, SESSION_ROLES } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"

const scratchRoot = realpathSync(mkdtempSync(join(tmpdir(), "phase3-status-")))
try {
  const configRoot = join(scratchRoot, "account-config")
  mkdirSync(configRoot, { recursive: true })
  const fixtureJwtSecret = randomBytes(32).toString("hex")
  process.env.CONFIG_PATH = configRoot
  process.env.JWT_SECRET = fixtureJwtSecret
  process.env.GAME_SPEED = "10"
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  process.env.TADAZZ_BILLING_ENABLED = "false"
  process.env.RESEND_API_KEY = "synthetic-never-sent"
  process.env.TADAZZ_AUTH_EMAIL_FROM = "phase3-phone-qa@example.invalid"

  const { createQuestion, createQuizz } = await import("@razzia/socket/test/fixtures")
  const accountDb = await import("@razzia/socket/services/account-db")
  const account = await import("@razzia/socket/services/account-auth")
  const auth = await import("@razzia/socket/services/auth")
  const { withAccount } = await import("@razzia/socket/services/account-scope")
  const { initConfig } = await import("@razzia/socket/services/config")
  const { createAdaptorServer } = await import(${JSON.stringify(honoNodeServerUrl)})
  const { app, createSocketServer } = await import("@razzia/socket/app")
  const { default: Game } = await import("@razzia/socket/services/game")
  const { default: Registry } = await import("@razzia/socket/services/registry")
  const { io: connect } = await import(${JSON.stringify(socketIoClientUrl)})

  accountDb.checkAccountConfiguration()
  initConfig()
  const server = createAdaptorServer(app)
  const io = createSocketServer(server)
  await new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", () => done())
  })
  const addr = server.address()
  if (!addr || typeof addr === "string") {
    throw new Error("missing address")
  }

  const user = await account.registerAccount(randomUUID() + "@example.invalid", randomBytes(24).toString("hex"))
  account.consumeCode(user.email, "verify", account.issueCode(user.id, "verify"))
  const session = await auth.mintToken(user.id, SESSION_ROLES.MANAGER)
  const q1 = createQuestion({ answers: ["One", "Two", "Three", "Four"], solutions: [2], time: 20, cooldown: 1 })
  const game = await withAccount(user.id, () => new Game(io, user.id, createQuizz([q1], QUIZZ_MODES.QUIZ)))
  Registry.getInstance().addGame(game)

  const mgr = connect("http://127.0.0.1:" + addr.port, {
    path: "/ws",
    auth: { token: session.token },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  })
  const payloads: Array<{ name: string; data: Record<string, unknown> }> = []
  mgr.on(EVENTS.GAME.STATUS, (status: { name: string; data: Record<string, unknown> }) => {
    payloads.push(status)
  })
  await new Promise<void>((done) => {
    mgr.once("connect", () => done())
  })
  await new Promise<void>((done) => {
    mgr.once(EVENTS.MANAGER.SUCCESS_RECONNECT, () => done())
    mgr.emit(EVENTS.MANAGER.RECONNECT, { gameId: game.gameId })
  })

  const playerId = randomUUID()
  const pSession = await auth.mintToken(playerId, SESSION_ROLES.PLAYER)
  const playerSock = connect("http://127.0.0.1:" + addr.port, {
    path: "/ws",
    auth: { token: pSession.token },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  })
  await new Promise<void>((done) => {
    playerSock.once("connect", () => done())
  })
  const ticket = await auth.mintJoinTicket(playerId, game.gameId, "ProbePlayer")
  await new Promise<void>((done) => {
    playerSock.once(EVENTS.GAME.SUCCESS_JOIN, () => done())
    playerSock.emit(EVENTS.PLAYER.LOGIN, { ticket })
  })

  mgr.emit(EVENTS.MANAGER.START_GAME, { gameId: game.gameId })
  const deadline = Date.now() + 8000
  while (!payloads.some((p) => p.name === STATUS.SELECT_ANSWER) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20))
  }

  const showQuestion = payloads.find((p) => p.name === STATUS.SHOW_QUESTION)
  const selectAnswer = payloads.find((p) => p.name === STATUS.SELECT_ANSWER)

  playerSock.disconnect()
  mgr.disconnect()
  game.dispose()
  Registry.getInstance().cleanup()
  io.disconnectSockets(true)
  await new Promise<void>((done) => {
    void io.close(() => done())
  })
  accountDb.closeAccountDb()

  console.log(JSON.stringify({
    showQuestionHasTime: showQuestion ? "time" in showQuestion.data : null,
    showQuestionCooldown: showQuestion?.data.cooldown,
    selectAnswerTime: selectAnswer?.data.time,
  }))
} finally {
  rmSync(scratchRoot, { recursive: true, force: true })
}
`,
    )

    expect(probe.status).toBe(0)
    expect(probe.json).toEqual({
      showQuestionHasTime: false,
      showQuestionCooldown: 2,
      selectAnswerTime: 20,
    })
  })
})
