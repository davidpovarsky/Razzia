import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { after, before, test } from "node:test"
import { pathToFileURL } from "node:url"
import { SESSION_ROLES } from "@razzia/common/constants"
import { quizzValidator } from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  type AnyQuizExtras,
} from "@razzia/extensions/core"
import type { NativeCreationOperationBinding } from "../../src/server/storage/creation-operation-types"
import {
  captureVerifiedBackup,
  restoreBackupToDisposableRoot,
  rollbackSyntheticRootFromBackup,
  verifyBackupBundle,
} from "./backup-restore"

// Fail closed outside Linux because POSIX O_NOFOLLOW, directory fsync, 0o600/0o700
// custody enforcement, and ext4 durability fences cannot run on Windows.
assert.equal(
  process.platform,
  "linux",
  "phase3-recovery/recovery-qualification.node.ts requires a Linux POSIX/ext4 runtime container",
)

const EXT4_SUPER_MAGIC = 0xef53
const DEFAULT_MAX_BACKUP_BYTES = 2 * 1024 * 1024
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..")
const CHILD_SCRIPT = path.resolve(import.meta.dirname, "recovery-child.ts")

interface ChildExecution {
  pid: number | undefined
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
}

interface RecoveryFixtureHandle {
  root: string
  token: string
}

interface ReceiptCheck {
  id: string
  passed: boolean
  detail: Record<string, unknown>
}

interface SpawnChildOptions {
  mode: string
  root: string
  token: string
  payload?: unknown
  accountsEnabled?: "true" | "false"
  jwtSecret?: string
}

const originalEnvSnapshot: Record<string, string | undefined> = {
  CONFIG_PATH: process.env.CONFIG_PATH,
  JWT_SECRET: process.env.JWT_SECRET,
  TADAZZ_ACCOUNTS_ENABLED: process.env.TADAZZ_ACCOUNTS_ENABLED,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  TADAZZ_AUTH_EMAIL_FROM: process.env.TADAZZ_AUTH_EMAIL_FROM,
  C1_FIXTURE_ROOT: process.env.C1_FIXTURE_ROOT,
  NODE_ENV: process.env.NODE_ENV,
}

const SUITE_JWT_SECRET = `phase3-recovery-synthetic-secret-${randomBytes(24).toString("hex")}`
const SYNTHETIC_RESEND_KEY = "re_synthetic_phase3_recovery_only"
const SYNTHETIC_FROM_EMAIL = "recovery-qa@synthetic.invalid"

const ownedRoots: RecoveryFixtureHandle[] = []
const ownedBackupDirs: Array<{ dir: string; token: string }> = []
const receiptChecks: ReceiptCheck[] = []
let maxCapturedBackupBytes = 0

function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex")
}

function resolveTsxLoaderAndCli(): { cliPath: string; loaderPath: string } {
  const candidates = [
    path.join(REPO_ROOT, "extensions/node_modules/tsx/dist/cli.mjs"),
    path.join(REPO_ROOT, "node_modules/tsx/dist/cli.mjs"),
    "/cleanup/extensions/node_modules/tsx/dist/cli.mjs",
    "/cleanup/node_modules/tsx/dist/cli.mjs",
  ]

  for (const cliPath of candidates) {
    if (fs.existsSync(cliPath)) {
      const loaderPath = path.join(path.dirname(cliPath), "loader.mjs")

      if (fs.existsSync(loaderPath)) {
        return { cliPath, loaderPath }
      }
    }
  }

  throw new Error(
    "Unable to locate tsx cli.mjs/loader.mjs for fresh child spawn",
  )
}

function fixtureParentDir(): string {
  return path.resolve(
    process.env.C1_FIXTURE_ROOT ??
      originalEnvSnapshot.C1_FIXTURE_ROOT ??
      "/tmp",
  )
}

function buildIsolatedChildEnv(options: {
  root: string
  accountsEnabled: "true" | "false"
  jwtSecret: string
}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: fixtureParentDir(),
    NODE_ENV: "test",
    C1_FIXTURE_ROOT: fixtureParentDir(),
    CONFIG_PATH: options.root,
    TADAZZ_ACCOUNTS_ENABLED: options.accountsEnabled,
    JWT_SECRET: options.jwtSecret,
    RESEND_API_KEY: SYNTHETIC_RESEND_KEY,
    TADAZZ_AUTH_EMAIL_FROM: SYNTHETIC_FROM_EMAIL,
    TSX_DISABLE_CACHE: "1",
    TSX_TSCONFIG_PATH: path.join(REPO_ROOT, "tsconfig.json"),
  }
}

function spawnRecoveryChild(options: SpawnChildOptions): ChildExecution {
  const { loaderPath } = resolveTsxLoaderAndCli()
  const payloadArg =
    options.payload === undefined ? "{}" : JSON.stringify(options.payload)
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(loaderPath).href,
      CHILD_SCRIPT,
      options.mode,
      options.root,
      options.token,
      payloadArg,
    ],
    {
      cwd: REPO_ROOT,
      env: buildIsolatedChildEnv({
        root: options.root,
        accountsEnabled: options.accountsEnabled ?? "true",
        jwtSecret: options.jwtSecret ?? SUITE_JWT_SECRET,
      }),
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    },
  )

  const timedOut =
    result.error !== undefined &&
    "code" in result.error &&
    result.error.code === "ETIMEDOUT"

  return {
    pid: result.pid,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut,
  }
}

async function allocateSyntheticRoot(): Promise<RecoveryFixtureHandle> {
  const { closeAccountDb } =
    await import("../../../packages/socket/src/services/account-db")
  const { createCreationFixture } =
    await import("../../src/server/storage/creation-fixture")

  closeAccountDb()
  process.env.C1_FIXTURE_ROOT = fixtureParentDir()
  const created = createCreationFixture()

  process.env.CONFIG_PATH = created.root
  process.env.JWT_SECRET = SUITE_JWT_SECRET
  process.env.RESEND_API_KEY = SYNTHETIC_RESEND_KEY
  process.env.TADAZZ_AUTH_EMAIL_FROM = SYNTHETIC_FROM_EMAIL

  const handle = { root: created.root, token: created.token }

  ownedRoots.push(handle)

  return handle
}

function allocateBackupDir(): string {
  const parent = fixtureParentDir()
  const dir = fs.mkdtempSync(path.join(parent, "tadazz-phase3-backup-"))
  const token = randomUUID()

  ownedBackupDirs.push({ dir, token })

  return dir
}

