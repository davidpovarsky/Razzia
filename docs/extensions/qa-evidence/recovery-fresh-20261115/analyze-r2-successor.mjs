import fs from "node:fs"
import path from "node:path"
import { isDeepStrictEqual as equal } from "node:util"
const directory = process.argv[2]
const focusedOnly = process.argv.includes("--focused")
const read = (relative) =>
  JSON.parse(fs.readFileSync(path.join(directory, relative), "utf8"))
const files = (subdir) =>
  fs.readdirSync(path.join(directory, subdir)).filter((f) => f.endsWith(".json"))
const requireProof = (condition, name) => {
  if (!condition) throw new Error(`Incomplete proof: ${name}`)
}
const processProofs = files("process-r2").map((file) => {
  const r = read(`process-r2/${file}`)
  const pids = [r.interrupted.pid, r.recovery1Process.pid, r.recovery2Process.pid]
  requireProof(
    r.state === "PASS" &&
      r.interrupted.signal === "SIGKILL" &&
      new Set(pids).size === 3 &&
      equal(r.recovery1.state, r.recovery2.state),
    file,
  )
  return { file, pids, state: r.state, signal: r.interrupted.signal }
})
const nativeProofs = files("native-r2").map((file) => {
  const r = read(`native-r2/${file}`)
  if (r.state) requireProof(r.state === "PASS", file)
  const runs = r.recoveries
  const pids = runs?.map((run) => run.pid)
  if (runs) {
    requireProof(
      runs.length === 2 &&
        new Set(pids).size === 2 &&
        runs.every((run) => !run.process.timedOut),
      file,
    )
  }
  if (file.startsWith("r2-ownership-"))
    requireProof(
      r.interrupted.signal === "SIGKILL" &&
        !r.interrupted.timedOut &&
        new Set([r.interrupted.pid, ...pids]).size === 3 &&
        runs.every(
          (run) => run.process.code === 2 && equal(run.state, r.beforeRecovery),
        ),
      file,
    )
  if (file.startsWith("binding-"))
    requireProof(
      r.interruptedProcess.signal === "SIGKILL" &&
        !r.interruptedProcess.timedOut &&
        new Set([r.interruptedProcess.pid, ...pids]).size === 3 &&
        runs.every((run) => run.process.code === 0),
      file,
    )
  return { file, state: r.state, pids, exits: runs?.map((run) => run.process.code) }
})
const reviewProofs = files("review-after").map((file) => {
  const r = read(`review-after/${file}`)
  requireProof(
    r.state === "PASS" &&
      r.runs.length === 2 &&
      new Set(r.runs.map((run) => run.pid)).size === 2 &&
      r.runs.every(
        (run) => !run.process.timedOut && run.pid === run.process.pid,
      ),
    file,
  )
  if (r.before) {
    for (const run of r.runs)
      if (r.name !== "string-foreign-positive")
        requireProof(
          run.process.code === 2 && equal(run.state, r.before),
          file,
        )
  }
  if (file.startsWith("ambiguous-") || file === "missing-nonnull-sidecar.json")
    requireProof(
      r.runs.every((run) => run.writes === 0 && run.deletes === 0),
      file,
    )
  if (file.startsWith("private-"))
    requireProof(
      r.activations === 1 && equal(r.before, r.immediateAfter),
      file,
    )
  return {
    file,
    state: r.state,
    pids: r.runs.map((run) => run.pid),
    exits: r.runs.map((run) => run.process.code),
    callbacks: r.runs.map((run) => ({ writes: run.writes, deletes: run.deletes })),
  }
})
const names = [
  "review-after",
  "native-r2",
  "process-r2",
  "original-focused-r2",
  "types-r2",
  "format-r2",
  "freeze-r2",
  ...(focusedOnly ? [] : ["extensions-full", "socket-build", "root-socket-targeted"]),
]
const exits = Object.fromEntries(
  names.map((name) => [name, fs.readFileSync(path.join(directory, `${name}.exit`), "utf8").trim()]),
)
requireProof(
  Object.entries(exits).every(([name, exit]) => exit === "0" || (focusedOnly && name === "original-focused-r2")),
  "command exits other than explicitly retained original focused failures",
)
const runner = read("runner-identity.json")
requireProof(
  runner.HostConfig.NanoCpus === 250000000 &&
    runner.HostConfig.Memory === 2147483648 &&
    runner.HostConfig.ReadonlyRootfs === true &&
    runner.HostConfig.NetworkMode === "none" &&
    read("runner-after-stop.json").state.Running === false,
  "isolated runner/stopped",
)
requireProof(
  processProofs.length === 10 && nativeProofs.length === 35 && reviewProofs.length === 14,
  "receipt counts",
)
const inputChecks = fs.readdirSync(directory).filter((f) => /^(base|merged)-.*\.json$/.test(f))
for (const file of inputChecks) requireProof(read(file).mismatches.length === 0, file)
console.log(JSON.stringify({
  kind: "producer-runtime-receipt-analysis",
  executedCommit: read("staged-manifest.json").commit,
  exits,
  unresolvedFailedCommands: Object.entries(exits).filter(([, exit]) => exit !== "0").map(([name]) => name),
  broadRun: !focusedOnly,
  rawReceipts: nativeProofs.length + processProofs.length + reviewProofs.length,
  processProofs,
  nativeProofs,
  reviewProofs,
  inputChecks,
  source: read("merged-final.json"),
  retainedPriorSource: read("base-final.json"),
  resources: read("resources-final.json"),
  runnerStopped: true,
}, null, 2))
