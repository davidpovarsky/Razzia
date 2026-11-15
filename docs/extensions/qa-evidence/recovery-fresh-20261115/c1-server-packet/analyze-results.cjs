const fs = require("node:fs"), assert = require("node:assert/strict")
const plan = JSON.parse(fs.readFileSync("/inputs/plan.json", "utf8"))
const json = name => JSON.parse(fs.readFileSync("/qa/receipts/" + name + ".json", "utf8"))
const summaries = []
for (const job of plan.tests) {
  const result = JSON.parse(fs.readFileSync("/qa/results/" + job.name + ".results.json", "utf8"))
  assert.equal(result.success, true, job.name)
  assert.equal(result.numTotalTests, job.expectedCases, job.name)
  assert.equal(result.numPassedTests, job.expectedCases, job.name)
  assert.equal(result.numFailedTests, 0, job.name)
  assert.equal(result.numPendingTests, 0, job.name)
  assert.equal(result.numTodoTests ?? 0, 0, job.name)
  summaries.push({ name: job.name, total: result.numTotalTests, passed: result.numPassedTests })
}
const distinct = (...values) => {
  for (const value of values) assert(Number.isSafeInteger(value) && value > 0, "Missing fork/replay PID")
  assert.equal(new Set(values).size, values.length, "Reused fork/replay PID")
}
const replay = (run, expectedCode) => {
  assert.equal(run.pid, run.process.pid)
  assert.equal(run.process.code, expectedCode, run.process.stderr)
  assert.equal(run.process.signal, null)
  assert.equal(run.process.timedOut, false)
}
const publics = state => Object.fromEntries(Object.entries(state).filter(([p]) => p.startsWith("quizz/") || p.startsWith("extensions/quizzes/")))
const checks = []
for (const boundary of ["before-public", "after-sidecar", "before-id-return", "committed-visible", "private-cleanup", "before-slot-removal"]) {
  const receipt = json("native-" + boundary)
  assert.equal(receipt.state, "PASS")
  assert.equal(receipt.interrupted.signal, "SIGKILL")
  assert.equal(receipt.interrupted.timedOut, false)
  // The checkpoint is written by the verified synthetic child immediately
  // before its process.kill(process.pid). Match that PID to its parent's fork
  // result; never target a host PID, guessed process, server or other lane.
  assert.equal(receipt.checkpoint.pid, receipt.interrupted.pid)
  assert.equal(receipt.checkpoint.mode, boundary)
  distinct(receipt.interrupted.pid, ...receipt.runs.map(r => r.pid))
  const committed = ["committed-visible", "private-cleanup", "before-slot-removal"].includes(boundary)
  for (const run of receipt.runs) {
    replay(run, 0)
    assert.deepEqual(publics(run.state), committed ? publics(receipt.checkpoint.state) : receipt.baseline)
  }
  assert.equal(receipt.runs[1].report.recovered, 0)
  checks.push({ boundary, killedOwnChildPid: receipt.interrupted.pid, freshReplayPids: receipt.runs.map(r => r.pid) })
}
const tenant = json("actual-api-tenant-flag-replay")
assert.equal(tenant.state, "PASS")
assert.equal(tenant.interrupted.signal, "SIGKILL")
assert.equal(tenant.interrupted.timedOut, false)
distinct(tenant.interrupted.pid, ...tenant.runs.map(r => r.pid))
for (const run of tenant.runs) { replay(run, 0); assert.deepEqual(run.state, tenant.baseline) }
const privateError = json("review-private-http-errors")
assert.equal(privateError.state, "PASS")
assert.equal(privateError.receipts.length, 4)
for (const receipt of privateError.receipts) {
  assert.equal(receipt.activations, 1)
  assert.match(receipt.allocated, /^[A-Za-z0-9_-]{21}$/u)
  assert.deepEqual(receipt.body, { error: "errors:server.internal" })
  assert.equal(JSON.stringify(receipt.body).includes(receipt.allocated), false)
  assert.equal(Object.keys(publics(receipt.state)).length, 0)
}
for (const name of ["review-absent-base", "review-absent-sidecar", "review-move-active-committed", "review-move-resolved-committed", "review-move-active-empty", "review-move-resolved-empty"]) {
  const receipt = json(name)
  assert.equal(receipt.state, "PASS")
  assert.equal(receipt.interrupted.signal, "SIGKILL")
  assert.equal(receipt.interrupted.timedOut, false)
  assert.equal(receipt.checkpoint.pid, receipt.interrupted.pid)
  distinct(receipt.interrupted.pid, ...receipt.failed.map(r => r.pid), ...receipt.recovered.map(r => r.pid))
  for (const run of receipt.failed) { replay(run, 2); assert(run.faultActivations > 0) }
  for (const run of receipt.recovered) replay(run, 0)
  assert.equal(receipt.recovered[1].report.recovered, 0)
}
for (const fault of ["base-replacement", "sidecar-in-place", "missing-witness", "newer-intent"]) {
  const receipt = json("proof-" + fault)
  assert.equal(receipt.state, "PASS")
  assert.equal(receipt.interrupted.signal, "SIGKILL")
  assert.equal(receipt.interrupted.timedOut, false)
  distinct(receipt.interrupted.pid, ...receipt.runs.map(r => r.pid))
  for (const run of receipt.runs) { replay(run, 2); assert.deepEqual(run.state, receipt.before) }
}
for (const name of ["failed-intent-fence", "enhanced-sidecar-race", "qualified-external-interference"]) {
  const receipt = json(name)
  assert.equal(receipt.state, "PASS")
  for (const run of receipt.runs) { replay(run, 2); assert.deepEqual(run.state, receipt.before) }
}
const warm = json("warm-visible-commit")
assert.equal(warm.state, "PASS")
for (const run of warm.blocked) { replay(run, 2); assert.deepEqual(run.state, warm.before) }
for (const run of warm.runs) { replay(run, 0); assert.deepEqual(publics(run.state), publics(warm.before)) }
assert.equal(summaries.reduce((n, v) => n + v.passed, 0), 48)
console.log(JSON.stringify({ sourceCommit: plan.sourceCommit, passed: 48, summaries, sixOwnedChildKillBoundaries: checks, originalR2Result: "813 PASS / 6 FAIL unchanged", qualification: "Persistent synthetic filesystem plus process interruption only; no hardware power-cut, B/all-writer exclusion or production acceptance" }, null, 2))