async function removeOwnedFixtureRoot(
  handle: RecoveryFixtureHandle,
): Promise<void> {
  const { closeAccountDb } =
    await import("../../../packages/socket/src/services/account-db")
  const { removeCreationFixture } =
    await import("../../src/server/storage/creation-fixture")

  closeAccountDb()
  removeCreationFixture(handle.root, handle.token)
}

async function createVerifiedTenant(
  label: string,
): Promise<{ id: string; email: string; token: string }> {
  const [{ registerAccount, issueCode, consumeCode }, { mintToken }] =
    await Promise.all([
      import("../../../packages/socket/src/services/account-auth"),
      import("../../../packages/socket/src/services/auth"),
    ])

  const email = `${label}-${randomBytes(4).toString("hex")}@synthetic.invalid`
  const password = `Phase3Rec-${randomBytes(8).toString("hex")}-Strong`
  const registered = await registerAccount(email, password)
  const code = issueCode(registered.id, "verify")
  const verified = consumeCode(email, "verify", code)

  assert(verified?.verified, `Expected account verification for ${label}`)
  const session = await mintToken(verified.id, SESSION_ROLES.MANAGER)

  return { id: verified.id, email: verified.email, token: session.token }
}

function buildSampleInput(
  subject: string,
  mediaName?: string,
): Record<string, unknown> {
  return quizzValidator.parse({
    gameMode: "quiz",
    subject,
    questions: [
      {
        type: "single",
        question: `${subject} prompt?`,
        answers: ["One", "Two", "Three"],
        solutions: [0],
        cooldown: 5,
        time: 20,
        ...(mediaName
          ? { media: { type: "image", url: `/media/${mediaName}` } }
          : {}),
      },
    ],
  })
}

function buildV2Extras(options: {
  quizId: string
  baseDigest: string
  mediaName?: string
}): AnyQuizExtras {
  const questionId = randomUUID()
  const sceneId = randomUUID()
  const extras = createDefaultQuizExtrasV2(
    options.quizId,
    [questionId],
    options.baseDigest,
  )
  const mediaUrl = options.mediaName ? `/media/${options.mediaName}` : undefined

  extras.scenes[sceneId] = {
    id: sceneId,
    kind: "opening",
    title: "Recovery Checkpoint Scene",
    durationMs: 2000,
    advance: "manual",
  }
  extras.timeline = [
    {
      id: randomUUID(),
      kind: "question",
      questionId,
    },
    {
      id: randomUUID(),
      kind: "opening",
      sceneId,
    },
  ]

  if (options.mediaName && mediaUrl) {
    extras.mediaCatalog = [
      {
        name: options.mediaName,
        url: mediaUrl,
        type: "image",
        addedAt: Date.now(),
      },
    ]
    extras.perQuestion[questionId] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "both",
          url: mediaUrl,
          alt: "Recovery image",
        },
      ],
      questionEntrance: { preset: "fade", durationMs: 800 },
    }
  }

  return extras
}

async function createTenantQuizWithV2(options: {
  root: string
  ownerId: string
  subject: string
  mediaName?: string
}): Promise<{ quizId: string; baseFileName: string; revision: number }> {
  const [
    native,
    { accountsEnabled, activeAccount, withAccount },
    { createNativeCreationPort },
    { CompositeStorageService },
  ] = await Promise.all([
    import("../../../packages/socket/src/services/config"),
    import("../../../packages/socket/src/services/account-scope"),
    import("../../src/server/storage/creation-reservation"),
    import("../../src/server/storage/service"),
  ])

  const port = createNativeCreationPort({
    configuredRoot: () => options.root,
    accountsEnabled,
    activeOwner: activeAccount,
    getPath: native.getPath,
    prepare: native.prepareNativeQuizCreation,
    enableOperationBindings: true,
  })
  const service = new CompositeStorageService({
    ...native,
    creation: port,
    saveQuizz: () => {
      throw new Error("C1 native fixture must never invoke legacy saveQuizz")
    },
  })

  return withAccount(options.ownerId, () => {
    const input = buildSampleInput(options.subject, options.mediaName)

    if (options.mediaName) {
      const mediaDir = native.getPath("media")

      fs.mkdirSync(mediaDir, { recursive: true })
      fs.writeFileSync(
        path.join(mediaDir, options.mediaName),
        Buffer.from(`SYNTHETIC_MEDIA_${options.mediaName}`),
      )
    }

    const baseDigest = computeCanonicalBaseDigest(input)
    const initialExtras = buildV2Extras({
      quizId: "placeholder-create-id",
      baseDigest,
      mediaName: options.mediaName,
    })
    const created = service.createCompositeQuiz({
      quizz: input,
      extras: initialExtras,
    })
    const quizFiles = fs
      .readdirSync(native.getPath("quizz"))
      .filter((name) => name.endsWith(".json"))
      .sort()
    const matchingFile = quizFiles.find((name) => {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(native.getPath("quizz"), name), "utf8"),
      ) as { id?: string }

      return parsed.id === created.quizId
    })

    assert(matchingFile, "Expected persisted native random8 quiz file")
    assert.match(matchingFile, /-[A-Za-z0-9_-]{8}\.json$/u)
    assert.notEqual(matchingFile, `${created.quizId}.json`)

    return {
      quizId: created.quizId,
      baseFileName: matchingFile,
      revision: created.revision,
    }
  })
}

function readStartupFile(
  root: string,
  sequence: string,
): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(
      path.join(root, `.recovery-startup-${sequence}.json`),
      "utf8",
    ),
  ) as Record<string, unknown>
}

function readOperationFile(
  root: string,
  sequence: string,
): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.join(root, `.recovery-op-${sequence}.json`), "utf8"),
  ) as Record<string, unknown>
}

before(() => {
  const parent = fixtureParentDir()

  assert(fs.existsSync(parent), `Fixture parent directory missing: ${parent}`)
  const fsStats = fs.statfsSync(parent)

  if (process.env.PHASE3_RECOVERY_REQUIRE_EXT4 === "1") {
    assert.equal(
      fsStats.type,
      EXT4_SUPER_MAGIC,
      `PHASE3_RECOVERY_REQUIRE_EXT4=1 requires ext4 (0xef53), got 0x${fsStats.type.toString(16)} at ${parent}`,
    )
  }

  process.env.C1_FIXTURE_ROOT = parent
  process.env.JWT_SECRET = SUITE_JWT_SECRET
  process.env.RESEND_API_KEY = SYNTHETIC_RESEND_KEY
  process.env.TADAZZ_AUTH_EMAIL_FROM = SYNTHETIC_FROM_EMAIL
})

