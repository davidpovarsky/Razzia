import fs from "node:fs"
import path from "node:path"
import { fork } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as native from "../../../../packages/socket/src/services/config"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { computeCanonicalBaseDigest } from "../../core/index"
import { CompositeStorageService } from "./service"
import {
  byteHash,
  makeNativeFixture,
  nativeFixtureState,
  nativeInput,
  knownNativePath,
  richNativeExtras,
  removeNativeFixture,
  type NativeBindingScenario,
} from "./native-binding-fixture"

const repository = fileURLToPath(new URL("../../../../", import.meta.url))
const installed = createRequire(import.meta.url)
const childPath = fileURLToPath(
  new URL("./native-binding-child.ts", import.meta.url),
)
const cases: NativeBindingScenario[] = [
  "media",
  "quiz-base",
  "quiz-sidecar",
  "media-foreign",
  "quiz-foreign",
  "media-sidecar-only",
]

function child(
  mode: "interrupt" | "recover",
  root: string,
  token: string,
  sequence = "",
) {
  return new Promise<{
    pid?: number
    code: number | null
    signal: NodeJS.Signals | null
    timedOut: boolean
    stdout: string
    stderr: string
  }>((resolve, reject) => {
    const processChild = fork(childPath, [mode, root, token, sequence], {
      cwd: repository,
      execArgv: ["--import", pathToFileURL(installed.resolve("tsx")).href],
      env: {
        ...process.env,
        CONFIG_PATH: root,
        TADAZZ_ACCOUNTS_ENABLED: "false",
        TSX_DISABLE_CACHE: "1",
        TSX_TSCONFIG_PATH: path.join(repository, "tsconfig.json"),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    })
    let stdout = "",
      stderr = "",
      timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      processChild.kill("SIGKILL")
    }, 20000)
    processChild.stdout?.on("data", (data) => {
      stdout = (stdout + data).slice(-128000)
    })
    processChild.stderr?.on("data", (data) => {
      stderr = (stderr + data).slice(-128000)
    })
    processChild.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    processChild.once("close", (code, signal) => {
      clearTimeout(timeout)
      resolve({ pid: processChild.pid, code, signal, timedOut, stdout, stderr })
    })
  })
}
function retain(name: string, receipt: unknown) {
  if (!process.env.RECOVERY_NATIVE_RECEIPT_ROOT) return
  fs.mkdirSync(process.env.RECOVERY_NATIVE_RECEIPT_ROOT, { recursive: true })
  fs.writeFileSync(
    path.join(process.env.RECOVERY_NATIVE_RECEIPT_ROOT, `${name}.json`),
    JSON.stringify(receipt, null, 2),
  )
}

