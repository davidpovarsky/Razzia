// Offline analysis of immutable first-candidate receipts; no new runtime tests.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
const directory = path.dirname(fileURLToPath(import.meta.url))
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const read = (relative) => JSON.parse(fs.readFileSync(path.join(directory, relative), "utf8"))
const receiptFiles = fs.readFileSync(path.join(directory, "receipt-sha256.txt"), "utf8").trim().split("\n").map((line) => {
  const [, sha256, source] = line.match(/^([a-f0-9]{64})  (.+)$/)
  const relative = source.split("/").slice(-2).join("/")
  if (hash(fs.readFileSync(path.join(directory, relative))) !== sha256) throw new Error(`Raw receipt mismatch: ${relative}`)
  return { path: relative, sha256 }
})
const processes = receiptFiles.filter((file) => file.path.startsWith("process-r2/")).map((file) => {
  const r = read(file.path)
  const pids = [r.interrupted.pid, r.recovery1Process.pid, r.recovery2Process.pid]
  if (r.state !== "PASS" || r.interrupted.signal !== "SIGKILL" || new Set(pids).size !== 3 || !isDeepStrictEqual(r.recovery1.state, r.recovery2.state)) throw new Error(`Process proof incomplete: ${file.path}`)
  return { path: file.path, state: r.state, pids, signal: r.interrupted.signal, firstStatus: r.recovery1.report.status, secondStatus: r.recovery2.report.status }
})
const bindings = receiptFiles.filter((file) => file.path.startsWith("native-r2/binding-")).map((file) => {
  const r = read(file.path)
  const pids = [r.interruptedProcess.pid, ...r.recoveries.map((run) => run.pid)]
  if (r.state !== "PASS" || r.interruptedProcess.signal !== "SIGKILL" || r.interruptedProcess.timedOut || new Set(pids).size !== 3 || r.recoveries.length !== 2 || r.recoveries.some((run) => run.process.code !== 0 || run.process.timedOut)) throw new Error(`Native binding proof incomplete: ${file.path}`)
  return { path: file.path, state: r.state, pids, nativeId: r.nativeId, actualBaseName: r.actualBaseName, startupExits: r.recoveries.map((run) => run.process.code), finalStatus: r.recoveries[1].report.status }
})
const negatives = receiptFiles.filter((file) => file.path.startsWith("native-r2/r2-ownership-")).map((file) => {
  const r = read(file.path)
  const pids = [r.interrupted.pid, ...r.recoveries.map((run) => run.pid)]
  if (r.state !== "PASS" || r.interrupted.signal !== "SIGKILL" || r.interrupted.timedOut || new Set(pids).size !== 3 || r.recoveries.length !== 2 || r.recoveries.some((run) => run.process.code !== 2 || !isDeepStrictEqual(run.state, r.beforeRecovery))) throw new Error(`Ownership preservation incomplete: ${file.path}`)
  return { path: file.path, state: r.state, pids, startupExits: r.recoveries.map((run) => run.process.code), completePublicAndJournalStatesUnchanged: true }
})
const afterId = ["create", "import"].map((operation) => {
  const r = read(`native-r2/r2-after-id-${operation}.json`)
  const pids = [r.interrupted.pid, ...r.recoveries.map((run) => run.pid)]
  if (r.state !== "PASS" || r.interrupted.signal !== "SIGKILL" || r.interrupted.timedOut || new Set(pids).size !== 3 || r.recoveries.some((run) => run.process.code !== 0)) throw new Error(`Post-ID proof incomplete: ${operation}`)
  return { operation, state: r.state, pids, journalVersion: r.staged.journals[0].entry.version, finalStatus: r.recoveries[1].report.status }
})
const binary = read("native-r2/r2-binary-rollback-copy-failure.json")
if (binary.state !== "PASS" || binary.result.allowed !== false || binary.failedRollback.journals.length !== 1 || binary.failedRollback.files["media/r1-native.png"] || binary.recoveries.some((run) => run.process.code !== 0)) throw new Error("Actual binary rollback failure proof incomplete")
const denial = read("native-r2/sidecar-only-preflight-r2.json")
if (denial.result.allowed !== false || !isDeepStrictEqual(denial.before, denial.after) || !isDeepStrictEqual(denial.beforeTree, denial.afterTree)) throw new Error("Sidecar-only preflight mutated data")
const logical = ["ordinary", "stripped"].map((name) => {
  const r = read(`native-r2/logical-digest-${name}.json`)
  if (r.state !== "PASS" || !r.get.digestMatches || new Set([r.normalizedLogicalDigest, r.created.baseDigest, r.get.baseDigest, r.exported.extras.baseDigest]).size !== 1) throw new Error(`Logical chain disagrees: ${name}`)
  return { name, state: r.state, logicalDigest: r.get.baseDigest, ownershipBytesSha256: r.ownershipBytesSha256 }
})
const result = {
  kind: "offline-analysis-of-producer-run-first-candidate",
  executedCommit: "9593f24f287f2e404f387f6359e89453cd8a971e",
  counts: { nativeAndPackagePassed: 32, processPassed: 10, originalFocusedPassed: 77, originalFocusedFailed: 8 },
  exactExits: Object.fromEntries(["native-r2", "process-r2", "original-focused-r2", "types-r2", "format-r2", "freeze-r2"].map((name) => [name, Number(fs.readFileSync(path.join(directory, `${name}.exit`)))])),
  rawReceiptHashesMatched: receiptFiles, processes, bindings, negatives, afterId, logical,
  sidecarOnlyPreflightNoMutation: true,
  binaryRollback: { state: binary.state, deniedBeforeReferences: true, journalAndLastCopyRetained: true, subsequentStartupExits: binary.recoveries.map((run) => run.process.code) },
  sourceInputs: read("inputs-after-checks.json"), auxiliaryInputs: read("freeze-aux-after.json"),
  runnerStopped: read("runner-after-stop.json").Running === false,
  limits: ["Eight original-focused failures remain; no broader run", "Producer proof, not independent acceptance", "Generic callback V1 does not establish pre-crash inode ownership", "No fsync, tenant/auth, whole-writer quiescence or release claim"],
}
if (receiptFiles.length !== 41 || processes.length !== 10 || bindings.length !== 5 || negatives.length !== 11) throw new Error("Unexpected raw receipt count")
fs.writeFileSync(path.join(directory, "analysis.json"), JSON.stringify(result, null, 2) + "\n")
process.stdout.write(JSON.stringify({ rawReceipts: receiptFiles.length, processProofs: processes.length, nativeBindings: bindings.length, ownershipNegatives: negatives.length, nativeAndPackagePassed: 32, originalFocusedFailed: 8, stopped: result.runnerStopped }) + "\n")
