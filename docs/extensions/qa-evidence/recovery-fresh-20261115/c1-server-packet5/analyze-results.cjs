const fs = require('node:fs'), assert = require('node:assert/strict')
const plan = JSON.parse(fs.readFileSync('/inputs/plan.json', 'utf8'))
const json = (group, name) => JSON.parse(fs.readFileSync(`/qa/receipts/${group}/${name}.json`, 'utf8'))
const distinct = (...ids) => { ids.forEach(id => assert(Number.isSafeInteger(id) && id > 0)); assert.equal(new Set(ids).size, ids.length) }
const replay = run => { assert.equal(run.pid, run.process.pid); assert.equal(run.process.code, 0, run.process.stderr); assert.equal(run.process.signal, null); assert.equal(run.process.timedOut, false) }
const publics = state => Object.fromEntries(Object.entries(state).filter(([key]) => key.startsWith('quizz/') || key.startsWith('extensions/quizzes/')))
const summaries = []
for (const job of plan.tests) {
  const result = JSON.parse(fs.readFileSync(`/qa/results/${job.name}.results.json`, 'utf8'))
  assert.equal(result.success, true)
  assert.equal(result.numTotalTests, 11)
  assert.equal(result.numPassedTests, job.expectedPassed)
  assert.equal(result.numFailedTests, 0)
  assert.equal(result.numPendingTests, job.expectedPending)
  const tenant = json(job.name, 'actual-api-tenant-flag-replay')
  assert.equal(tenant.state, 'PASS')
  assert.equal(tenant.interrupted.signal, 'SIGKILL')
  assert.equal(tenant.interrupted.timedOut, false)
  distinct(tenant.interrupted.pid, ...tenant.runs.map(run => run.pid))
  for (const run of tenant.runs) { replay(run); assert.deepEqual(run.state, tenant.baseline) }
  summaries.push({ name: job.name, passed: result.numPassedTests, explicitlyDeselected: result.numPendingTests })
}
const checks = []
for (const boundary of ['before-public', 'after-sidecar', 'before-id-return', 'committed-visible', 'private-cleanup', 'before-slot-removal']) {
  const receipt = json('actual-native', 'native-' + boundary)
  assert.equal(receipt.state, 'PASS')
  assert.equal(receipt.interrupted.signal, 'SIGKILL')
  assert.equal(receipt.interrupted.timedOut, false)
  assert.equal(receipt.checkpoint.pid, receipt.interrupted.pid)
  assert.equal(receipt.checkpoint.mode, boundary)
  distinct(receipt.interrupted.pid, ...receipt.runs.map(run => run.pid))
  const committed = ['committed-visible', 'private-cleanup', 'before-slot-removal'].includes(boundary)
  for (const run of receipt.runs) { replay(run); assert.deepEqual(publics(run.state), committed ? publics(receipt.checkpoint.state) : receipt.baseline) }
  assert.equal(receipt.runs[1].report.recovered, 0)
  checks.push({ boundary, killedPid: receipt.interrupted.pid, replayPids: receipt.runs.map(run => run.pid) })
}
const http = json('actual-native', 'review-private-http-errors')
assert.equal(http.state, 'PASS'); assert.equal(http.receipts.length, 4)
for (const receipt of http.receipts) { assert.equal(receipt.activations, 1); assert.deepEqual(receipt.body, { error: 'errors:server.internal' }); assert(!JSON.stringify(receipt.body).includes(receipt.allocated)); assert.deepEqual(publics(receipt.state), {}) }
console.log(JSON.stringify({ applicationSource: plan.sourceCommit, nodeObserver: plan.observerCommit, summaries, nativeKillChecks: checks, old37: { passed: 37, profile: 'OLD packet2 evidence only; not rerun' }, originalTrial: '41 PASS / 7 FAIL unchanged', result: 'One selected witness plus 11 native cases passed; not a new 48-case run', qualification: 'Cooperating-writer scope only; no B/F1/hardware/production adoption' }, null, 2))