describe("R1 actual native storage bindings and logical digest", () => {
  let previousConfig: string | undefined
  let previousAccounts: string | undefined
  beforeEach(() => {
    previousConfig = process.env.CONFIG_PATH
    previousAccounts = process.env.TADAZZ_ACCOUNTS_ENABLED
  })
  afterEach(() => {
    if (previousConfig === undefined) delete process.env.CONFIG_PATH
    else process.env.CONFIG_PATH = previousConfig
    if (previousAccounts === undefined)
      delete process.env.TADAZZ_ACCOUNTS_ENABLED
    else process.env.TADAZZ_ACCOUNTS_ENABLED = previousAccounts
  })

  it.each(cases)(
    "production-equivalent startup preserves native binding: %s",
    async (scenario) => {
      const { root, descriptor } = makeNativeFixture(scenario)
      const receipt: Record<string, unknown> = {
        scenario,
        state: "STARTED",
        nativeId: descriptor.quizId,
        actualBaseName: descriptor.baseName,
      }
      try {
        expect(descriptor.quizId).toMatch(/^[A-Za-z0-9_-]{21}$/)
        expect(descriptor.baseName).not.toBe(`${descriptor.quizId}.json`)
        const before = nativeFixtureState(root)
        receipt.before = before
        const killed = await child("interrupt", root, descriptor.token)
        receipt.interruptedProcess = killed
        expect(killed.timedOut, killed.stderr).toBe(false)
        if (process.platform === "win32") expect(killed.code).toBe(86)
        else {
          expect(killed.code, killed.stderr).toBe(null)
          expect(killed.signal, killed.stderr).toBe("SIGKILL")
        }
        receipt.interrupted = JSON.parse(
          fs.readFileSync(path.join(root, ".native-interrupted.json"), "utf8"),
        )
        // Install the idless sentinel only after all native GET/setup calls and
        // after the kill. Startup must not normalize or allocate an ID for it.
        const idlessPath = "quizz/idless-r1-sentinel.json"
        const idlessBytes = JSON.stringify(
          quizzValidator.parse(nativeInput("Idless preserved")),
          null,
          2,
        )
        fs.writeFileSync(path.join(root, idlessPath), idlessBytes)
        const runs = []
        for (const sequence of ["1", "2"]) {
          const result = await child(
            "recover",
            root,
            descriptor.token,
            sequence,
          )
          const recovery = JSON.parse(
            fs.readFileSync(
              path.join(root, `.native-recovery-${sequence}.json`),
              "utf8",
            ),
          )
          runs.push({ process: result, ...recovery })
        }
        // Capture BOTH production-equivalent attempts before any outcome assertion.
        receipt.recoveries = runs
        expect(
          new Set([killed.pid, ...runs.map((run) => run.process.pid)]).size,
        ).toBe(3)
        const baseKey = `quizz/${descriptor.baseName}`
        const extrasKey = `extensions/quizzes/${descriptor.sidecarName}`
        const unrelatedKey = `quizz/${descriptor.unrelatedName}`
        for (const run of runs) {
          expect(run.process.timedOut, run.process.stderr).toBe(false)
          expect(run.pid).toBe(run.process.pid)
          expect(run.state.files[idlessPath].sha256).toBe(byteHash(idlessBytes))
          expect(run.state.files[unrelatedKey]).toEqual(
            before.files[unrelatedKey],
          )
          if (descriptor.foreignName) {
            const sentinel = `quizz/${descriptor.foreignName}`
            expect(run.state.files[sentinel]).toEqual(before.files[sentinel])
            expect(run.process.code).toBe(2)
            expect(run.error).toMatch(/startup blocked/i)
            expect(run.state.journals.length).toBeGreaterThan(0)
          } else if (descriptor.sidecarOnlyId) {
            expect(
              run.state.files[`quizz/${descriptor.sidecarOnlyId}.json`],
            ).toBeUndefined()
            expect(
              run.state.files[
                `extensions/quizzes/${descriptor.sidecarOnlyId}.json`
              ],
            ).toEqual(
              before.files[
                `extensions/quizzes/${descriptor.sidecarOnlyId}.json`
              ],
            )
            expect(run.process.code).toBe(2)
            expect(run.state.journals.length).toBeGreaterThan(0)
          } else {
            expect(run.process.code, run.process.stderr).toBe(0)
            expect(run.report.unresolvedCount).toBe(0)
            expect(
              run.state.files[`quizz/${descriptor.quizId}.json`],
            ).toBeUndefined()
            expect(run.state.files[baseKey]).toEqual(before.files[baseKey])
            expect(run.state.files[extrasKey]).toEqual(before.files[extrasKey])
            expect(run.state.files["media/r1-native.png"]).toEqual(
              before.files["media/r1-native.png"],
            )
            expect(run.state.journals).toHaveLength(0)
          }
        }
        if (!descriptor.foreignName && !descriptor.sidecarOnlyId)
          expect(runs[1].report.status).toBe("clean")
        expect(runs[1].state.files).toEqual(runs[0].state.files)
        receipt.state = "PASS"
      } catch (error) {
        receipt.state = "FAIL"
        receipt.error = error instanceof Error ? error.stack : String(error)
        throw error
      } finally {
        retain(`binding-${scenario}`, receipt)
        removeNativeFixture(root, descriptor.token)
      }
    },
    70000,
  )

  it.each([false, true])(
    "native composite create→GET→export uses the logical normalized digest (stripped input=%s)",
    (stripped) => {
      const { root, descriptor } = makeNativeFixture("media")
      const receipt: Record<string, unknown> = { stripped, state: "STARTED" }
      try {
        const input = {
          ...nativeInput("Logical digest"),
          ...(stripped
            ? {
                unrecognizedAcceptedField:
                  "must be stripped by actual public schema",
              }
            : {}),
        }
        const normalized = quizzValidator.parse(input) // actual create route's base parser
        const expectedLogical = computeCanonicalBaseDigest(normalized)
        const service = new CompositeStorageService({ ...native })
        const created = service.createCompositeQuiz({
          quizz: normalized,
          extras: richNativeExtras("temporary", normalized),
        })
        const actualPath = knownNativePath(root, created.quizId)
        const diskBytes = fs.readFileSync(actualPath)
        const stored = JSON.parse(diskBytes.toString("utf8"))
        const read = service.getCompositeQuiz(created.quizId)
        const exported = service.exportEnhancedBundle(created.quizId)
        receipt.inputDigest = computeCanonicalBaseDigest(input)
        receipt.normalizedLogicalDigest = expectedLogical
        receipt.ownershipBytesSha256 = byteHash(diskBytes)
        receipt.storedRecordCanonicalDigest = computeCanonicalBaseDigest(stored)
        receipt.created = created
        receipt.get = read
        receipt.exported = exported
        expect(stored.id).toBe(created.quizId)
        expect(stored.unrecognizedAcceptedField).toBeUndefined()
        expect(computeCanonicalBaseDigest(quizzValidator.parse(stored))).toBe(
          expectedLogical,
        )
        expect(created.baseDigest).toBe(expectedLogical)
        expect(read.baseDigest).toBe(expectedLogical)
        expect(read.digestMatches).toBe(true)
        expect(exported.extras.baseDigest).toBe(expectedLogical)
        expect(byteHash(diskBytes)).not.toBe(expectedLogical) // ownership never inferred from logical equality
        receipt.state = "PASS"
      } catch (error) {
        receipt.state = "FAIL"
        receipt.error = error instanceof Error ? error.stack : String(error)
        throw error
      } finally {
        retain(`logical-digest-${stripped ? "stripped" : "ordinary"}`, receipt)
        removeNativeFixture(root, descriptor.token)
      }
    },
  )

  it("native writer baseline strips extra input independently of ownership bytes", () => {
    const { root, descriptor } = makeNativeFixture("media")
    try {
      const input = {
        ...nativeInput("Raw stripped witness"),
        unrecognizedNativeField: "discarded",
      }
      const created = native.saveQuizz(input)
      const bytes = fs.readFileSync(knownNativePath(root, created.id))
      const stored = JSON.parse(bytes.toString("utf8"))
      const normalized = quizzValidator.parse(input)
      retain("native-stripped-baseline", {
        inputDigest: computeCanonicalBaseDigest(input),
        normalizedLogicalDigest: computeCanonicalBaseDigest(normalized),
        storedRecordCanonicalDigest: computeCanonicalBaseDigest(stored),
        ownershipBytesSha256: byteHash(bytes),
        stored,
      })
      expect(stored.unrecognizedNativeField).toBeUndefined()
      expect(computeCanonicalBaseDigest(quizzValidator.parse(stored))).toBe(
        computeCanonicalBaseDigest(normalized),
      )
      expect(computeCanonicalBaseDigest(input)).not.toBe(
        computeCanonicalBaseDigest(normalized),
      )
      expect(byteHash(bytes)).not.toBe(computeCanonicalBaseDigest(normalized))
    } finally {
      removeNativeFixture(root, descriptor.token)
    }
  })
})
