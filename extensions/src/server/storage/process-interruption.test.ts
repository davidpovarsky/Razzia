import fs from "node:fs"
import path from "node:path"
import { fork } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"
import { quizzValidator } from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  findMediaReferencesAcrossShows,
  quizExtrasV2Schema,
} from "../../core/index"
import {
  createRecoveryFixture,
  QUESTION_ID,
  removeSyntheticFixture,
} from "./recovery-fixture"
import { writeSidecar } from "./sidecar"
import {
  PROCESS_BOUNDARIES,
  PROCESS_MEDIA_NAME,
  processFixtureState,
  requireProcessRecord,
  requireProcessState,
  type ProcessBoundary,
  type ProcessFixtureState,
} from "./process-interruption-state"

const repository = fileURLToPath(new URL("../../../../", import.meta.url))
const childFile = fileURLToPath(
  new URL("./process-interruption-child.ts", import.meta.url),
)
const installed = createRequire(import.meta.url)

interface ChildResult {
  pid: number | undefined
  code: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  stdout: string
  stderr: string
  messages: unknown[]
}

function runChild(
  mode: "interrupt" | "recover",
  root: string,
  token: string,
  boundaryOrSequence: string,
): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child = fork(childFile, [mode, root, token, boundaryOrSequence], {
      cwd: repository,
      execArgv: ["--import", pathToFileURL(installed.resolve("tsx")).href],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        TSX_DISABLE_CACHE: "1",
        TSX_TSCONFIG_PATH: path.join(repository, "tsconfig.json"),
      },
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const messages: unknown[] = []
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, 20000)
    child.stdout?.on("data", (data) => {
      stdout = (stdout + String(data)).slice(-128000)
    })
    child.stderr?.on("data", (data) => {
      stderr = (stderr + String(data)).slice(-128000)
    })
    child.on("message", (message) => messages.push(message))
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once("close", (code, signal) => {
      clearTimeout(timer)
      resolve({
        pid: child.pid,
        code,
        signal,
        timedOut,
        stdout,
        stderr,
        messages,
      })
    })
  })
}

function references(state: ProcessFixtureState) {
  return findMediaReferencesAcrossShows(
    PROCESS_MEDIA_NAME,
    Object.entries(state.shows).map(([id, show]) => ({
      id,
      quizz: quizzValidator.parse(show.base),
      extras: quizExtrasV2Schema.parse(show.extras),
    })),
  )
}

