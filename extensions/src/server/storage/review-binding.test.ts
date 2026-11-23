import fs from "node:fs"
import path from "node:path"
import { fork } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as native from "../../../../packages/socket/src/services/config"
import { computeCanonicalBaseDigest } from "../../core/index"
import {
  executeMediaDeleteTransaction,
  getMediaDeleteJournalDirectory,
} from "../media-library"
import { createStagedJournal } from "./journal"
import {
  makeNativeFixture,
  removeNativeFixture,
  richNativeExtras,
  nativeInput,
  NATIVE_MEDIA,
} from "./native-binding-fixture"
import { resolvePhysicalBase, restorePhysicalBinding } from "./physical-binding"
import { readSidecar, writeSidecar } from "./sidecar"
import { reviewBindingState } from "./review-binding-state"

type ReviewPhysicalBinding = Parameters<typeof restorePhysicalBinding>[1]
interface ReviewShowObservation extends Record<string, unknown> {
  quizId: string
  bindings: Record<string, unknown>
}
interface ReviewJournalObservation extends Record<string, unknown> {
  shows: ReviewShowObservation[]
}
interface ReviewRecoveryRun extends Record<string, unknown> {
  pid: number
  writes: number
  deletes: number
  state: ReturnType<typeof reviewBindingState>
  process: {
    pid?: number
    code: number | null
    signal: string | null
    timedOut: boolean
    stderr: string
  }
  report?: { status: "clean" | "recovered" | "failed" }
  error?: string
}
function isReviewRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function requireReviewRecord(value: unknown): Record<string, unknown> {
  if (!isReviewRecord(value)) {
    throw new Error("Expected raw review receipt object")
  }

  return value
}
function isReviewShow(value: unknown): value is ReviewShowObservation {
  return (
    isReviewRecord(value) &&
    typeof value.quizId === "string" &&
    isReviewRecord(value.bindings)
  )
}
function requireReviewShow(value: unknown): ReviewShowObservation {
  if (!isReviewShow(value)) {
    throw new Error("Expected recorded review journal show")
  }

  return value
}
function isReviewJournal(value: unknown): value is ReviewJournalObservation {
  return (
    isReviewRecord(value) &&
    Array.isArray(value.shows) &&
    value.shows.every(isReviewShow)
  )
}
function requireReviewJournal(value: unknown): ReviewJournalObservation {
  if (!isReviewJournal(value)) {
    throw new Error("Expected raw review journal shows")
  }

  return value
}
function isReviewImage(
  value: unknown,
): value is ReviewPhysicalBinding["targets"][number] {
  return (
    isReviewRecord(value) &&
    typeof value.raw === "string" &&
    typeof value.sha256 === "string" &&
    typeof value.length === "number"
  )
}
function isReviewOriginal(
  value: unknown,
): value is NonNullable<ReviewPhysicalBinding["original"]> {
  return (
    isReviewRecord(value) &&
    isReviewImage(value) &&
    typeof value.dev === "string" &&
    typeof value.ino === "string" &&
    typeof value.mode === "number"
  )
}
function isReviewPrepared(
  value: unknown,
): value is ReviewPhysicalBinding["preparedTarget"] {
  return (
    isReviewRecord(value) &&
    isReviewOriginal(value) &&
    typeof value.relativePath === "string"
  )
}
function isReviewBinding(value: unknown): value is ReviewPhysicalBinding {
  return (
    isReviewRecord(value) &&
    value.version === 1 &&
    typeof value.root === "string" &&
    typeof value.relativePath === "string" &&
    typeof value.quizId === "string" &&
    (value.kind === "base" || value.kind === "sidecar") &&
    (value.original === null || isReviewOriginal(value.original)) &&
    Array.isArray(value.targets) &&
    value.targets.every(isReviewImage) &&
    isReviewPrepared(value.preparedTarget) &&
    (value.preparedBackup === null || isReviewPrepared(value.preparedBackup))
  )
}
function requireReviewBinding(value: unknown): ReviewPhysicalBinding {
  if (!isReviewBinding(value)) {
    throw new Error("Expected raw physical binding fields")
  }

  return value
}
function requireReviewBackup(
  value: ReviewPhysicalBinding["preparedBackup"],
): NonNullable<ReviewPhysicalBinding["preparedBackup"]> {
  if (value === null) {
    throw new Error("Expected recorded private backup")
  }

  return value
}
function isReviewRun(value: unknown): value is ReviewRecoveryRun {
  if (!isReviewRecord(value) || !isReviewRecord(value.process)) {
    return false
  }

  return (
    value.missingReceipt !== true &&
    typeof value.pid === "number" &&
    typeof value.writes === "number" &&
    typeof value.deletes === "number" &&
    isReviewRecord(value.state) &&
    (value.process.pid === undefined ||
      typeof value.process.pid === "number") &&
    (value.process.code === null || typeof value.process.code === "number") &&
    (value.process.signal === null ||
      typeof value.process.signal === "string") &&
    typeof value.process.timedOut === "boolean" &&
    typeof value.process.stderr === "string" &&
    (value.error === undefined || typeof value.error === "string") &&
    (value.report === undefined ||
      (isReviewRecord(value.report) &&
        (value.report.status === "clean" ||
          value.report.status === "recovered" ||
          value.report.status === "failed")))
  )
}
function assertReviewRuns(
  value: unknown,
): asserts value is [ReviewRecoveryRun, ReviewRecoveryRun] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !isReviewRun(value[0]) ||
    !isReviewRun(value[1])
  ) {
    throw new Error("Expected both raw review child receipts")
  }
}
function reviewRecoveryReport(run: ReviewRecoveryRun) {
  if (run.report === undefined) {
    throw new Error("Expected review recovery report")
  }

  return run.report
}