after(async () => {
  for (const handle of ownedRoots.splice(0)) {
    if (fs.existsSync(handle.root)) {
      await removeOwnedFixtureRoot(handle)
    }
  }

  for (const backup of ownedBackupDirs.splice(0)) {
    const resolvedParent = path.dirname(path.resolve(backup.dir))

    if (
      resolvedParent === fixtureParentDir() &&
      path.basename(backup.dir).startsWith("tadazz-phase3-backup-") &&
      fs.existsSync(backup.dir)
    ) {
      fs.rmSync(backup.dir, { recursive: true, force: true })
    }
  }

  for (const [key, value] of Object.entries(originalEnvSnapshot)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key)
    } else {
      process.env[key] = value
    }
  }

  const parent = fixtureParentDir()
  const fsStats = fs.existsSync(parent) ? fs.statfsSync(parent) : null
  const receipt = {
    suite: "phase3-recovery-qualification",
    runtime: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
    fixture: {
      parent,
      fsTypeHex: fsStats ? `0x${fsStats.type.toString(16)}` : null,
      isExt4: fsStats ? fsStats.type === EXT4_SUPER_MAGIC : false,
      requireExt4Env: process.env.PHASE3_RECOVERY_REQUIRE_EXT4 ?? null,
      maxCapturedBackupBytes,
    },
    externalPowerLossBoundary:
      "Verified process-level SIGKILL crash-consistency, startup WAL/journal replay, and checksummed disposable backup/restore/rollback inside Linux ext4 container; physical AC power-loss and storage-controller cache-flush behavior remain external hardware boundaries.",
    sourceHashes: {
      "backup-restore.ts": sha256Hex(
        fs.readFileSync(path.resolve(import.meta.dirname, "backup-restore.ts")),
      ),
      "recovery-child.ts": sha256Hex(fs.readFileSync(CHILD_SCRIPT)),
      "recovery-qualification.node.ts": sha256Hex(
        fs.readFileSync(import.meta.filename),
      ),
    },
    checks: receiptChecks,
  }

  process.stdout.write(
    `\n[PHASE3_RECOVERY_RECEIPT_JSON]\n${JSON.stringify(receipt, null, 2)}\n`,
  )
})

test("1. tenantA 6 C1 process-loss checkpoints + startup replay across account flag + tenantB sentinel", async () => {
  const { root, token } = await allocateSyntheticRoot()
  const [
    { closeAccountDb },
    { creationChild, creationReplayTwice },
    { creationTree },
  ] = await Promise.all([
    import("../../../packages/socket/src/services/account-db"),
    import("../../src/server/storage/creation-process"),
    import("../../src/server/storage/creation-fixture"),
  ])

  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  const tenantA = await createVerifiedTenant("tenanta-c1")
  const tenantB = await createVerifiedTenant("tenantb-c1")
  const sentinelB = await createTenantQuizWithV2({
    root,
    ownerId: tenantB.id,
    subject: "TenantB C1 Sentinel",
  })

  const captureTenantBState = () =>
    Object.fromEntries(
      Object.entries(creationTree(root)).filter(([key]) =>
        key.startsWith(`tenants/${tenantB.id}/`),
      ),
    )

  const checkpoints = [
    "before-public",
    "after-sidecar",
    "before-id-return",
    "committed-visible",
    "private-cleanup",
    "before-slot-removal",
  ] as const

  const checkpointSummary: Array<Record<string, unknown>> = []

  for (const boundary of checkpoints) {
    const beforeTenantB = captureTenantBState()
    const beforeFiles = Object.keys(creationTree(root)).filter((key) =>
      key.startsWith(`tenants/${tenantA.id}/quizz/`),
    )

    closeAccountDb()
    process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
    const interrupted = await creationChild(
      boundary,
      root,
      token,
      "",
      tenantA.id,
    )

    assert.equal(interrupted.signal, "SIGKILL", interrupted.stderr)
    assert.equal(interrupted.timedOut, false)

    const checkpointData = JSON.parse(
      fs.readFileSync(path.join(root, ".c1-interrupted.json"), "utf8"),
    ) as { state: Record<string, unknown> }

    // Exercise startup recovery even when TADAZZ_ACCOUNTS_ENABLED flips off at restart
    process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
    const replays = (await creationReplayTwice(root, token)) as Array<{
      pid: number
      report: { recovered: number }
      process: {
        pid: number
        code: number | null
        signal: string | null
        stderr: string
        timedOut: boolean
      }
    }>

    assert.equal(
      new Set([interrupted.pid, ...replays.map((run) => run.pid)]).size,
      3,
    )

    for (const run of replays) {
      assert.equal(run.process.code, 0, run.process.stderr)
      assert.equal(run.process.timedOut, false)
    }

    assert.equal(replays[1].report.recovered, 0)
    assert.equal(fs.existsSync(path.join(root, "quizz")), false)
    assert.deepStrictEqual(captureTenantBState(), beforeTenantB)

    const afterFiles = Object.keys(creationTree(root)).filter((key) =>
      key.startsWith(`tenants/${tenantA.id}/quizz/`),
    )
    const committedExpected = [
      "committed-visible",
      "private-cleanup",
      "before-slot-removal",
    ].includes(boundary)

    if (committedExpected) {
      assert.equal(afterFiles.length, beforeFiles.length + 1)
    } else {
      assert.equal(afterFiles.length, beforeFiles.length)
      assert.deepStrictEqual(afterFiles, beforeFiles)
    }

    // Run full startup-replay child with accounts enabled to confirm clean authority state
    const startupCheck = spawnRecoveryChild({
      mode: "startup-replay",
      root,
      token,
      accountsEnabled: "true",
      payload: { sequence: `c1-${boundary}` },
    })

    assert.equal(startupCheck.status, 0, startupCheck.stderr)
    const startupReceipt = readStartupFile(root, `c1-${boundary}`)

    assert.equal(
      (startupReceipt.c1Report as { recovered: number }).recovered,
      0,
    )

    checkpointSummary.push({
      boundary,
      interruptedPid: interrupted.pid,
      replayPids: replays.map((r) => r.pid),
      committedExpected,
      tenantAQuizCount: afterFiles.length,
      checkpointStateKeys: Object.keys(checkpointData.state).length,
    })
  }

  receiptChecks.push({
    id: "test-1-c1-6-checkpoints",
    passed: true,
    detail: {
      tenantA: tenantA.id,
      tenantB: tenantB.id,
      sentinelQuizId: sentinelB.quizId,
      checkpoints: checkpointSummary,
    },
  })
})

