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
import { resolvePhysicalBase } from "./physical-binding"
import { readSidecar, writeSidecar } from "./sidecar"
import { reviewBindingState } from "./review-binding-state"

const repository = fileURLToPath(new URL("../../../../", import.meta.url))
const installed = createRequire(import.meta.url)
async function replays(root: string, token: string, mode = "callbacks") {
  const runs = []
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
      child.stderr?.on("data", (data) => {
        stderr = (stderr + data).slice(-128000)
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
        ? JSON.parse(fs.readFileSync(receipt, "utf8"))
        : { missingReceipt: true }),
    })
  }
  return runs
}
function retain(name: string, data: unknown) {
  if (!process.env.RECOVERY_REVIEW_RECEIPT_ROOT) return
  fs.mkdirSync(process.env.RECOVERY_REVIEW_RECEIPT_ROOT, { recursive: true })
  fs.writeFileSync(
    path.join(process.env.RECOVERY_REVIEW_RECEIPT_ROOT, `${name}.json`),
    JSON.stringify(data, null, 2),
  )
}
function assertFresh(runs: Awaited<ReturnType<typeof replays>>) {
  expect(new Set(runs.map((run) => run.pid)).size).toBe(2)
  for (const run of runs) {
    expect(run.process.timedOut, run.process.stderr).toBe(false)
    expect(run.pid).toBe(run.process.pid)
  }
}
function stageQuiz(root: string, id: string, wrapperFree = false) {
  const relative = resolvePhysicalBase(native.getPath, id)!
  const original = JSON.parse(
    fs.readFileSync(path.join(root, relative), "utf8"),
  )
  const { id: _storageId, ...payload } = original
  const backup = wrapperFree ? payload : original
  const extras = readSidecar(native.getPath, id)!
  const target = { ...original, subject: "Review interrupted target" }
  const targetExtras = {
    ...extras,
    revision: 2,
    baseDigest: computeCanonicalBaseDigest(target),
  }
  createStagedJournal(native.getPath, {
    quizId: id,
    backupBase: backup,
    backupExtras: extras,
    targetBase: target,
    targetExtras,
  })
  native.updateQuizz(id, target)
  writeSidecar(native.getPath, id, targetExtras)
  return { relative, original, extras }
}

describe("R2 independent review native replay regressions", () => {
  let config: string | undefined
  let accounts: string | undefined
  beforeEach(() => {
    config = process.env.CONFIG_PATH
    accounts = process.env.TADAZZ_ACCOUNTS_ENABLED
  })
  afterEach(() => {
    if (config === undefined) delete process.env.CONFIG_PATH
    else process.env.CONFIG_PATH = config
    if (accounts === undefined) delete process.env.TADAZZ_ACCOUNTS_ENABLED
    else process.env.TADAZZ_ACCOUNTS_ENABLED = accounts
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
  it.each([null, 7, false, {}, []])(
    "denies ID-named non-string ID %j before either native callback",
    async (idValue) => {
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
        expect(runs[0].report.status).toBe("recovered")
        expect(runs[1].report.status).toBe("clean")
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
        const staged = stageQuiz(root, descriptor.quizId)
        const journal = native.getPath(
          `extensions/quizzes/.journal/${descriptor.quizId}.journal.json`,
        )
        const entry = JSON.parse(fs.readFileSync(journal, "utf8"))
        entry.backupExtras = null
        fs.writeFileSync(journal, JSON.stringify(entry))
        fs.unlinkSync(
          native.getPath(`extensions/quizzes/${descriptor.quizId}.json`),
        )
        const runs = await replays(root, descriptor.token)
        receipt.runs = runs
        assertFresh(runs)
        expect(runs[0].report.status).toBe("recovered")
        expect(runs[1].report.status).toBe("clean")
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
        expect(runs[0].report.status).toBe("recovered")
        expect(runs[1].report.status).toBe("clean")
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
          let before: ReturnType<typeof reviewBindingState> | undefined
          let activations = 0
          const damage = () => {
            const dir = getMediaDeleteJournalDirectory(native.getPath)
            const journal = path.join(
              dir,
              fs.readdirSync(dir).find((name) => name.endsWith(".json"))!,
            )
            const entry = JSON.parse(fs.readFileSync(journal, "utf8"))
            const binding = entry.shows.find(
              (show: { quizId: string }) => show.quizId === descriptor.quizId,
            ).bindings.sidecar
            const file = native.getPath(binding.preparedBackup.relativePath)
            if (fault.endsWith("missing")) fs.unlinkSync(file)
            else fs.writeFileSync(file, "corrupt private snapshot")
            activations++
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
                if (fault.startsWith("immediate")) damage()
                throw new Error(
                  "Review rollback after both native siblings detached",
                )
              },
            },
          )
          if (fault.startsWith("startup")) damage()
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
})