const repository = fileURLToPath(new URL("../../../../", import.meta.url))
const installed = createRequire(import.meta.url)
async function replays(root: string, token: string, mode = "callbacks") {
  const runs: unknown[] = []
  for (const sequence of ["1", "2"]) {
    const result = await new Promise<{
      pid?: number
      code: number | null
      signal: NodeJS.Signals | null
      timedOut: boolean
      stderr: string
    }>((resolve, reject) => {
      const child = fork(
        fileURLToPath(new URL("./review-binding-child.ts", import.meta.url)),
        [root, token, sequence, mode],
        {
          cwd: repository,
          execArgv: ["--import", pathToFileURL(installed.resolve("tsx")).href],
          env: {
            ...process.env,
            CONFIG_PATH: root,
            TADAZZ_ACCOUNTS_ENABLED: "false",
            TSX_DISABLE_CACHE: "1",
            TSX_TSCONFIG_PATH: path.join(repository, "tsconfig.json"),
          },
          stdio: ["ignore", "ignore", "pipe", "ipc"],
        },
      )
      let timedOut = false
      let stderr = ""
      const timer = setTimeout(() => {
        timedOut = true
        child.kill("SIGKILL")
      }, 20000)
      child.stderr?.on("data", (data: Buffer | string) => {
        stderr = (
          stderr + (typeof data === "string" ? data : data.toString("utf8"))
        ).slice(-128000)
      })
      child.once("error", reject)
      child.once("close", (code, signal) => {
        clearTimeout(timer)
        resolve({ pid: child.pid, code, signal, timedOut, stderr })
      })
    })
    const receipt = path.join(root, `.review-recovery-${sequence}.json`)
    runs.push({
      process: result,
      ...(fs.existsSync(receipt)
        ? requireReviewRecord(JSON.parse(fs.readFileSync(receipt, "utf8")))
        : { missingReceipt: true }),
    })
  }

  return runs
}
function retain(name: string, data: unknown) {
  if (!process.env.RECOVERY_REVIEW_RECEIPT_ROOT) {
    return
  }

  fs.mkdirSync(process.env.RECOVERY_REVIEW_RECEIPT_ROOT, { recursive: true })
  fs.writeFileSync(
    path.join(process.env.RECOVERY_REVIEW_RECEIPT_ROOT, `${name}.json`),
    JSON.stringify(data, null, 2),
  )
}
function assertFresh(
  runs: Awaited<ReturnType<typeof replays>>,
): asserts runs is [ReviewRecoveryRun, ReviewRecoveryRun] {
  assertReviewRuns(runs)

  expect(new Set(runs.map((run) => run.pid)).size).toBe(2)
  for (const run of runs) {
    expect(run.process.timedOut, run.process.stderr).toBe(false)
    expect(run.pid).toBe(run.process.pid)
  }
}
function stageQuiz(
  root: string,
  id: string,
  wrapperFree = false,
  firstSidecar = false,
) {
  const relative = resolvePhysicalBase(native.getPath, id)!
  const original = requireReviewRecord(
    JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")),
  )
  const { id: _storageId, ...payload } = original
  const backup = wrapperFree ? payload : original
  const extras = readSidecar(native.getPath, id)!

  if (firstSidecar) {
    fs.unlinkSync(native.getPath(`extensions/quizzes/${id}.json`))
  }

  const target = { ...original, subject: "Review interrupted target" }
  const targetExtras = {
    ...extras,
    revision: 2,
    baseDigest: computeCanonicalBaseDigest(target),
  }
  createStagedJournal(native.getPath, {
    quizId: id,
    backupBase: backup,
    backupExtras: firstSidecar ? null : extras,
    targetBase: target,
    targetExtras,
  })
  native.updateQuizz(id, target)

  if (!firstSidecar) {
    writeSidecar(native.getPath, id, targetExtras)
  }

  return { relative, original, extras }
}