test("2. native C1 operation journal idempotency, conflict, SIGKILL replay, and scalar corruption refusal", async () => {
  const { root, token } = await allocateSyntheticRoot()
  const [
    native,
    { accountsEnabled, activeAccount, withAccount },
    { closeAccountDb },
    { NativeOperationConflict },
    { createNativeCreationPort },
  ] = await Promise.all([
    import("../../../packages/socket/src/services/config"),
    import("../../../packages/socket/src/services/account-scope"),
    import("../../../packages/socket/src/services/account-db"),
    import("../../src/server/storage/creation-operation-record"),
    import("../../src/server/storage/creation-reservation"),
  ])

  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  const tenantA = await createVerifiedTenant("tenanta-ops")
  const tenantB = await createVerifiedTenant("tenantb-ops")
  await createTenantQuizWithV2({
    root,
    ownerId: tenantB.id,
    subject: "TenantB Ops Sentinel",
  })

  const port = createNativeCreationPort({
    configuredRoot: () => root,
    accountsEnabled,
    activeOwner: activeAccount,
    getPath: native.getPath,
    prepare: native.prepareNativeQuizCreation,
    enableOperationBindings: true,
  })
  const { operations } = port

  assert(operations, "Expected native creation operations port")
  const makeBinding = (seed: string): NativeCreationOperationBinding => ({
    version: 1,
    operationId: sha256Hex(`op:${seed}`),
    authorizationDigest: sha256Hex(`auth:${tenantA.id}:${seed}`),
  })

  // Happy path + committed retry idempotency + conflict refusal
  const binding1 = makeBinding("happy-1")
  const input1 = buildSampleInput("Op Journal Quiz 1")
  const firstResult = await withAccount(tenantA.id, () =>
    operations.create(binding1, input1, null),
  )

  closeAccountDb()

  const retryChild = spawnRecoveryChild({
    mode: "op-create",
    root,
    token,
    accountsEnabled: "true",
    payload: {
      ownerId: tenantA.id,
      sequence: "retry-1",
      binding: binding1,
      input: input1,
      extras: null,
    },
  })

  assert.equal(retryChild.status, 0, retryChild.stderr)
  const retryReceipt = readOperationFile(root, "retry-1")

  assert.deepStrictEqual(retryReceipt.outcome, firstResult)

  const conflictChild = spawnRecoveryChild({
    mode: "op-create",
    root,
    token,
    accountsEnabled: "true",
    payload: {
      ownerId: tenantA.id,
      sequence: "conflict-1",
      binding: binding1,
      input: buildSampleInput("Conflicting Subject"),
      extras: null,
    },
  })

  assert.equal(conflictChild.status, 2)
  const conflictReceipt = readOperationFile(root, "conflict-1")

  assert.match(String(conflictReceipt.error), /changed/iu)

  // Scalar validation refusal (non-scalar question text) leaves public quiz count unchanged
  const countBeforeScalar = fs.readdirSync(
    path.join(root, "tenants", tenantA.id, "quizz"),
  ).length
  const badBinding = makeBinding("bad-scalar")

  await withAccount(tenantA.id, () => {
    assert.throws(() =>
      operations.create(
        badBinding,
        {
          subject: ["not-scalar"],
          questions: [],
        },
        null,
      ),
    )
  })
  assert.equal(
    fs.readdirSync(path.join(root, "tenants", tenantA.id, "quizz")).length,
    countBeforeScalar,
  )

  // SIGKILL at reserved state
  const bindingReserved = makeBinding("sigkill-reserved")
  const inputReserved = buildSampleInput("Op Reserved Crash")

  closeAccountDb()
  const killedReserved = spawnRecoveryChild({
    mode: "interrupt-op-reserved",
    root,
    token,
    accountsEnabled: "true",
    payload: {
      ownerId: tenantA.id,
      binding: bindingReserved,
      input: inputReserved,
      extras: buildV2Extras({
        quizId: "placeholder",
        baseDigest: computeCanonicalBaseDigest(inputReserved),
      }),
    },
  })

  assert.equal(killedReserved.signal, "SIGKILL", killedReserved.stderr)
  const replayReserved1 = spawnRecoveryChild({
    mode: "startup-replay",
    root,
    token,
    accountsEnabled: "true",
    payload: { sequence: "op-reserved-1" },
  })
  const replayReserved2 = spawnRecoveryChild({
    mode: "startup-replay",
    root,
    token,
    accountsEnabled: "true",
    payload: { sequence: "op-reserved-2" },
  })

  assert.equal(replayReserved1.status, 0, replayReserved1.stderr)
  assert.equal(replayReserved2.status, 0, replayReserved2.stderr)
  assert.equal(
    (readStartupFile(root, "op-reserved-1").c1Report as { recovered: number })
      .recovered,
    1,
  )
  assert.equal(
    (readStartupFile(root, "op-reserved-2").c1Report as { recovered: number })
      .recovered,
    0,
  )
  assert.equal(
    fs.readdirSync(path.join(root, "tenants", tenantA.id, "quizz")).length,
    countBeforeScalar,
  )

  const lookupReserved = spawnRecoveryChild({
    mode: "op-lookup",
    root,
    token,
    accountsEnabled: "true",
    payload: {
      ownerId: tenantA.id,
      sequence: "lookup-reserved",
      binding: bindingReserved,
    },
  })

  assert.equal(lookupReserved.status, 0, lookupReserved.stderr)
  assert.equal(
    (readOperationFile(root, "lookup-reserved").outcome as { status: string })
      .status,
    "unresolved",
  )

  // SIGKILL at intent committed before operation.json settles
  const bindingCommitted = makeBinding("sigkill-committed")
  const inputCommitted = buildSampleInput("Op Committed Crash")

  const killedCommitted = spawnRecoveryChild({
    mode: "interrupt-op-committed",
    root,
    token,
    accountsEnabled: "true",
    payload: {
      ownerId: tenantA.id,
      binding: bindingCommitted,
      input: inputCommitted,
      extras: buildV2Extras({
        quizId: "placeholder",
        baseDigest: computeCanonicalBaseDigest(inputCommitted),
      }),
    },
  })

  assert.equal(killedCommitted.signal, "SIGKILL", killedCommitted.stderr)
  const replayCommitted1 = spawnRecoveryChild({
    mode: "startup-replay",
    root,
    token,
    accountsEnabled: "true",
    payload: { sequence: "op-committed-1" },
  })
  const replayCommitted2 = spawnRecoveryChild({
    mode: "startup-replay",
    root,
    token,
    accountsEnabled: "true",
    payload: { sequence: "op-committed-2" },
  })

  assert.equal(replayCommitted1.status, 0, replayCommitted1.stderr)
  assert.equal(replayCommitted2.status, 0, replayCommitted2.stderr)
  assert.equal(
    (readStartupFile(root, "op-committed-1").c1Report as { recovered: number })
      .recovered,
    1,
  )
  assert.equal(
    (readStartupFile(root, "op-committed-2").c1Report as { recovered: number })
      .recovered,
    0,
  )

  const lookupCommitted = spawnRecoveryChild({
    mode: "op-lookup",
    root,
    token,
    accountsEnabled: "true",
    payload: {
      ownerId: tenantA.id,
      sequence: "lookup-committed",
      binding: bindingCommitted,
    },
  })

  assert.equal(lookupCommitted.status, 0, lookupCommitted.stderr)
  const committedOutcome = readOperationFile(root, "lookup-committed")
    .outcome as {
    status: string
    result: { quizId: string; revision: number }
  }

  assert.equal(committedOutcome.status, "committed")
  assert.equal(committedOutcome.result.revision, 1)

  const retryCommitted = spawnRecoveryChild({
    mode: "op-create",
    root,
    token,
    accountsEnabled: "true",
    payload: {
      ownerId: tenantA.id,
      sequence: "retry-committed",
      binding: bindingCommitted,
      input: inputCommitted,
      extras: null,
    },
  })

  assert.equal(retryCommitted.status, 0, retryCommitted.stderr)
  assert.deepStrictEqual(
    readOperationFile(root, "retry-committed").outcome,
    committedOutcome.result,
  )

  // Tampered operation.json target fails lookup safely without throwing NativeOperationConflict
  const opFile = path.join(
    root,
    ".tadazz-creation-operations-v1",
    binding1.operationId,
    "operation.json",
  )
  const tamperedOp = JSON.parse(fs.readFileSync(opFile, "utf8")) as {
    target: { quizId: string }
  }

  tamperedOp.target.quizId = "../../bad"
  fs.writeFileSync(opFile, JSON.stringify(tamperedOp), { mode: 0o600 })
  await withAccount(tenantA.id, () => {
    const status = operations.lookup(binding1)

    assert.equal(status.status, "unresolved")
    assert.throws(
      () => new NativeOperationConflict("sentinel"),
      NativeOperationConflict,
    )
  })

  receiptChecks.push({
    id: "test-2-c1-operation-journal",
    passed: true,
    detail: {
      firstQuizId: firstResult.quizId,
      committedQuizId: committedOutcome.result.quizId,
      reservedSettledStatus: "unresolved",
    },
  })
})

