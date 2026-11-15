import fs from "node:fs"
import path from "node:path"
import {
  executeMediaDeleteTransaction,
  recoverStartupJournals,
} from "../media-library"
import { CompositeStorageService } from "./service"
import { computeCanonicalBaseDigest } from "../../core/index"
import {
  assertProcessFixture,
  processFixtureState,
  PROCESS_BOUNDARIES,
  PROCESS_MEDIA_NAME,
  type ProcessBoundary,
} from "./process-interruption-state"

// This executable is imported only by the process-interruption test. All hooks
// stay in this child; production code has no test hook or process-exit branch.
function main() {
  const [mode, inputRoot, token, boundaryOrSequence] = process.argv.slice(2)
  const root = assertProcessFixture(inputRoot, token)
  const getPath = (subPath = "") => path.join(root, subPath)
  const basePath = (id: string) => getPath(`quizz/${id}.json`)
  const rawWrite = fs.writeFileSync.bind(fs)
  const journalRoot = getPath("extensions/quizzes/.journal/media-delete")
  const quarantineRoot = path.join(journalRoot, "quarantine")

  if (mode === "recover") {
    if (!["1", "2"].includes(boundaryOrSequence))
      throw new Error("Unexpected recovery sequence")
    const report = recoverStartupJournals({ getPath })
    rawWrite(
      getPath(`.process-recovery-${boundaryOrSequence}.json`),
      JSON.stringify({
        pid: process.pid,
        report,
        state: processFixtureState(root),
      }),
    )
    return
  }
  if (
    mode !== "interrupt" ||
    !PROCESS_BOUNDARIES.includes(boundaryOrSequence as ProcessBoundary)
  )
    throw new Error("Unexpected process harness mode/boundary")
  const boundary = boundaryOrSequence as ProcessBoundary
  function interrupt(at: ProcessBoundary) {
    if (at !== boundary) return
    const receipt = {
      boundary,
      pid: process.pid,
      mechanism: process.platform === "win32" ? "abrupt-exit-86" : "SIGKILL",
      state: processFixtureState(root),
    }
    rawWrite(getPath(".process-boundary.json"), JSON.stringify(receipt))
    process.send?.({ type: "boundary", boundary, pid: process.pid })
    // No thrown exception: executeMediaDeleteTransaction's catch/finally cannot
    // restore files or clean journals before the parent starts fresh recovery.
    if (process.platform === "win32") process.exit(86)
    process.kill(process.pid, "SIGKILL")
    process.exit(87) // Reaching this fallback is a failing harness result.
  }

  let baseWrites = 0
  let sidecarWrites = 0
  const copy = fs.copyFileSync.bind(fs)
  fs.copyFileSync = (source, destination, flags) => {
    copy(source, destination, flags)
    if (String(destination).startsWith(quarantineRoot + path.sep))
      interrupt("quarantine-copy")
  }
  const rename = fs.renameSync.bind(fs)
  fs.renameSync = (source, destination) => {
    rename(source, destination)
    if (String(destination).endsWith(".media-journal.json")) {
      const entry = JSON.parse(fs.readFileSync(destination, "utf8"))
      if (entry.status === "staged") interrupt("staged-journal")
      if (entry.status === "committed") interrupt("committed-journal")
    }
    if (
      [basePath("show-a"), basePath("show-b")].includes(String(destination))
    ) {
      baseWrites += 1
      if (baseWrites === 1) interrupt("first-base-write")
    }
  }
  fs.writeFileSync = (file, data, options) => {
    rawWrite(file, data, options)
    if (String(file) === basePath("show-a")) interrupt("quiz-base-write")
    if (
      [
        getPath("extensions/quizzes/show-a.json"),
        getPath("extensions/quizzes/show-b.json"),
      ].includes(String(file))
    ) {
      sidecarWrites += 1
      if (sidecarWrites === 2) interrupt("last-sidecar-write")
      if (String(file) === getPath("extensions/quizzes/show-a.json"))
        interrupt("quiz-sidecar-write")
    }
  }
  const unlink = fs.unlinkSync.bind(fs)
  fs.unlinkSync = (file) => {
    unlink(file)
    if (String(file) === getPath(`media/${PROCESS_MEDIA_NAME}`))
      interrupt("binary-delete")
    if (String(file).startsWith(quarantineRoot + path.sep))
      interrupt("quarantine-cleanup")
    if (String(file).endsWith(".media-journal.json"))
      interrupt("journal-cleanup")
  }

  if (boundary.startsWith("quiz-")) {
    const original = processFixtureState(root).shows["show-a"]
    const targetBase = {
      ...original.base,
      subject: "Interrupted composite V2 save",
    }
    const targetExtras = {
      ...original.extras,
      authoring: { showNote: "Interrupted metadata" },
      baseDigest: computeCanonicalBaseDigest(targetBase),
    }
    const service = new CompositeStorageService({
      getPath,
      getQuizzById: (id) => JSON.parse(fs.readFileSync(basePath(id), "utf8")),
      saveQuizz: () => {
        throw new Error("Creation is not part of this fixture")
      },
      updateQuizz: (id, data) => {
        fs.writeFileSync(basePath(id), JSON.stringify(data))
        return { id }
      },
      deleteQuizz: (id) => {
        fs.unlinkSync(basePath(id))
      },
    })
    service.saveCompositeQuiz({
      quizId: "show-a",
      expectedRevision: 1,
      quizz: targetBase,
      extras: targetExtras,
    })
  } else {
    executeMediaDeleteTransaction(getPath, PROCESS_MEDIA_NAME, {
      detach: true,
      deleteMediaFn: () =>
        fs.unlinkSync(getPath(`media/${PROCESS_MEDIA_NAME}`)),
    })
  }
  throw new Error(
    `Requested interruption boundary was never reached: ${boundary}`,
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