describe("R2 independent review native replay regressions", () => {
  let config: string | undefined = undefined

  let accounts: string | undefined = undefined
  beforeEach(() => {
    config = process.env.CONFIG_PATH
    accounts = process.env.TADAZZ_ACCOUNTS_ENABLED
  })
  afterEach(() => {
    if (config === undefined) {
      delete process.env.CONFIG_PATH
    } else {
      process.env.CONFIG_PATH = config
    }

    if (accounts === undefined) {
      delete process.env.TADAZZ_ACCOUNTS_ENABLED
    } else {
      process.env.TADAZZ_ACCOUNTS_ENABLED = accounts
    }
  })
  async function fixtureCase(
    name: string,
    operation: (
      fixture: ReturnType<typeof makeNativeFixture>,
      receipt: Record<string, unknown>,
    ) => Promise<void>,
  ) {
    const fixture = makeNativeFixture("quiz-base")
    const receipt: Record<string, unknown> = { name, state: "STARTED" }

    try {
      await operation(fixture, receipt)
      receipt.state = "PASS"
    } catch (error) {
      receipt.state = "FAIL"
      receipt.error = error instanceof Error ? error.stack : String(error)
      throw error
    } finally {
      retain(name, receipt)
      removeNativeFixture(fixture.root, fixture.descriptor.token)
    }
  }
  it("denies an absent sidecar when backup and target are non-null", async () => {
    await fixtureCase(
      "missing-nonnull-sidecar",
      async ({ root, descriptor }, receipt) => {
        stageQuiz(root, descriptor.quizId)
        fs.unlinkSync(
          native.getPath(`extensions/quizzes/${descriptor.quizId}.json`),
        )
        const before = reviewBindingState(root)
        const runs = await replays(root, descriptor.token)
        Object.assign(receipt, { before, runs })
        assertFresh(runs)
        for (const run of runs) {
          expect(run.process.code).toBe(2)
          expect(run.writes).toBe(0)
          expect(run.deletes).toBe(0)
          expect(run.state).toStrictEqual(before)
        }
      },
    )
  }, 70000)
  it.each(
    [null, 7, false, {}, []].map((idValue) => ({
      idValue,
      label: JSON.stringify(idValue),
    })),
  )(
    "denies ID-named non-string ID $label before either native callback",
    async ({ idValue }) => {
      await fixtureCase(
        `ambiguous-${JSON.stringify(idValue)}`,
        async ({ root, descriptor }, receipt) => {
          stageQuiz(root, descriptor.quizId)
          fs.writeFileSync(
            native.getPath(`quizz/${descriptor.quizId}.json`),
            JSON.stringify({
              ...nativeInput("Nonstring fallback sentinel"),
              id: idValue,
            }),
          )
          const before = reviewBindingState(root)
          const runs = await replays(root, descriptor.token)
          Object.assign(receipt, { before, runs })
          assertFresh(runs)
          for (const run of runs) {
            expect(run.process.code).toBe(2)
            expect(run.writes).toBe(0)
            expect(run.deletes).toBe(0)
            expect(run.state).toStrictEqual(before)
          }
        },
      )
    },
    70000,
  )
  it("preserves a string foreign ID while restoring the native random-basename record", async () => {
    await fixtureCase(
      "string-foreign-positive",
      async ({ root, descriptor }, receipt) => {
        const staged = stageQuiz(root, descriptor.quizId)
        const sentinel = native.getPath(`quizz/${descriptor.quizId}.json`)
        fs.writeFileSync(
          sentinel,
          JSON.stringify({
            ...nativeInput("String foreign sentinel"),
            id: "foreign-review",
          }),
        )
        const before = reviewBindingState(root)
        const runs = await replays(root, descriptor.token)
        Object.assign(receipt, { before, runs })
        assertFresh(runs)
        expect(reviewRecoveryReport(runs[0]).status).toBe("recovered")
        expect(reviewRecoveryReport(runs[1]).status).toBe("clean")
        for (const run of runs) {
          expect(run.process.code).toBe(0)
          expect(run.state[`quizz/${descriptor.quizId}.json`]).toStrictEqual(
            before[`quizz/${descriptor.quizId}.json`],
          )
        }
        expect(
          JSON.parse(fs.readFileSync(native.getPath(staged.relative), "utf8")),
        ).toStrictEqual(staged.original)
      },
    )
  }, 70000)
  it("allows absent first-sidecar state explicitly recorded as a null backup", async () => {
    await fixtureCase(
      "null-sidecar-backup-positive",
      async ({ root, descriptor }, receipt) => {
        const staged = stageQuiz(root, descriptor.quizId, false, true)
        const runs = await replays(root, descriptor.token)
        receipt.runs = runs
        assertFresh(runs)
        expect(reviewRecoveryReport(runs[0]).status).toBe("recovered")
        expect(reviewRecoveryReport(runs[1]).status).toBe("clean")
        expect(
          JSON.parse(fs.readFileSync(native.getPath(staged.relative), "utf8")),
        ).toStrictEqual(staged.original)
        expect(
          fs.existsSync(
            native.getPath(`extensions/quizzes/${descriptor.quizId}.json`),
          ),
        ).toBe(false)
      },
    )
  }, 70000)
  it("preserves native storage ID for wrapper-free backup through the default overload", async () => {
    await fixtureCase(
      "default-wrapper-positive",
      async ({ root, descriptor }, receipt) => {
        const staged = stageQuiz(root, descriptor.quizId, true)
        const runs = await replays(root, descriptor.token, "default")
        Object.assign(receipt, { staged, runs })
        assertFresh(runs)
        expect(reviewRecoveryReport(runs[0]).status).toBe("recovered")
        expect(reviewRecoveryReport(runs[1]).status).toBe("clean")
        expect(resolvePhysicalBase(native.getPath, descriptor.quizId)).toBe(
          staged.relative,
        )
        expect(
          JSON.parse(fs.readFileSync(native.getPath(staged.relative), "utf8")),
        ).toStrictEqual(staged.original)
      },
    )
  }, 70000)
  it.each([
    "immediate-missing",
    "immediate-corrupt",
    "startup-missing",
    "startup-corrupt",
  ])(
    "preflights all needed private images before %s Media rollback",
    async (fault) => {
      await fixtureCase(
        `private-${fault}`,
        async ({ root, descriptor }, receipt) => {
          writeSidecar(
            native.getPath,
            descriptor.quizId,
            richNativeExtras(descriptor.quizId, nativeInput(), true),
          )
          let before: ReturnType<typeof reviewBindingState> | undefined =
            undefined

          let activations = 0
          const damage = () => {
            const dir = getMediaDeleteJournalDirectory(native.getPath)
            const journal = path.join(
              dir,
              fs.readdirSync(dir).find((name) => name.endsWith(".json"))!,
            )
            const entry = requireReviewJournal(
              JSON.parse(fs.readFileSync(journal, "utf8")),
            )

            const binding = requireReviewBinding(
              requireReviewShow(
                entry.shows.find(
                  (show: { quizId: string }) =>
                    show.quizId === descriptor.quizId,
                ),
              ).bindings.sidecar,
            )

            const file = native.getPath(
              requireReviewBackup(binding.preparedBackup).relativePath,
            )

            if (fault.endsWith("missing")) {
              fs.unlinkSync(file)
            } else {
              fs.writeFileSync(file, "corrupt private snapshot")
            }

            activations += 1

            before = reviewBindingState(root)
          }
          const result = executeMediaDeleteTransaction(
            native.getPath,
            NATIVE_MEDIA,
            {
              detach: true,
              faultInjection: fault.startsWith("startup")
                ? { failDuringRollback: true }
                : undefined,
              deleteMediaFn: () => {
                if (fault.startsWith("immediate")) {
                  damage()
                }

                throw new Error(
                  "Review rollback after both native siblings detached",
                )
              },
            },
          )

          if (fault.startsWith("startup")) {
            damage()
          }

          const immediateAfter = reviewBindingState(root)
          const runs = await replays(root, descriptor.token)
          Object.assign(receipt, {
            activations,
            result,
            before,
            immediateAfter,
            runs,
          })
          assertFresh(runs)
          expect(activations).toBe(1)
          expect(result.allowed).toBe(false)
          expect(immediateAfter).toStrictEqual(before)
          for (const run of runs) {
            expect(run.process.code).toBe(2)
            expect(run.state).toStrictEqual(before)
          }
        },
      )
    },
    70000,
  )
  it("retries an already restored sibling without its consumed private backup", async () => {
    await fixtureCase(
      "already-restored-positive",
      async ({ root, descriptor }, receipt) => {
        writeSidecar(
          native.getPath,
          descriptor.quizId,
          richNativeExtras(descriptor.quizId, nativeInput(), true),
        )
        const originalBase = fs.readFileSync(
          native.getPath(`quizz/${descriptor.baseName}`),
          "utf8",
        )
        const originalSidecar = fs.readFileSync(
          native.getPath(`extensions/quizzes/${descriptor.quizId}.json`),
          "utf8",
        )
        executeMediaDeleteTransaction(native.getPath, NATIVE_MEDIA, {
          detach: true,
          faultInjection: { failDuringRollback: true },
          deleteMediaFn: () => {
            throw new Error("Pause actual rollback before public restoration")
          },
        })
        const dir = getMediaDeleteJournalDirectory(native.getPath)
        const journal = path.join(
          dir,
          fs.readdirSync(dir).find((name) => name.endsWith(".json"))!,
        )
        const entry = requireReviewJournal(
          JSON.parse(fs.readFileSync(journal, "utf8")),
        )

        const binding = requireReviewBinding(
          requireReviewShow(
            entry.shows.find(
              (show: { quizId: string }) => show.quizId === descriptor.quizId,
            ),
          ).bindings.base,
        )

        restorePhysicalBinding(native.getPath, binding)
        expect(
          fs.existsSync(
            native.getPath(
              requireReviewBackup(binding.preparedBackup).relativePath,
            ),
          ),
        ).toBe(false)
        const runs = await replays(root, descriptor.token)
        receipt.runs = runs
        assertFresh(runs)
        expect(reviewRecoveryReport(runs[0]).status).toBe("recovered")
        expect(reviewRecoveryReport(runs[1]).status).toBe("clean")
        expect(
          fs.readFileSync(
            native.getPath(`quizz/${descriptor.baseName}`),
            "utf8",
          ),
        ).toBe(originalBase)
        expect(
          fs.readFileSync(
            native.getPath(`extensions/quizzes/${descriptor.quizId}.json`),
            "utf8",
          ),
        ).toBe(originalSidecar)
      },
    )
  }, 70000)
})