describe("real process interruption and fresh-process recovery", () => {
  it.each(PROCESS_BOUNDARIES)(
    "interrupts at %s without transaction unwind",
    async (boundary: ProcessBoundary) => {
      const fixture = createRecoveryFixture()
      const token = crypto.randomUUID()
      const receipt: Record<string, unknown> = {
        boundary,
        parentPid: process.pid,
        state: "STARTED",
        platform: process.platform,
      }

      try {
        fixture.seed("show-a")
        const second = fixture.seed("show-b")
        second.extras.perQuestion[QUESTION_ID].background!.url =
          `/media/${PROCESS_MEDIA_NAME}`
        writeSidecar(fixture.getPath, "show-b", second.extras)
        fixture.seed("unrelated", false)
        fs.writeFileSync(
          fixture.getPath(`media/${PROCESS_MEDIA_NAME}`),
          Buffer.alloc(64 * 1024 + 3, 13),
        )
        fs.writeFileSync(
          fixture.getPath("media/unrelated.bin"),
          "unrelated synthetic media",
        )
        fs.writeFileSync(
          fixture.getPath(".process-fixture.json"),
          JSON.stringify({ kind: "recovery-process-test", token }),
        )
        const before = processFixtureState(fixture.root)
        receipt.before = before
        expect(references(before)).toHaveLength(3)
        const interrupted = await runChild(
          "interrupt",
          fixture.root,
          token,
          boundary,
        )
        receipt.interrupted = interrupted
        expect(interrupted.timedOut, interrupted.stderr).toBe(false)

        if (process.platform === "win32") {
          expect(interrupted.code).toBe(86)
        } else {
          expect(interrupted.signal, interrupted.stderr).toBe("SIGKILL")
          expect(interrupted.code).toBe(null)
        }

        const checkpoint = requireProcessRecord(
          JSON.parse(
            fs.readFileSync(fixture.getPath(".process-boundary.json"), "utf8"),
          ),
        )

        receipt.checkpoint = checkpoint
        const checkpointState = requireProcessState(checkpoint.state)

        expect(checkpoint.boundary).toBe(boundary)
        expect(checkpoint.pid).toBe(interrupted.pid)
        expect(checkpointState).toEqual(processFixtureState(fixture.root))
        const committed = [
          "committed-journal",
          "quarantine-cleanup",
          "journal-cleanup",
        ].includes(boundary)

        if (boundary !== "quarantine-copy" && boundary !== "journal-cleanup") {
          expect(checkpointState.journals).toHaveLength(1)
          expect(
            requireProcessRecord(checkpointState.journals.at(0)?.entry).kind,
          ).toBe(boundary.startsWith("quiz-") ? "quiz-save" : "media-delete")
          expect(
            requireProcessRecord(checkpointState.journals.at(0)?.entry).status,
          ).toBe(committed ? "committed" : "staged")
        }

        if (["quarantine-copy", "staged-journal"].includes(boundary)) {
          expect(checkpointState.shows).toEqual(before.shows)
          expect(checkpointState.mediaSha256).toBe(before.mediaSha256)
          expect(checkpointState.quarantine).toHaveLength(1)
        }

        if (boundary === "quarantine-copy") {
          expect(checkpointState.journals).toHaveLength(0)
        }

        if (boundary === "first-base-write") {
          const changedBases = ["show-a", "show-b"].filter(
            (id) =>
              checkpointState.shows[id].baseSha256 !==
              before.shows[id].baseSha256,
          )
          expect(changedBases).toHaveLength(1)
          for (const id of ["show-a", "show-b"]) {
            expect(checkpointState.shows[id].sidecarSha256).toBe(
              before.shows[id].sidecarSha256,
            )
          }
          expect(checkpointState.mediaSha256).toBe(before.mediaSha256)
        }

        if (
          [
            "last-sidecar-write",
            "binary-delete",
            "committed-journal",
            "quarantine-cleanup",
            "journal-cleanup",
          ].includes(boundary)
        ) {
          expect(references(checkpointState)).toHaveLength(0)
          expect(checkpointState.mediaSha256).toBe(
            boundary === "last-sidecar-write" ? before.mediaSha256 : null,
          )
        }

        if (["binary-delete", "committed-journal"].includes(boundary)) {
          expect(checkpointState.quarantine).toHaveLength(1)
        }

        if (["quarantine-cleanup", "journal-cleanup"].includes(boundary)) {
          expect(checkpointState.quarantine).toHaveLength(0)
        }

        if (boundary === "journal-cleanup") {
          expect(checkpointState.journals).toHaveLength(0)
        }

        if (boundary.startsWith("quiz-")) {
          expect(
            requireProcessRecord(checkpointState.shows["show-a"].base).subject,
          ).toBe("Interrupted composite V2 save")
          expect(
            requireProcessRecord(checkpointState.shows["show-a"].extras)
              .revision,
          ).toBe(boundary === "quiz-sidecar-write" ? 2 : 1)
        }

        const recovery1 = await runChild("recover", fixture.root, token, "1")
        receipt.recovery1Process = recovery1
        expect(recovery1.timedOut, recovery1.stderr).toBe(false)
        expect(recovery1.code, recovery1.stderr).toBe(0)
        expect(recovery1.signal).toBe(null)
        const first = requireProcessRecord(
          JSON.parse(
            fs.readFileSync(
              fixture.getPath(".process-recovery-1.json"),
              "utf8",
            ),
          ),
        )

        receipt.recovery1 = first
        const firstState = requireProcessState(first.state)

        expect(requireProcessRecord(first.report).unresolvedCount).toBe(0)
        expect(firstState.journals).toHaveLength(0)
        expect(firstState.shows.unrelated).toEqual(before.shows.unrelated)
        expect(firstState.unrelatedMediaSha256).toBe(
          before.unrelatedMediaSha256,
        )

        if (committed) {
          expect(firstState.mediaSha256).toBe(null)
          expect(references(firstState)).toHaveLength(0)
          for (const id of ["show-a", "show-b"]) {
            const expectedBase = requireProcessRecord(
              structuredClone(before.shows[id].base),
            )
            const { questions } = expectedBase

            if (!Array.isArray(questions)) {
              throw new Error("Synthetic base questions are missing")
            }

            delete requireProcessRecord(questions.at(0)).media
            const expectedExtras = requireProcessRecord(
              structuredClone(before.shows[id].extras),
            )
            // A committed detach changes the canonical base. The sidecar must
            // bind to that new base, not retain the pre-delete digest.
            expectedExtras.baseDigest = computeCanonicalBaseDigest(expectedBase)

            if (id === "show-b") {
              delete requireProcessRecord(
                requireProcessRecord(expectedExtras.perQuestion)[QUESTION_ID],
              ).background
            }

            expect(firstState.shows[id].base).toEqual(expectedBase)
            expect(firstState.shows[id].extras).toEqual(expectedExtras)
          }
        } else {
          if (boundary.startsWith("quiz-")) {
            // Quiz-save journals store the complete decoded base object. The
            // startup adapter reserializes it using two-space native formatting.

            // Compare every raw field/type; validation never replaces these objects or strips IDs.

            const original = before.shows["show-a"]
            const restored = firstState.shows["show-a"]
            expect(restored.base).toStrictEqual(original.base)
            expect(computeCanonicalBaseDigest(restored.base)).toBe(
              computeCanonicalBaseDigest(original.base),
            )
            expect(restored.extras).toStrictEqual(original.extras)
            expect(restored.sidecarSha256).toBe(original.sidecarSha256)
            expect(firstState.shows["show-b"]).toStrictEqual(
              before.shows["show-b"],
            )
            expect(firstState.shows.unrelated).toStrictEqual(
              before.shows.unrelated,
            )
          } else {
            expect(firstState.shows).toEqual(before.shows)
          }

          expect(firstState.mediaSha256).toBe(before.mediaSha256)
          expect(references(firstState)).toHaveLength(3)
        }

        const recovery2 = await runChild("recover", fixture.root, token, "2")
        receipt.recovery2Process = recovery2
        expect(recovery2.timedOut, recovery2.stderr).toBe(false)
        expect(recovery2.code, recovery2.stderr).toBe(0)
        expect(recovery2.signal).toBe(null)
        const secondRecovery = requireProcessRecord(
          JSON.parse(
            fs.readFileSync(
              fixture.getPath(".process-recovery-2.json"),
              "utf8",
            ),
          ),
        )

        receipt.recovery2 = secondRecovery
        const secondState = requireProcessState(secondRecovery.state)

        expect(
          new Set([interrupted.pid, recovery1.pid, recovery2.pid]).size,
        ).toBe(3)
        expect(requireProcessRecord(secondRecovery.report).status).toBe("clean")
        expect(secondState).toEqual(firstState)
        receipt.state = "PASS"
      } catch (error) {
        receipt.state = "FAIL"
        receipt.error = error instanceof Error ? error.stack : String(error)
        throw error
      } finally {
        if (process.env.RECOVERY_PROCESS_RECEIPT_ROOT) {
          fs.mkdirSync(process.env.RECOVERY_PROCESS_RECEIPT_ROOT, {
            recursive: true,
          })
          fs.writeFileSync(
            path.join(
              process.env.RECOVERY_PROCESS_RECEIPT_ROOT,
              `${boundary}.json`,
            ),
            JSON.stringify(receipt, null, 2),
          )
        }

        removeSyntheticFixture(fixture.root)
      }
    },
    70000,
  )
})
