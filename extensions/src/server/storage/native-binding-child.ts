import fs from "node:fs"
import path from "node:path"
import * as native from "../../../../packages/socket/src/services/config"
import { computeCanonicalBaseDigest } from "../../core/index"
import {
  executeMediaDeleteTransaction,
  recoverStartupJournals,
} from "../media-library"
import { CompositeStorageService } from "./service"
import { readSidecar } from "./sidecar"
import {
  assertNativeFixture,
  nativeFixtureState,
  NATIVE_MEDIA,
} from "./native-binding-fixture"

function main() {
  const [mode, root, token, sequence] = process.argv.slice(2)
  const descriptor = assertNativeFixture(root, token)
  if (
    process.env.TADAZZ_ACCOUNTS_ENABLED !== "false" ||
    native.getPath() !== root
  )
    throw new Error("Unexpected native fixture scope")
  const rawWrite = fs.writeFileSync.bind(fs)
  if (mode === "recover") {
    if (!["1", "2"].includes(sequence))
      throw new Error("Unexpected startup attempt")
    let report: unknown
    let error: string | undefined
    try {
      // Exact production injection shape from packages/socket/src/index.ts.
      // Keep default throwOnUnresolved; catching only records the failed boot.
      report = recoverStartupJournals({
        getPath: native.getPath,
        updateQuizz: native.updateQuizz,
        deleteQuizz: native.deleteQuizz,
      })
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
      process.exitCode = 2
    }
    rawWrite(
      path.join(root, `.native-recovery-${sequence}.json`),
      JSON.stringify({
        pid: process.pid,
        report,
        error,
        state: nativeFixtureState(root),
      }),
    )
    return
  }
  if (mode !== "interrupt") throw new Error("Unexpected R1 child operation")
  const stop = () => {
    rawWrite(
      path.join(root, ".native-interrupted.json"),
      JSON.stringify({
        pid: process.pid,
        scenario: descriptor.scenario,
        state: nativeFixtureState(root),
        signal: process.platform === "win32" ? "abrupt-exit-86" : "SIGKILL",
      }),
    )
    if (process.platform === "win32") process.exit(86)
    process.kill(process.pid, "SIGKILL")
    process.exit(87)
  }
  if (descriptor.scenario.startsWith("media")) {
    executeMediaDeleteTransaction(native.getPath, NATIVE_MEDIA, {
      detach: true,
      deleteMediaFn: () => {
        fs.unlinkSync(native.getPath(`media/${NATIVE_MEDIA}`))
        stop()
      },
    })
  } else {
    const original = native.getQuizzById(descriptor.quizId)
    const extras = readSidecar(native.getPath, descriptor.quizId)
    if (!extras || extras.schemaVersion !== 2)
      throw new Error("Expected real native V2 sidecar")
    const target = { ...original, subject: "Interrupted native save" }
    fs.writeFileSync = (file, data, options) => {
      rawWrite(file, data, options)
      const afterSidecar = descriptor.scenario === "quiz-sidecar"
      if (
        String(file) ===
        native.getPath(
          afterSidecar
            ? `extensions/quizzes/${descriptor.sidecarName}`
            : `quizz/${descriptor.baseName}`,
        )
      )
        stop()
    }
    new CompositeStorageService({ ...native }).saveCompositeQuiz({
      quizId: descriptor.quizId,
      expectedRevision: 1,
      quizz: target,
      extras: {
        ...extras,
        baseDigest: computeCanonicalBaseDigest(target),
        authoring: { showNote: "Interrupted new native note" },
      },
    })
  }
  throw new Error("Native interruption boundary was not reached")
}
try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