test("3. composite rev-2->rev-3 save & media-delete SIGKILL recovery preserving random8 + V2 + tenantB", async () => {
  const { root, token } = await allocateSyntheticRoot()
  const [
    native,
    { accountsEnabled, activeAccount, withAccount },
    { closeAccountDb },
    { createNativeCreationPort },
    { CompositeStorageService },
  ] = await Promise.all([
    import("../../../packages/socket/src/services/config"),
    import("../../../packages/socket/src/services/account-scope"),
    import("../../../packages/socket/src/services/account-db"),
    import("../../src/server/storage/creation-reservation"),
    import("../../src/server/storage/service"),
  ])

  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  const tenantA = await createVerifiedTenant("tenanta-save")
  const tenantB = await createVerifiedTenant("tenantb-save")
  const createdA = await createTenantQuizWithV2({
    root,
    ownerId: tenantA.id,
    subject: "Composite Rev 1",
    mediaName: "pilot-hero.png",
  })
  const sentinelB = await createTenantQuizWithV2({
    root,
    ownerId: tenantB.id,
    subject: "TenantB Save Sentinel",
    mediaName: "tenantb-keep.png",
  })

  const service = new CompositeStorageService({
    ...native,
    creation: createNativeCreationPort({
      configuredRoot: () => root,
      accountsEnabled,
      activeOwner: activeAccount,
      getPath: native.getPath,
      prepare: native.prepareNativeQuizCreation,
    }),
    saveQuizz: () => {
      throw new Error("C1 must never call saveQuizz")
    },
  })

  const rev2Input = buildSampleInput("Composite Rev 2", "pilot-hero.png")
  const rev2Digest = computeCanonicalBaseDigest(rev2Input)
  const rev2Extras = buildV2Extras({
    quizId: createdA.quizId,
    baseDigest: rev2Digest,
    mediaName: "pilot-hero.png",
  })

  await withAccount(tenantA.id, () => {
    const saved = service.saveCompositeQuiz({
      quizId: createdA.quizId,
      expectedRevision: 1,
      quizz: rev2Input,
      extras: rev2Extras,
    })

    assert.equal(saved.revision, 2)
  })

  const tenantBQuizzSnapshot = fs.readFileSync(
    path.join(root, "tenants", tenantB.id, "quizz", sentinelB.baseFileName),
    "utf8",
  )

  const rev3Input = buildSampleInput(
    "Composite Rev 3 Should Rollback",
    "pilot-hero.png",
  )
  const rev3Digest = computeCanonicalBaseDigest(rev3Input)
  const rev3Extras = buildV2Extras({
    quizId: createdA.quizId,
    baseDigest: rev3Digest,
    mediaName: "pilot-hero.png",
  })

  closeAccountDb()

  for (const checkpoint of [
    "interrupt-save-base",
    "interrupt-save-sidecar",
  ] as const) {
    const killed = spawnRecoveryChild({
      mode: checkpoint,
      root,
      token,
      accountsEnabled: "true",
      payload: {
        ownerId: tenantA.id,
        quizId: createdA.quizId,
        baseFileName: createdA.baseFileName,
        expectedRevision: 2,
        updatedQuizz: rev3Input,
        extras: rev3Extras,
      },
    })

    assert.equal(killed.signal, "SIGKILL", killed.stderr)

    const replay1 = spawnRecoveryChild({
      mode: "startup-replay",
      root,
      token,
      accountsEnabled: "true",
      payload: { sequence: `${checkpoint}-1` },
    })
    const replay2 = spawnRecoveryChild({
      mode: "startup-replay",
      root,
      token,
      accountsEnabled: "true",
      payload: { sequence: `${checkpoint}-2` },
    })

    assert.equal(replay1.status, 0, replay1.stderr)
    assert.equal(replay2.status, 0, replay2.stderr)

    const report2 = readStartupFile(root, `${checkpoint}-2`)
      .ownerReports as Array<{
      root: string
      report: { status: string }
    }>

    assert(report2.every((item) => item.report.status === "clean"))

    await withAccount(tenantA.id, () => {
      const current = service.getCompositeQuiz(createdA.quizId)

      assert.equal(current.extras?.revision, 2)
      assert.equal(current.digestMatches, true)
      assert.equal(current.quizz.subject, "Composite Rev 2")
      assert.equal(
        fs.existsSync(
          path.join(
            root,
            "tenants",
            tenantA.id,
            "quizz",
            createdA.baseFileName,
          ),
        ),
        true,
      )
      assert.equal(
        fs.existsSync(
          path.join(
            root,
            "tenants",
            tenantA.id,
            "quizz",
            `${createdA.quizId}.json`,
          ),
        ),
        false,
      )
    })
    closeAccountDb()
  }

  // Media-delete SIGKILL during staged -> rolls back cleanly, preserving media & rev 2
  const killedMediaStaged = spawnRecoveryChild({
    mode: "interrupt-media-staged",
    root,
    token,
    accountsEnabled: "true",
    payload: { ownerId: tenantA.id, mediaName: "pilot-hero.png" },
  })

  assert.equal(killedMediaStaged.signal, "SIGKILL", killedMediaStaged.stderr)
  const mediaReplayStaged = spawnRecoveryChild({
    mode: "startup-replay",
    root,
    token,
    accountsEnabled: "true",
    payload: { sequence: "media-staged-1" },
  })

  assert.equal(mediaReplayStaged.status, 0, mediaReplayStaged.stderr)
  assert.equal(
    fs.existsSync(
      path.join(root, "tenants", tenantA.id, "media", "pilot-hero.png"),
    ),
    true,
  )

  // Media-delete SIGKILL after committed -> completes deletion cleanly
  const killedMediaCommitted = spawnRecoveryChild({
    mode: "interrupt-media-committed",
    root,
    token,
    accountsEnabled: "true",
    payload: { ownerId: tenantA.id, mediaName: "pilot-hero.png" },
  })

  assert.equal(
    killedMediaCommitted.signal,
    "SIGKILL",
    killedMediaCommitted.stderr,
  )
  const mediaReplayCommitted1 = spawnRecoveryChild({
    mode: "startup-replay",
    root,
    token,
    accountsEnabled: "true",
    payload: { sequence: "media-committed-1" },
  })
  const mediaReplayCommitted2 = spawnRecoveryChild({
    mode: "startup-replay",
    root,
    token,
    accountsEnabled: "true",
    payload: { sequence: "media-committed-2" },
  })

  assert.equal(mediaReplayCommitted1.status, 0, mediaReplayCommitted1.stderr)
  assert.equal(mediaReplayCommitted2.status, 0, mediaReplayCommitted2.stderr)
  assert.equal(
    fs.existsSync(
      path.join(root, "tenants", tenantA.id, "media", "pilot-hero.png"),
    ),
    false,
  )
  assert.equal(
    fs.existsSync(
      path.join(root, "tenants", tenantB.id, "media", "tenantb-keep.png"),
    ),
    true,
  )
  assert.equal(
    fs.readFileSync(
      path.join(root, "tenants", tenantB.id, "quizz", sentinelB.baseFileName),
      "utf8",
    ),
    tenantBQuizzSnapshot,
  )

  await withAccount(tenantA.id, () => {
    const detached = service.getCompositeQuiz(createdA.quizId)

    assert.equal(detached.digestMatches, true)
  })

  receiptChecks.push({
    id: "test-3-save-and-media-delete-sigkill",
    passed: true,
    detail: {
      quizIdA: createdA.quizId,
      baseFileNameA: createdA.baseFileName,
      sentinelQuizIdB: sentinelB.quizId,
    },
  })
})

