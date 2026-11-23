import fs from "node:fs"
import path from "node:path"
const root = process.argv[2]
const changed = (before, after) =>
  before && after
    ? [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
        (p) => JSON.stringify(before[p]) !== JSON.stringify(after[p]),
      )
    : undefined
const receipts = fs
  .readdirSync(root)
  .filter((f) => f.endsWith(".json"))
  .map((file) => {
    const r = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"))
    return {
      file,
      state: r.state,
      faultActivations: r.activations,
      immediateChangedFiles: changed(r.before, r.immediateAfter),
      runs: r.runs.map((run) => ({
        pid: run.pid,
        processPid: run.process.pid,
        exit: run.process.code,
        timedOut: run.process.timedOut,
        writes: run.writes,
        deletes: run.deletes,
        status: run.report?.status,
        error: run.error,
        changedFiles: changed(r.before, run.state),
      })),
      distinctPids: new Set(r.runs.map((run) => run.pid)).size,
    }
  })
console.log(JSON.stringify({ root, count: receipts.length, receipts }, null, 2))
