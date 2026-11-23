import fs from "node:fs"
import path from "node:path"
import { fork } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as native from "../../../../packages/socket/src/services/config"
import { computeCanonicalBaseDigest } from "../../core/index"
import { executeMediaDeleteTransaction } from "../media-library"
import {
  assertNativeRuns,
  byteHash,
  nativeRecoveryReport,
  requireNativeRecord,
  requireNativeRecordList,
  requireNativeString,
  isNativeRecord,
  makeNativeFixture,
  nativeFixtureState,
  nativeInput,
  richNativeExtras,
  removeNativeFixture,
} from "./native-binding-fixture"
import { CompositeStorageService } from "./service"

const repository = fileURLToPath(new URL("../../../../", import.meta.url))
const installed = createRequire(import.meta.url)
const childPath = fileURLToPath(
  new URL("./native-binding-child.ts", import.meta.url),
)
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
    stdout: string
    stderr: string
    timedOut: boolean
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
      stderr = ""
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      processChild.kill("SIGKILL")
    }, 20000)
    processChild.stdout?.on("data", (data: Buffer | string) => {
      stdout = (
        stdout + (typeof data === "string" ? data : data.toString("utf8"))
      ).slice(-128000)
    })
    processChild.stderr?.on("data", (data: Buffer | string) => {
      stderr = (
        stderr + (typeof data === "string" ? data : data.toString("utf8"))
      ).slice(-128000)
    })
    processChild.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    processChild.once("close", (code, signal) => {
      clearTimeout(timeout)
      resolve({ pid: processChild.pid, code, signal, stdout, stderr, timedOut })
    })
  })
}
function retain(name: string, data: unknown) {
  if (!process.env.RECOVERY_NATIVE_RECEIPT_ROOT) {
    return
  }

  fs.mkdirSync(process.env.RECOVERY_NATIVE_RECEIPT_ROOT, { recursive: true })
  fs.writeFileSync(
    path.join(process.env.RECOVERY_NATIVE_RECEIPT_ROOT, `r2-${name}.json`),
    JSON.stringify(data, null, 2),
  )
}
async function recoverTwice(root: string, token: string) {
  const runs: unknown[] = []
  for (const sequence of ["1", "2"]) {
    const processResult = await child("recover", root, token, sequence)
    const state = requireNativeRecord(
      JSON.parse(
        fs.readFileSync(
          path.join(root, `.native-recovery-${sequence}.json`),
          "utf8",
        ),
      ),
    )
    runs.push({ process: processResult, ...state })
  }

  return runs
}