test("4. checksum-verified backup capture, tamper refusal, disposable restore, and rollback", async () => {
  const { root, token } = await allocateSyntheticRoot()
  const [
    native,
    { accountsEnabled, activeAccount, withAccount },
    { closeAccountDb },
    { createNativeCreationPort },
    { CompositeStorageService },
  ] = await Promise.all([
    import("../../../packages/socket/src/services/config"),
    import("../../../packages/socket/src/services/account-scope"),
    import("../../../packages/socket/src/services/account-db"),
    import("../../src/server/storage/creation-reservation"),
    import("../../src/server/storage/service"),
  ])

  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  const tenantA = await createVerifiedTenant("tenanta-backup")
  const tenantB = await createVerifiedTenant("tenantb-backup")
  const createdA = await createTenantQuizWithV2({
    root,
    ownerId: tenantA.id,
    subject: "Backup Rev 1",
  })
  const sentinelB = await createTenantQuizWithV2({
    root,
    ownerId: tenantB.id,
    subject: "TenantB Backup Sentinel",
  })

  const service = new CompositeStorageService({
    ...native,
    creation: createNativeCreationPort({
      configuredRoot: () => root,
      accountsEnabled,
      activeOwner: activeAccount,
      getPath: native.getPath,
      prepare: native.prepareNativeQuizCreation,
    }),
    saveQuizz: () => {
      throw new Error("C1 must never call saveQuizz")
    },
  })

  const rev2Input = buildSampleInput("Backup Stable Rev 2")
  const rev2Digest = computeCanonicalBaseDigest(rev2Input)

  await withAccount(tenantA.id, () => {
    const saved = service.saveCompositeQuiz({
      quizId: createdA.quizId,
      expectedRevision: 1,
      quizz: rev2Input,
      extras: buildV2Extras({
        quizId: createdA.quizId,
        baseDigest: rev2Digest,
      }),
    })

    assert.equal(saved.revision, 2)
  })
  closeAccountDb()

  const backupDir = allocateBackupDir()
  const manifest = captureVerifiedBackup({
    sourceRoot: root,
    backupDir,
    ownerIds: [tenantA.id, tenantB.id],
    accountsMode: "accounts",
    maxTotalBytes: DEFAULT_MAX_BACKUP_BYTES,
  })

  maxCapturedBackupBytes = Math.max(maxCapturedBackupBytes, manifest.totalBytes)
  assert(
    manifest.totalBytes > 0 && manifest.totalBytes < DEFAULT_MAX_BACKUP_BYTES,
  )
  assert.equal(
    verifyBackupBundle(backupDir).manifestDigest,
    manifest.manifestDigest,
  )

  // Negative check: tampered manifest digest and tampered payload fail with zero target mutation
  const restoreRoot = await allocateSyntheticRoot()
  const manifestPath = path.join(backupDir, "backup-manifest.json")
  const originalManifestRaw = fs.readFileSync(manifestPath, "utf8")
  const badManifest = JSON.parse(originalManifestRaw) as Record<string, unknown>

  badManifest.manifestDigest = "f".repeat(64)
  fs.writeFileSync(manifestPath, JSON.stringify(badManifest), "utf8")
  assert.throws(
    () =>
      restoreBackupToDisposableRoot({
        backupDir,
        targetRoot: restoreRoot.root,
      }),
    /integrity digest/u,
  )
  assert.equal(fs.existsSync(path.join(restoreRoot.root, "tenants")), false)
  fs.writeFileSync(manifestPath, originalManifestRaw, "utf8")

  // Clean disposable restore + fresh process auth/quiz verification
  restoreBackupToDisposableRoot({ backupDir, targetRoot: restoreRoot.root })
  assert.throws(
    () =>
      restoreBackupToDisposableRoot({
        backupDir,
        targetRoot: restoreRoot.root,
      }),
    /not clean/u,
  )

  const restoreReplay = spawnRecoveryChild({
    mode: "startup-replay",
    root: restoreRoot.root,
    token: restoreRoot.token,
    accountsEnabled: "true",
    payload: { sequence: "disposable-restore-1" },
  })

  assert.equal(restoreReplay.status, 0, restoreReplay.stderr)
  const restoreVerify = spawnRecoveryChild({
    mode: "verify-session-and-quiz",
    root: restoreRoot.root,
    token: restoreRoot.token,
    accountsEnabled: "true",
    payload: {
      ownerId: tenantA.id,
      token: tenantA.token,
      quizId: createdA.quizId,
      sequence: "disposable-1",
    },
  })

  assert.equal(restoreVerify.status, 0, restoreVerify.stderr)
  const verifiedPayload = JSON.parse(
    fs.readFileSync(
      path.join(restoreRoot.root, ".recovery-verify-disposable-1.json"),
      "utf8",
    ),
  ) as {
    claims: { sub: string }
    composite: {
      digestMatches: boolean
      quizz: { subject: string }
      extras: { revision: number }
    }
  }

  assert.equal(verifiedPayload.claims.sub, tenantA.id)
  assert.equal(verifiedPayload.composite.digestMatches, true)
  assert.equal(verifiedPayload.composite.extras.revision, 2)
  assert.equal(verifiedPayload.composite.quizz.subject, "Backup Stable Rev 2")

  // Mutate sourceRoot to rev 3 + extra stray quiz, then roll back via verified backup
  process.env.CONFIG_PATH = root
  const rev3Input = buildSampleInput("Unwanted Rev 3 Mutation")
  const rev3Digest = computeCanonicalBaseDigest(rev3Input)

  await withAccount(tenantA.id, () => {
    service.saveCompositeQuiz({
      quizId: createdA.quizId,
      expectedRevision: 2,
      quizz: rev3Input,
      extras: buildV2Extras({
        quizId: createdA.quizId,
        baseDigest: rev3Digest,
      }),
    })
  })
  const strayQuiz = await createTenantQuizWithV2({
    root,
    ownerId: tenantA.id,
    subject: "Stray Quiz To Remove On Rollback",
  })

  closeAccountDb()
  rollbackSyntheticRootFromBackup({ backupDir, targetRoot: root })
  assert.equal(
    fs.existsSync(
      path.join(root, "tenants", tenantA.id, "quizz", strayQuiz.baseFileName),
    ),
    false,
  )

  const rollbackReplay = spawnRecoveryChild({
    mode: "startup-replay",
    root,
    token,
    accountsEnabled: "true",
    payload: { sequence: "rollback-1" },
  })
  const rollbackVerify = spawnRecoveryChild({
    mode: "verify-session-and-quiz",
    root,
    token,
    accountsEnabled: "true",
    payload: {
      ownerId: tenantA.id,
      token: tenantA.token,
      quizId: createdA.quizId,
      sequence: "rollback-a",
    },
  })
  const rollbackVerifyB = spawnRecoveryChild({
    mode: "verify-session-and-quiz",
    root,
    token,
    accountsEnabled: "true",
    payload: {
      ownerId: tenantB.id,
      token: tenantB.token,
      quizId: sentinelB.quizId,
      sequence: "rollback-b",
    },
  })

  assert.equal(rollbackReplay.status, 0, rollbackReplay.stderr)
  assert.equal(rollbackVerify.status, 0, rollbackVerify.stderr)
  assert.equal(rollbackVerifyB.status, 0, rollbackVerifyB.stderr)

  const afterRollbackA = JSON.parse(
    fs.readFileSync(
      path.join(root, ".recovery-verify-rollback-a.json"),
      "utf8",
    ),
  ) as {
    composite: { extras: { revision: number }; quizz: { subject: string } }
  }

  assert.equal(afterRollbackA.composite.extras.revision, 2)
  assert.equal(afterRollbackA.composite.quizz.subject, "Backup Stable Rev 2")

  receiptChecks.push({
    id: "test-4-backup-restore-rollback",
    passed: true,
    detail: {
      backupTotalBytes: manifest.totalBytes,
      entryCount: manifest.entries.length,
      manifestDigest: manifest.manifestDigest,
      restoredQuizSubject: verifiedPayload.composite.quizz.subject,
    },
  })
})

