import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import type { AnyQuizExtras } from "@razzia/extensions/core"
import type { NativeCreationOperationBinding } from "../../src/server/storage/creation-operation-types"

assert.equal(
  process.platform,
  "linux",
  "phase3-recovery recovery-child.ts requires a Linux POSIX filesystem and SIGKILL runtime",
)

type ChildMode =
  | "startup-replay"
  | "interrupt-save-base"
  | "interrupt-save-sidecar"
  | "interrupt-media-staged"
  | "interrupt-media-committed"
  | "interrupt-op-reserved"
  | "interrupt-op-committed"
  | "op-lookup"
  | "op-create"
  | "verify-session-and-quiz"

interface InterruptPayload {
  ownerId: string
  quizId?: string
  baseFileName?: string
  expectedRevision?: number | null
  updatedQuizz?: Record<string, unknown>
  extras?: AnyQuizExtras
  mediaName?: string
  binding?: NativeCreationOperationBinding
  input?: Record<string, unknown>
}

interface StartupPayload {
  sequence: string
  allowFailure?: boolean
}

interface OpQueryPayload {
  ownerId: string
  sequence: string
  binding: NativeCreationOperationBinding
  input?: Record<string, unknown>
  extras?: AnyQuizExtras | null
}

interface VerifyPayload {
  ownerId: string
  token: string
  quizId: string
  sequence: string
}

const rawReadFileSync = fs.readFileSync.bind(fs)
const rawWriteFileSync = fs.writeFileSync.bind(fs)
const rawRenameSync = fs.renameSync.bind(fs)

function captureSubtreeState(root: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  const walk = (relative: string): void => {
    const full = path.join(root, relative)
    let stat: fs.BigIntStats | null = null

    try {
      stat = fs.lstatSync(full, { bigint: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return
      }

      throw error
    }

    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(full).sort()) {
        walk(`${relative}/${entry}`)
      }

      return
    }

    const bytes = stat.isSymbolicLink()
      ? Buffer.from(fs.readlinkSync(full))
      : rawReadFileSync(full)

    result[relative] = {
      dev: String(stat.dev),
      ino: String(stat.ino),
      mode: Number(stat.mode & 0o777n),
      bytes: bytes.length,
      kind: stat.isSymbolicLink() ? "symlink" : "file",
      text:
        stat.isFile() && bytes.length <= 65536 ? bytes.toString("utf8") : null,
    }
  }

  for (const top of [
    "quizz",
    "extensions",
    "tenants",
    "media",
    ".tadazz-creation-v1",
    ".tadazz-creation-operations-v1",
  ]) {
    walk(top)
  }

  return result
}

function triggerSigkillCheckpoint(root: string, checkpoint: string): never {
  const receipt = {
    checkpoint,
    pid: process.pid,
    mechanism: "SIGKILL",
    state: captureSubtreeState(root),
  }

  rawWriteFileSync(
    path.join(root, ".recovery-checkpoint.json"),
    JSON.stringify(receipt),
  )
  process.kill(process.pid, "SIGKILL")
  process.exit(87)
}

async function runStartupReplay(
  root: string,
  payload: StartupPayload,
): Promise<void> {
  const [
    { checkAccountConfiguration, closeAccountDb, readStartupOwnerSnapshot },
    { resolveConfigRoot },
    { recoverCreationReservations },
    { recoverStartupOwnerJournals },
  ] = await Promise.all([
    import("../../../packages/socket/src/services/account-db"),
    import("../../../packages/socket/src/services/config-scope"),
    import("../../src/server/storage/creation-reservation"),
    import("../../src/server/storage/startup-recovery"),
  ])

  let c1Report: unknown = null
  let ownerReports: unknown = null
  let errorMessage: string | undefined = undefined

  try {
    readStartupOwnerSnapshot()
    c1Report = recoverCreationReservations(resolveConfigRoot())
    checkAccountConfiguration()
    ownerReports = recoverStartupOwnerJournals(readStartupOwnerSnapshot())
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error)
    process.exitCode = 2

    if (!payload.allowFailure) {
      rawWriteFileSync(
        path.join(root, `.recovery-startup-${payload.sequence}.json`),
        JSON.stringify({
          pid: process.pid,
          accountsEnabled: process.env.TADAZZ_ACCOUNTS_ENABLED ?? "false",
          c1Report,
          ownerReports,
          error: errorMessage,
          state: captureSubtreeState(root),
        }),
      )
      throw error
    }
  } finally {
    closeAccountDb()
  }

  rawWriteFileSync(
    path.join(root, `.recovery-startup-${payload.sequence}.json`),
    JSON.stringify({
      pid: process.pid,
      accountsEnabled: process.env.TADAZZ_ACCOUNTS_ENABLED ?? "false",
      c1Report,
      ownerReports,
      error: errorMessage,
      state: captureSubtreeState(root),
    }),
  )
}