describe("R2 recorded physical ownership and logical digest controls", () => {
  let previousConfig: string | undefined = undefined

  let previousAccounts: string | undefined = undefined
  beforeEach(() => {
    previousConfig = process.env.CONFIG_PATH
    previousAccounts = process.env.TADAZZ_ACCOUNTS_ENABLED
  })
  afterEach(() => {
    vi.restoreAllMocks()

    if (previousConfig === undefined) {
      delete process.env.CONFIG_PATH
    } else {
      process.env.CONFIG_PATH = previousConfig
    }

    if (previousAccounts === undefined) {
      delete process.env.TADAZZ_ACCOUNTS_ENABLED
    } else {
      process.env.TADAZZ_ACCOUNTS_ENABLED = previousAccounts
    }
  })

  it.each(["create", "import"] as const)(
    "recovers actual native %s after ID return and journal stage",
    async (operation) => {
      const { root, descriptor } = makeNativeFixture(operation)
      const receipt: Record<string, unknown> = { operation, state: "STARTED" }

      try {
        const before = nativeFixtureState(root)
        const killed = await child("interrupt", root, descriptor.token)
        receipt.interrupted = killed
        expect(killed.timedOut, killed.stderr).toBe(false)

        if (process.platform === "win32") {
          expect(killed.code).toBe(86)
        } else {
          expect(killed.signal, killed.stderr).toBe("SIGKILL")
        }

        const staged = nativeFixtureState(root)
        receipt.before = before
        receipt.staged = staged
        expect(staged.journals).toHaveLength(1)
        const entry = requireNativeRecord(staged.journals[0].entry)

        expect(entry.quizId).not.toBe(descriptor.quizId)
        const createdBase = Object.entries(staged.files).find(
          ([key, file]) =>
            key.startsWith("quizz/") &&
            isNativeRecord(file.json) &&
            file.json.id === entry.quizId,
        )
        expect(createdBase).toBeDefined()
        expect(createdBase![0]).not.toBe(
          `quizz/${requireNativeString(entry.quizId)}.json`,
        )
        const idless = "quizz/idless-r2-after-id.json"
        fs.writeFileSync(
          path.join(root, idless),
          JSON.stringify(
            {
              gameMode: "quiz",
              subject: "Idless after-ID sentinel",
              questions: [],
            },
            null,
            2,
          ),
        )
        const expectedFiles = {
          ...before.files,
          [idless]: nativeFixtureState(root).files[idless],
        }
        const runs = await recoverTwice(root, descriptor.token)
        receipt.recoveries = runs
        assertNativeRuns(runs)

        expect(new Set([killed.pid, ...runs.map((run) => run.pid)]).size).toBe(
          3,
        )
        for (const run of runs) {
          expect(run.pid).toBe(run.process.pid)
          expect(run.process.code, run.process.stderr).toBe(0)
          expect(run.process.timedOut).toBe(false)
          expect(run.state.files).toStrictEqual(expectedFiles)
          expect(run.state.journals).toHaveLength(0)
        }
        expect(nativeRecoveryReport(runs[1]).status).toBe("clean")
        receipt.state = "PASS"
      } catch (error) {
        receipt.state = "FAIL"
        receipt.error = error instanceof Error ? error.stack : String(error)
        throw error
      } finally {
        retain(`after-id-${operation}`, receipt)
        removeNativeFixture(root, descriptor.token)
      }
    },
    70000,
  )

  it("recovers a legacy-tagged Media record only with unchanged complete pre-mutation physical proof", async () => {
    const { root, descriptor } = makeNativeFixture("media")
    const receipt: Record<string, unknown> = { state: "STARTED" }

    try {
      const before = nativeFixtureState(root)
      const killed = await child("interrupt", root, descriptor.token)
      receipt.interrupted = killed
      expect(killed.timedOut).toBe(false)

      if (process.platform === "win32") {
        expect(killed.code).toBe(86)
      } else {
        expect(killed.signal).toBe("SIGKILL")
      }

      const staged = nativeFixtureState(root)
      const journal = path.join(root, staged.journals[0].path)
      const entry = requireNativeRecord(
        JSON.parse(fs.readFileSync(journal, "utf8")),
      )

      const capturedProof = structuredClone(
        requireNativeRecordList(entry.shows).map((show) => show.bindings),
      )
      // Protocol tag only; never fabricate or rebind ownership

      entry.version = 1
      fs.writeFileSync(journal, JSON.stringify(entry, null, 2))
      expect(
        requireNativeRecordList(entry.shows).map((show) => show.bindings),
      ).toStrictEqual(capturedProof)
      receipt.recordedBeforeTagChange = staged
      const runs = await recoverTwice(root, descriptor.token)
      receipt.recoveries = runs
      assertNativeRuns(runs)

      expect(new Set([killed.pid, ...runs.map((run) => run.pid)]).size).toBe(3)
      for (const run of runs) {
        expect(run.pid).toBe(run.process.pid)
        expect(run.process.timedOut).toBe(false)
        expect(run.process.code, run.process.stderr).toBe(0)
        expect(run.state.files).toStrictEqual(before.files)
        expect(run.state.journals).toHaveLength(0)
      }
      expect(nativeRecoveryReport(runs[1]).status).toBe("clean")
      receipt.state = "PASS"
    } catch (error) {
      receipt.state = "FAIL"
      receipt.error = error instanceof Error ? error.stack : String(error)
      throw error
    } finally {
      retain("legacy-tagged-proven-media", receipt)
      removeNativeFixture(root, descriptor.token)
    }
  }, 70000)

  it.each([
    "base-inode",
    "base-content",
    "base-whitespace",
    "sidecar-inode",
    "sidecar-content",
    "base-symlink",
    "newer-sidecar",
    "old-quiz-record",
    "old-media-record",
    "legacy-sidecar-as-base",
    "quiz-base-content",
    "quiz-sidecar-content",
  ])(
    "preserves BOTH siblings and journal on %s",
    async (fault) => {
      const media = !fault.startsWith("quiz-") && fault !== "old-quiz-record"
      const { root, descriptor } = makeNativeFixture(
        media ? "media" : "quiz-base",
      )
      const receipt: Record<string, unknown> = { fault, state: "STARTED" }

      try {
        const killed = await child("interrupt", root, descriptor.token)
        receipt.interrupted = killed
        expect(killed.timedOut, killed.stderr).toBe(false)

        if (process.platform === "win32") {
          expect(killed.code).toBe(86)
        } else {
          expect(killed.signal, killed.stderr).toBe("SIGKILL")
        }

        const base = path.join(root, "quizz", descriptor.baseName)
        const sidecar = path.join(
          root,
          "extensions/quizzes",
          descriptor.sidecarName,
        )
        const before = nativeFixtureState(root)
        const journal = path.join(root, before.journals[0].path)

        if (fault.endsWith("inode")) {
          const target = fault.includes("base") ? base : sidecar
          const originalIdentity = fs.lstatSync(target, { bigint: true })
          const originalBytes = byteHash(fs.readFileSync(target))
          const replacement = `${target}.foreign-r2`
          fs.copyFileSync(target, replacement)
          // Identical bytes, distinct inode

          fs.renameSync(replacement, target)
          const replacementIdentity = fs.lstatSync(target, { bigint: true })
          receipt.replacement = {
            relativePath: path.relative(root, target),
            before: {
              dev: String(originalIdentity.dev),
              ino: String(originalIdentity.ino),
            },
            after: {
              dev: String(replacementIdentity.dev),
              ino: String(replacementIdentity.ino),
            },
            beforeSha256: originalBytes,
            afterSha256: byteHash(fs.readFileSync(target)),
          }
          expect(replacementIdentity.ino).not.toBe(originalIdentity.ino)
          expect(byteHash(fs.readFileSync(target))).toBe(originalBytes)
        } else if (fault === "base-symlink") {
          const foreign = path.join(root, "quizz/foreign-r2.json")
          fs.writeFileSync(
            foreign,
            JSON.stringify(
              {
                ...requireNativeRecord(
                  JSON.parse(fs.readFileSync(base, "utf8")),
                ),
                id: "foreign-r2",
              },
              null,
              2,
            ),
          )
          fs.unlinkSync(base)
          fs.symlinkSync(foreign, base)
        } else if (fault === "base-whitespace") {
          const current = fs.readFileSync(base, "utf8")
          const compact = JSON.stringify(JSON.parse(current))
          expect(byteHash(compact)).not.toBe(byteHash(current))
          fs.writeFileSync(base, compact)
          receipt.representationChange = {
            beforeSha256: byteHash(current),
            afterSha256: byteHash(compact),
            decodedDataUnchanged: true,
          }
        } else if (fault.endsWith("content") || fault === "newer-sidecar") {
          const target = fault.includes("base") ? base : sidecar
          const data = requireNativeRecord(
            JSON.parse(fs.readFileSync(target, "utf8")),
          )

          if (fault === "newer-sidecar") {
            data.revision = 999
          } else if (fault.includes("base")) {
            data.subject = "Foreign same-ID content"
          } else {
            requireNativeRecord(data.authoring).showNote =
              "Foreign same-revision content"
          }

          fs.writeFileSync(target, JSON.stringify(data, null, 2))
        } else {
          const entry = requireNativeRecord(
            JSON.parse(fs.readFileSync(journal, "utf8")),
          )
          entry.version = 1
          delete entry.bindings

          if (fault === "old-quiz-record") {
            delete entry.targetBase
          }

          if (Array.isArray(entry.shows)) {
            for (const show of requireNativeRecordList(entry.shows)) {
              delete show.bindings
            }
          }

          if (fault === "legacy-sidecar-as-base") {
            requireNativeRecord(
              requireNativeRecordList(entry.shows).at(0),
            ).filePath = sidecar
            requireNativeRecord(
              requireNativeRecordList(entry.shows).at(0),
            ).originalBaseRaw = fs.readFileSync(sidecar, "utf8")
          }

          fs.writeFileSync(journal, JSON.stringify(entry, null, 2))
        }

        const rejectedState = nativeFixtureState(root)
        const runs = await recoverTwice(root, descriptor.token)
        receipt.beforeRecovery = rejectedState
        // Capture BOTH before outcome assertions

        receipt.recoveries = runs

        assertNativeRuns(runs)
        expect(new Set([killed.pid, ...runs.map((run) => run.pid)]).size).toBe(
          3,
        )
        for (const run of runs) {
          expect(run.pid).toBe(run.process.pid)
          expect(run.process.timedOut).toBe(false)
          expect(run.process.code, run.process.stderr).toBe(2)
          expect(run.error).toMatch(/startup blocked/i)
          expect(run.state).toStrictEqual(rejectedState)
        }
        receipt.state = "PASS"
      } catch (error) {
        receipt.state = "FAIL"
        receipt.error = error instanceof Error ? error.stack : String(error)
        throw error
      } finally {
        retain(`ownership-${fault}`, receipt)
        removeNativeFixture(root, descriptor.token)
      }
    },
    70000,
  )

  it("does not reattach references when actual rollback binary restoration fails", async () => {
    const { root, descriptor } = makeNativeFixture("media")
    const receipt: Record<string, unknown> = { state: "STARTED" }

    try {
      const before = nativeFixtureState(root)
      const copy = fs.copyFileSync.bind(fs)
      vi.spyOn(fs, "copyFileSync").mockImplementation(
        (source, destination, flags) => {
          if (
            String(source).includes("quarantine") &&
            String(destination) === native.getPath("media/r1-native.png")
          ) {
            throw new Error("EIO actual binary rollback copy failure")
          }

          return copy(source, destination, flags)
        },
      )
      const result = executeMediaDeleteTransaction(
        native.getPath,
        "r1-native.png",
        {
          detach: true,
          deleteMediaFn: () => {
            fs.unlinkSync(native.getPath("media/r1-native.png"))
            throw new Error("Actual delete callback failed after unlink")
          },
        },
      )
      vi.restoreAllMocks()
      const failed = nativeFixtureState(root)
      receipt.before = before
      receipt.result = result
      receipt.failedRollback = failed
      expect(result.allowed).toBe(false)
      expect(failed.files["media/r1-native.png"]).toBeUndefined()
      expect(
        requireNativeRecord(
          requireNativeRecordList(
            requireNativeRecord(
              failed.files[`quizz/${descriptor.baseName}`].json,
            ).questions,
          ).at(0),
        ).media,
      ).toBeUndefined()
      expect(failed.journals).toHaveLength(1)
      const entry = requireNativeRecord(failed.journals[0].entry)

      expect(
        byteHash(fs.readFileSync(requireNativeString(entry.quarantinePath))),
      ).toBe(before.files["media/r1-native.png"].sha256)
      const runs = await recoverTwice(root, descriptor.token)
      receipt.recoveries = runs
      assertNativeRuns(runs)

      expect(new Set(runs.map((run) => run.pid)).size).toBe(2)
      expect(runs[0].process.code).toBe(0)
      expect(nativeRecoveryReport(runs[1]).status).toBe("clean")
      for (const run of runs) {
        expect(run.state.files).toStrictEqual(before.files)
      }
      receipt.state = "PASS"
    } catch (error) {
      receipt.state = "FAIL"
      receipt.error = error instanceof Error ? error.stack : String(error)
      throw error
    } finally {
      retain("binary-rollback-copy-failure", receipt)
      removeNativeFixture(root, descriptor.token)
    }
  }, 70000)

  it.each([
    "payload",
    "id-bearing",
    "changed-content",
    "mismatched-id",
    "sidecar-id-mismatch",
    "extra-field",
    "question-id-type",
  ])("GET digest compatibility preserves every field: %s", (representation) => {
    const { root, descriptor } = makeNativeFixture("media")
    const sidecar = path.join(
      root,
      "extensions/quizzes",
      descriptor.sidecarName,
    )
    const base = path.join(root, "quizz", descriptor.baseName)

    try {
      const record = requireNativeRecord(
        JSON.parse(fs.readFileSync(base, "utf8")),
      )
      const { id: _storageId, ...payload } = record
      const extras = requireNativeRecord(
        JSON.parse(fs.readFileSync(sidecar, "utf8")),
      )

      if (representation === "id-bearing") {
        extras.baseDigest = computeCanonicalBaseDigest(record)
      }

      if (representation === "changed-content") {
        extras.baseDigest = computeCanonicalBaseDigest({
          ...payload,
          subject: "Different content",
        })
      }

      if (representation === "mismatched-id") {
        extras.baseDigest = computeCanonicalBaseDigest({
          ...record,
          id: "foreign-id",
        })
      }

      if (representation === "sidecar-id-mismatch") {
        extras.quizId = "foreign-id"
      }

      if (representation === "extra-field") {
        record.unknownPreservedField = { value: ["1", 1, null, false] }
      }

      if (representation === "question-id-type") {
        requireNativeRecord(
          requireNativeRecordList(record.questions).at(0),
        ).id = 17
      }

      fs.writeFileSync(base, JSON.stringify(record, null, 2))
      fs.writeFileSync(sidecar, JSON.stringify(extras, null, 2))
      const sidecarBytes = fs.readFileSync(sidecar)
      const read = new CompositeStorageService({
        ...native,
        getQuizzById: () => structuredClone(record),
      }).getCompositeQuiz(descriptor.quizId)
      const { id: _matchedStorageId, ...completePayload } = record
      retain(`digest-${representation}`, {
        read,
        record,
        sidecarBeforeSha256: byteHash(sidecarBytes),
        sidecarAfterSha256: byteHash(fs.readFileSync(sidecar)),
      })
      expect(read.baseDigest).toBe(computeCanonicalBaseDigest(completePayload))
      expect(read.quizz).toStrictEqual(record)
      expect(read.digestMatches).toBe(
        ["payload", "id-bearing"].includes(representation),
      )
      expect(fs.readFileSync(sidecar)).toEqual(sidecarBytes)
    } finally {
      removeNativeFixture(root, descriptor.token)
    }
  })

  it("imports an actual native exported bundle with a fresh ID and consistent logical digest", () => {
    const { root, descriptor } = makeNativeFixture("media")
    const receipt: Record<string, unknown> = { state: "STARTED" }

    try {
      const service = new CompositeStorageService({ ...native })
      const input = nativeInput("R2 actual native enhanced roundtrip")
      const created = service.createCompositeQuiz({
        quizz: input,
        extras: richNativeExtras("temporary", input),
      })
      const exported = service.exportEnhancedBundle(created.quizId)
      const unchanged = structuredClone(exported)
      const before = nativeFixtureState(root)
      const imported = service.importEnhancedBundle(exported)
      const fetched = service.getCompositeQuiz(imported.quizId)
      const reExported = service.exportEnhancedBundle(imported.quizId)
      const { id, ...completePayload } = fetched.quizz
      const after = nativeFixtureState(root)
      Object.assign(receipt, {
        created,
        exported,
        imported,
        fetched,
        reExported,
        before,
        after,
      })

      if (
        fetched.extras?.schemaVersion !== 2 ||
        exported.extras.schemaVersion !== 2
      ) {
        throw new Error("Expected complete V2 roundtrip fixtures")
      }

      expect(imported.quizId).not.toBe(created.quizId)
      expect(id).toBe(imported.quizId)
      expect(completePayload).toStrictEqual(input)
      expect(imported.baseDigest).toBe(
        computeCanonicalBaseDigest(completePayload),
      )
      expect(fetched.baseDigest).toBe(imported.baseDigest)
      expect(fetched.digestMatches).toBe(true)
      expect(reExported.quizz).toStrictEqual(fetched.quizz)
      expect(reExported.extras).toStrictEqual(fetched.extras)
      expect(reExported.extras.baseDigest).toBe(imported.baseDigest)
      expect(exported).toStrictEqual(unchanged)
      for (const [relative, file] of Object.entries(before.files)) {
        expect(after.files[relative]).toStrictEqual(file)
      }
      for (const key of [
        "scenes",
        "defaults",
        "teams",
        "audio",
        "roster",
        "authoring",
        "mediaCatalog",
      ] as const) {
        expect(fetched.extras[key]).toStrictEqual(exported.extras[key])
      }
      expect(Object.values(fetched.extras.perQuestion)).toStrictEqual(
        Object.values(exported.extras.perQuestion),
      )
      expect(fetched.extras.questionIds).not.toEqual(
        exported.extras.questionIds,
      )
      expect(fetched.extras.timeline.map((item) => item.kind)).toStrictEqual(
        exported.extras.timeline.map((item) => item.kind),
      )
      expect(
        fetched.extras.timeline
          .filter((item) => item.kind === "question")
          .map((item) => item.questionId),
      ).toStrictEqual(fetched.extras.questionIds)
      receipt.state = "PASS"
    } catch (error) {
      receipt.state = "FAIL"
      receipt.error = error instanceof Error ? error.stack : String(error)
      throw error
    } finally {
      retain("native-enhanced-roundtrip", receipt)
      removeNativeFixture(root, descriptor.token)
    }
  })

  it("rejects an imported root ID that does not match its source sidecar before allocation", () => {
    const { root, descriptor } = makeNativeFixture("media")

    try {
      const service = new CompositeStorageService({ ...native })
      const input = nativeInput("R2 source identity denial")
      const created = service.createCompositeQuiz({
        quizz: input,
        extras: richNativeExtras("temporary", input),
      })
      const exported = service.exportEnhancedBundle(created.quizId)
      const mismatched = structuredClone(exported)
      const mismatchedRecord = mismatched.quizz as Record<string, unknown>
      mismatchedRecord.id = "foreign-source-id"
      const before = nativeFixtureState(root)
      let allocationCalls = 0
      const guarded = new CompositeStorageService({
        ...native,
        saveQuizz: (data) => {
          allocationCalls += 1

          return native.saveQuizz(data)
        },
      })
      expect(() => guarded.importEnhancedBundle(mismatched)).toThrow(
        /identity mismatch/i,
      )
      expect(nativeFixtureState(root)).toStrictEqual(before)
      expect(allocationCalls).toBe(0)
      retain("import-source-id-mismatch", {
        before,
        after: nativeFixtureState(root),
        rejected: true,
        allocationCalls,
      })
    } finally {
      removeNativeFixture(root, descriptor.token)
    }
  })

  it("rejects a returned storage ID that does not match the requested identity", () => {
    const { root, descriptor } = makeNativeFixture("media")

    try {
      const before = nativeFixtureState(root)
      const record = requireNativeRecord(
        JSON.parse(
          fs.readFileSync(
            path.join(root, "quizz", descriptor.baseName),
            "utf8",
          ),
        ),
      )
      const service = new CompositeStorageService({
        ...native,
        getQuizzById: () => ({ ...record, id: "foreign-id" }),
      })
      expect(() => service.getCompositeQuiz(descriptor.quizId)).toThrow(
        /identity mismatch/i,
      )
      expect(nativeFixtureState(root)).toStrictEqual(before)
      retain("digest-returned-storage-id-mismatch", {
        before,
        after: nativeFixtureState(root),
        rejected: true,
      })
    } finally {
      removeNativeFixture(root, descriptor.token)
    }
  })
})
