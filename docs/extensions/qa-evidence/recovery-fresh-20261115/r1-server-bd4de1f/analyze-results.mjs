// Offline receipt analysis, not a new runtime test or an assertion change.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"

const directory = path.dirname(fileURLToPath(import.meta.url))
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"))
const receipts = fs.readFileSync(path.join(directory, "receipt-sha256.txt"), "utf8").trim().split("\n").map((line) => {
  const [, sha256, source] = line.match(/^([a-f0-9]{64})  (.+)$/)
  const relative = source.split("/").slice(-2).join("/")
  if (hash(fs.readFileSync(path.join(directory, relative))) !== sha256) throw new Error(`Receipt copy differs: ${relative}`)
  return { path: relative, sha256 }
})
const v2 = ["quiz-base-write", "quiz-sidecar-write"].map((name) => {
  const r = read(`process-v2/${name}.json`)
  const pids = [r.interrupted.pid, r.recovery1Process.pid, r.recovery2Process.pid]
  if (r.state !== "PASS" || r.interrupted.signal !== "SIGKILL" || new Set(pids).size !== 3 || !isDeepStrictEqual(r.recovery1.state, r.recovery2.state)) throw new Error(`V2 result mismatch: ${name}`)
  return { name, state: r.state, pids, signal: r.interrupted.signal, firstStatus: r.recovery1.report.status, secondStatus: r.recovery2.report.status }
})
const bindings = ["media", "quiz-base", "quiz-sidecar", "media-foreign", "quiz-foreign", "media-sidecar-only"].map((name) => {
  const r = read(`native-r1/binding-${name}.json`)
  const pids = [r.interruptedProcess.pid, ...r.recoveries.map((run) => run.pid)]
  if (r.interruptedProcess.signal !== "SIGKILL" || new Set(pids).size !== 3 || r.recoveries.length !== 2 || r.recoveries.some((run) => run.process.timedOut)) throw new Error(`Missing native replay evidence: ${name}`)
  const base = `quizz/${r.actualBaseName}`
  const sidecar = `extensions/quizzes/${r.nativeId}.json`
  const foreign = `quizz/${r.nativeId}.json`
  const unrelated = Object.keys(r.before.files).find((key) => key.startsWith("quizz/") && key !== base && key !== foreign)
  return {
    name, state: r.state, nativeId: r.nativeId, actualBaseName: r.actualBaseName,
    pids, signal: r.interruptedProcess.signal,
    firstFailure: r.error?.split("\n")[0],
    attempts: r.recoveries.map((run) => ({
      pid: run.pid, processExit: run.process.code, error: run.error,
      report: run.report, retainedJournals: run.state.journals.length,
      actualBaseByteEqual: isDeepStrictEqual(r.before.files[base], run.state.files[base]),
      fullV2SidecarByteEqual: isDeepStrictEqual(r.before.files[sidecar], run.state.files[sidecar]),
      mediaBytesEqual: isDeepStrictEqual(r.before.files["media/r1-native.png"], run.state.files["media/r1-native.png"]),
      unrelatedBytesEqual: isDeepStrictEqual(r.before.files[unrelated], run.state.files[unrelated]),
      idlessSentinelStillIdless: !Object.hasOwn(run.state.files["quizz/idless-r1-sentinel.json"].json, "id"),
      idDerivedFileExistedBefore: Object.hasOwn(r.before.files, foreign),
      idDerivedFileExistsAfter: Object.hasOwn(run.state.files, foreign),
      ...(r.before.files[foreign] ? { foreignBytesEqual: isDeepStrictEqual(r.before.files[foreign], run.state.files[foreign]) } : {}),
      changedFiles: [...new Set([...Object.keys(r.before.files), ...Object.keys(run.state.files)])].filter((key) => key !== "quizz/idless-r1-sentinel.json" && !isDeepStrictEqual(r.before.files[key], run.state.files[key])).map((key) => ({
        path: key, beforeSha256: r.before.files[key]?.sha256, afterSha256: run.state.files[key]?.sha256,
        beforeLength: r.before.files[key]?.length, afterLength: run.state.files[key]?.length,
        completeAfterJsonKeys: Object.keys(run.state.files[key]?.json ?? {}),
      })),
    })),
    publicFilesStableAcrossBothAttempts: isDeepStrictEqual(r.recoveries[0].state.files, r.recoveries[1].state.files),
  }
})
const digests = ["ordinary", "stripped"].map((name) => {
  const r = read(`native-r1/logical-digest-${name}.json`)
  return { name, state: r.state, inputDigest: r.inputDigest, normalizedLogicalDigest: r.normalizedLogicalDigest,
    ownershipBytesSha256: r.ownershipBytesSha256, storedRecordCanonicalDigest: r.storedRecordCanonicalDigest,
    createDigest: r.created.baseDigest, getDigest: r.get.baseDigest, getDigestMatches: r.get.digestMatches,
    exportExtrasDigest: r.exported.extras.baseDigest }
})
const baseline = read("native-r1/native-stripped-baseline.json")
const result = {
  kind: "offline-producer-run-receipt-analysis",
  executedCommit: "bd4de1fb9b94548973c79f2f710bbec7f438e3e2",
  rawReceiptsMatchedToServerHashes: receipts,
  runtime: { processV2Exit: Number(fs.readFileSync(path.join(directory, "process-v2.exit"))), nativeExit: Number(fs.readFileSync(path.join(directory, "native-r1.exit"))), nativePassed: 2, nativeFailed: 7 },
  inputsAfterNative: read("inputs-after-native.json"),
  runnerStopped: read("runner-after-stop.json").Running === false,
  v2, bindings, digests, nativeStrippedFieldBaseline: baseline,
  limits: ["Synthetic accounts-disabled fixtures only", "Producer-run, no independent acceptance yet", "No fsync/power-loss proof", "No production changes or full-suite rerun"],
}
fs.writeFileSync(path.join(directory, "analysis.json"), JSON.stringify(result, null, 2) + "\n")
process.stdout.write(JSON.stringify({ copiedReceipts: receipts.length, v2Passed: v2.length, nativePassed: 2, nativeFailed: 7, runnerStopped: result.runnerStopped }) + "\n")