async function runInterruptMode(
  mode: ChildMode,
  root: string,
  payload: InterruptPayload,
): Promise<void> {
  const [
    native,
    { accountsEnabled, activeAccount, withAccount },
    { closeAccountDb },
    { createNativeCreationPort },
    { CompositeStorageService },
    { executeMediaDeleteTransaction },
  ] = await Promise.all([
    import("../../../packages/socket/src/services/config"),
    import("../../../packages/socket/src/services/account-scope"),
    import("../../../packages/socket/src/services/account-db"),
    import("../../src/server/storage/creation-reservation"),
    import("../../src/server/storage/service"),
    import("../../src/server/media-library"),
  ])

  const port = createNativeCreationPort({
    configuredRoot: () => root,
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
      throw new Error("C1 child must never call legacy saveQuizz")
    },
  })

  if (mode === "interrupt-save-base" || mode === "interrupt-save-sidecar") {
    const { quizId, baseFileName, updatedQuizz, extras } = payload

    assert(quizId && baseFileName && updatedQuizz && extras)
    const expectedBase = path.resolve(
      root,
      "tenants",
      payload.ownerId,
      "quizz",
      baseFileName,
    )
    const expectedSidecar = path.resolve(
      root,
      "tenants",
      payload.ownerId,
      "extensions",
      "quizzes",
      `${quizId}.json`,
    )

    fs.writeFileSync = (file, data, options) => {
      rawWriteFileSync(file, data, options)
      const resolvedFile = path.resolve(String(file))

      if (mode === "interrupt-save-base" && resolvedFile === expectedBase) {
        triggerSigkillCheckpoint(root, mode)
      }

      if (
        mode === "interrupt-save-sidecar" &&
        resolvedFile === expectedSidecar
      ) {
        triggerSigkillCheckpoint(root, mode)
      }
    }

    try {
      await withAccount(payload.ownerId, () =>
        service.saveCompositeQuiz({
          quizId,
          expectedRevision: payload.expectedRevision ?? null,
          quizz: updatedQuizz,
          extras,
        }),
      )
    } finally {
      closeAccountDb()
    }

    throw new Error(`Expected SIGKILL at checkpoint ${mode}`)
  }

  if (
    mode === "interrupt-media-staged" ||
    mode === "interrupt-media-committed"
  ) {
    const { mediaName } = payload

    assert(mediaName)

    fs.renameSync = (source, destination) => {
      rawRenameSync(source, destination)
      const destString = String(destination)

      if (!destString.endsWith(".media-journal.json")) {
        return
      }

      const entry = JSON.parse(rawReadFileSync(destString, "utf8")) as {
        status?: unknown
      }

      if (mode === "interrupt-media-staged" && entry.status === "staged") {
        triggerSigkillCheckpoint(root, mode)
      }

      if (
        mode === "interrupt-media-committed" &&
        entry.status === "committed"
      ) {
        triggerSigkillCheckpoint(root, mode)
      }
    }

    try {
      await withAccount(payload.ownerId, () =>
        executeMediaDeleteTransaction(native.getPath, mediaName, {
          detach: true,
        }),
      )
    } finally {
      closeAccountDb()
    }

    throw new Error(`Expected SIGKILL at checkpoint ${mode}`)
  }

  if (mode === "interrupt-op-reserved" || mode === "interrupt-op-committed") {
    const { binding, input, extras } = payload
    const { operations } = port

    assert(binding && input && extras && operations)

    fs.renameSync = (source, destination) => {
      rawRenameSync(source, destination)
      const resolvedDest = path.resolve(String(destination))
      const baseName = path.basename(resolvedDest)

      if (
        mode === "interrupt-op-reserved" &&
        resolvedDest.includes(
          `${path.sep}.tadazz-creation-operations-v1${path.sep}`,
        ) &&
        baseName === "operation.json"
      ) {
        const entry = JSON.parse(rawReadFileSync(resolvedDest, "utf8")) as {
          phase?: unknown
        }

        if (entry.phase === "reserved") {
          triggerSigkillCheckpoint(root, mode)
        }
      }

      if (
        mode === "interrupt-op-committed" &&
        resolvedDest.includes(`${path.sep}.tadazz-creation-v1${path.sep}`) &&
        baseName === "intent.json"
      ) {
        const entry = JSON.parse(rawReadFileSync(resolvedDest, "utf8")) as {
          phase?: unknown
        }

        if (entry.phase === "committed") {
          triggerSigkillCheckpoint(root, mode)
        }
      }
    }

    try {
      await withAccount(payload.ownerId, () =>
        operations.create(binding, input, extras),
      )
    } finally {
      closeAccountDb()
    }

    throw new Error(`Expected SIGKILL at checkpoint ${mode}`)
  }

  throw new Error(`Unhandled interrupt mode: ${mode}`)
}