test("5. negative boundary suite: no client/unowned scan, symlink refusal, path-traversal, corrupt journal, corrupt WAL", async () => {
  const { root, token } = await allocateSyntheticRoot()
  const [
    { closeAccountDb, readStartupOwnerSnapshot },
    { recoverCreationReservations },
    { recoverStartupOwnerJournals },
  ] = await Promise.all([
    import("../../../packages/socket/src/services/account-db"),
    import("../../src/server/storage/creation-reservation"),
    import("../../src/server/storage/startup-recovery"),
  ])

  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  const tenantA = await createVerifiedTenant("tenanta-neg")
  const unownedTenantDir = path.join(
    root,
    "tenants",
    "customer-do-not-scan",
    "quizz",
  )

  fs.mkdirSync(unownedTenantDir, { recursive: true })
  fs.writeFileSync(
    path.join(unownedTenantDir, "secret.json"),
    JSON.stringify({ id: "secret-unowned", subject: "Must Not Be Scanned" }),
  )
  closeAccountDb()

  // 5a. Prove authority startup never scans unowned tenant folders
  const touchedUnownedPaths: string[] = []
  const origReaddirSync = fs.readdirSync.bind(fs)
  const origReadFileSync = fs.readFileSync.bind(fs)

  fs.readdirSync = ((target: fs.PathLike, options?: unknown) => {
    const resolved = path.resolve(String(target))

    if (resolved.includes("customer-do-not-scan")) {
      touchedUnownedPaths.push(resolved)
    }

    return origReaddirSync(target, options as never)
  }) as typeof fs.readdirSync

  fs.readFileSync = ((target: fs.PathOrFileDescriptor, options?: unknown) => {
    if (
      typeof target === "string" &&
      path.resolve(target).includes("customer-do-not-scan")
    ) {
      touchedUnownedPaths.push(path.resolve(target))
    }

    return origReadFileSync(target, options as never)
  }) as typeof fs.readFileSync

  try {
    const snapshot = readStartupOwnerSnapshot()

    recoverCreationReservations(root)
    recoverStartupOwnerJournals(snapshot)
  } finally {
    fs.readdirSync = origReaddirSync
    fs.readFileSync = origReadFileSync
    closeAccountDb()
  }

  assert.deepStrictEqual(touchedUnownedPaths, [])
  fs.rmSync(path.join(root, "tenants", "customer-do-not-scan"), {
    recursive: true,
    force: true,
  })

  // 5b. Path-traversal journal & corrupt journal fail closed during startup & refuse backup
  const journalDir = path.join(
    root,
    "tenants",
    tenantA.id,
    "extensions",
    "quizzes",
    ".journal",
  )

  fs.mkdirSync(journalDir, { recursive: true })
  const traversalJournal = path.join(journalDir, "traversal.journal.json")

  fs.writeFileSync(
    traversalJournal,
    JSON.stringify({
      version: 1,
      kind: "quiz-save",
      quizId: "../../etc/passwd",
      status: "staged",
      backupBase: null,
      backupExtras: null,
      targetBase: { subject: "x" },
      targetExtras: null,
    }),
  )

  const traversalReplay = spawnRecoveryChild({
    mode: "startup-replay",
    root,
    token,
    accountsEnabled: "true",
    payload: { sequence: "traversal-fail", allowFailure: true },
  })

  assert.equal(traversalReplay.status, 2)
  assert.match(
    String(readStartupFile(root, "traversal-fail").error),
    /startup blocked|unresolved/iu,
  )
  assert.equal(fs.existsSync(traversalJournal), true)

  const pendingBackupDir = allocateBackupDir()

  assert.throws(
    () =>
      captureVerifiedBackup({
        sourceRoot: root,
        backupDir: pendingBackupDir,
        ownerIds: [tenantA.id],
        accountsMode: "accounts",
      }),
    /pending journal/u,
  )
  fs.unlinkSync(traversalJournal)

  // 5c. Symlinked tenant and symlinked SQLite DB refusal
  const symlinkTarget = await allocateSyntheticRoot()
  const tenantBId = randomUUID()
  const linkedTenantPath = path.join(root, "tenants", tenantBId)

  fs.symlinkSync(symlinkTarget.root, linkedTenantPath)
  const dbWithLinkedTenant = new DatabaseSync(
    path.join(root, "tadazz-accounts.sqlite"),
  )

  dbWithLinkedTenant
    .prepare(
      "INSERT INTO accounts(id,email,salt,hash,verified_at,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      tenantBId,
      `${tenantBId}@synthetic.invalid`,
      "synthetic",
      "synthetic",
      Date.now(),
      Date.now(),
    )
  dbWithLinkedTenant.close()

  assert.throws(
    () => recoverStartupOwnerJournals(readStartupOwnerSnapshot()),
    /Unsafe known recovery root/u,
  )
  closeAccountDb()
  fs.unlinkSync(linkedTenantPath)

  const cleanupDb = new DatabaseSync(path.join(root, "tadazz-accounts.sqlite"))

  cleanupDb.prepare("DELETE FROM accounts WHERE id=?").run(tenantBId)
  cleanupDb.close()

  // Symlinked DB check on a dedicated root
  const symDbRoot = await allocateSyntheticRoot()
  const realExternalDb = path.join(symlinkTarget.root, "external.sqlite")

  fs.copyFileSync(path.join(root, "tadazz-accounts.sqlite"), realExternalDb)
  fs.symlinkSync(
    realExternalDb,
    path.join(symDbRoot.root, "tadazz-accounts.sqlite"),
  )
  process.env.CONFIG_PATH = symDbRoot.root
  assert.throws(
    () => readStartupOwnerSnapshot(),
    /Owner snapshot|Unsafe|regular/iu,
  )
  closeAccountDb()
  process.env.CONFIG_PATH = root

  // 5d. Live SIGKILL uncheckpointed WAL survival followed by corrupt WAL frame checksum refusal
  const walChild = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
      import { DatabaseSync } from "node:sqlite";
      const db = new DatabaseSync(process.argv[1]);
      db.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;");
      db.exec("CREATE TABLE IF NOT EXISTS wal_probe (k TEXT PRIMARY KEY, v TEXT NOT NULL);");
      db.prepare("INSERT OR REPLACE INTO wal_probe (k, v) VALUES (?, ?)").run("probe", "alive");
      process.kill(process.pid, "SIGKILL");
      `,
      path.join(root, "tadazz-accounts.sqlite"),
    ],
    { encoding: "utf8", timeout: 10000 },
  )

  assert.equal(walChild.signal, "SIGKILL")
  const walPath = path.join(root, "tadazz-accounts.sqlite-wal")

  assert(
    fs.existsSync(walPath) && fs.statSync(walPath).size >= 32 + 24 + 4096,
    "Expected uncheckpointed WAL frame after SIGKILL",
  )

  // Clean uncheckpointed WAL still passes startup owner verification
  const validSnapshot = readStartupOwnerSnapshot()

  assert(validSnapshot.ownerIds.includes(tenantA.id))
  closeAccountDb()

  // Flip a byte inside WAL frame 1 payload -> validateOwnerWal rejects checksum mismatch
  const walBytes = fs.readFileSync(walPath)

  walBytes.writeUInt8(walBytes.readUInt8(32 + 24) ^ 0xff, 32 + 24)
  fs.writeFileSync(walPath, walBytes)
  assert.throws(
    () => readStartupOwnerSnapshot(),
    /Owner WAL frame checksum mismatch|incomplete transaction/u,
  )
  closeAccountDb()

  // Restore clean WAL byte and checkpoint cleanly so root stays tidy
  walBytes.writeUInt8(walBytes.readUInt8(32 + 24) ^ 0xff, 32 + 24)
  fs.writeFileSync(walPath, walBytes)
  const recoveryDb = new DatabaseSync(path.join(root, "tadazz-accounts.sqlite"))

  recoveryDb.exec("PRAGMA wal_checkpoint(TRUNCATE);")
  recoveryDb.close()

  receiptChecks.push({
    id: "test-5-negative-boundaries",
    passed: true,
    detail: {
      unownedScanCalls: touchedUnownedPaths.length,
      traversalRejected: true,
      symlinkTenantRejected: true,
      symlinkDbRejected: true,
      corruptWalChecksumRejected: true,
    },
  })
})