async function runOperationQuery(
  mode: "op-lookup" | "op-create",
  root: string,
  payload: OpQueryPayload,
): Promise<void> {
  const [
    native,
    { accountsEnabled, activeAccount, withAccount },
    { closeAccountDb },
    { createNativeCreationPort },
  ] = await Promise.all([
    import("../../../packages/socket/src/services/config"),
    import("../../../packages/socket/src/services/account-scope"),
    import("../../../packages/socket/src/services/account-db"),
    import("../../src/server/storage/creation-reservation"),
  ])

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

  let outcome: unknown = null
  let errorMessage: string | undefined = undefined

  try {
    outcome = await withAccount(payload.ownerId, () => {
      if (mode === "op-lookup") {
        return operations.lookup(payload.binding)
      }

      const { input } = payload

      assert(input)

      return operations.create(payload.binding, input, payload.extras ?? null)
    })
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error)
    process.exitCode = 2
  } finally {
    closeAccountDb()
  }

  rawWriteFileSync(
    path.join(root, `.recovery-op-${payload.sequence}.json`),
    JSON.stringify({
      pid: process.pid,
      mode,
      outcome,
      error: errorMessage,
      state: captureSubtreeState(root),
    }),
  )
}

async function runVerifySessionAndQuiz(
  root: string,
  payload: VerifyPayload,
): Promise<void> {
  const [
    native,
    { accountsEnabled, activeAccount, withAccount },
    { closeAccountDb },
    { verifyToken },
    { createNativeCreationPort },
    { CompositeStorageService },
  ] = await Promise.all([
    import("../../../packages/socket/src/services/config"),
    import("../../../packages/socket/src/services/account-scope"),
    import("../../../packages/socket/src/services/account-db"),
    import("../../../packages/socket/src/services/auth"),
    import("../../src/server/storage/creation-reservation"),
    import("../../src/server/storage/service"),
  ])

  const service = new CompositeStorageService({
    ...native,
    creation: createNativeCreationPort({
      configuredRoot: () => root,
      accountsEnabled,
      activeOwner: activeAccount,
      getPath: native.getPath,
      prepare: native.prepareNativeQuizCreation,
      enableOperationBindings: true,
    }),
    saveQuizz: () => {
      throw new Error("C1 child must never call legacy saveQuizz")
    },
  })

  try {
    const claims = await verifyToken(payload.token)
    const composite = await withAccount(payload.ownerId, () =>
      service.getCompositeQuiz(payload.quizId),
    )

    rawWriteFileSync(
      path.join(root, `.recovery-verify-${payload.sequence}.json`),
      JSON.stringify({
        pid: process.pid,
        claims,
        composite,
      }),
    )
  } finally {
    closeAccountDb()
  }
}

async function main(): Promise<void> {
  const [modeRaw, inputRoot, token, payloadRaw] = process.argv.slice(2)
  const { assertCreationFixture } =
    await import("../../src/server/storage/creation-fixture")

  assertCreationFixture(inputRoot, token)

  if (path.resolve(process.env.CONFIG_PATH ?? "") !== path.resolve(inputRoot)) {
    throw new Error("Child CONFIG_PATH does not match synthetic root")
  }

  const mode = modeRaw as ChildMode
  const parsed = payloadRaw ? (JSON.parse(payloadRaw) as unknown) : {}

  if (mode === "startup-replay") {
    await runStartupReplay(inputRoot, parsed as StartupPayload)

    return
  }

  if (mode === "op-lookup" || mode === "op-create") {
    await runOperationQuery(mode, inputRoot, parsed as OpQueryPayload)

    return
  }

  if (mode === "verify-session-and-quiz") {
    await runVerifySessionAndQuiz(inputRoot, parsed as VerifyPayload)

    return
  }

  await runInterruptMode(mode, inputRoot, parsed as InterruptPayload)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exitCode =
    process.exitCode && process.exitCode !== 0 ? process.exitCode : 1
})
