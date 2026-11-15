const fs = require('node:fs'), assert = require('node:assert/strict')
const result = JSON.parse(fs.readFileSync('/qa/results/failed-startup-witness.results.json'))
assert.equal(result.success, true)
assert.equal(result.numTotalTests, 11)
assert.equal(result.numPassedTests, 1)
assert.equal(result.numFailedTests, 0)
assert.equal(result.numPendingTests, 10)
const receipt = JSON.parse(fs.readFileSync('/qa/receipts/failed-startup-witness/actual-api-tenant-flag-replay.json'))
assert.equal(receipt.state, 'PASS')
assert.equal(receipt.interrupted.signal, 'SIGKILL')
assert.equal(receipt.interrupted.timedOut, false)
const pids = [receipt.interrupted.pid, ...receipt.runs.map(run => run.pid)]
assert.equal(new Set(pids).size, 3)
for (const run of receipt.runs) {
  assert.equal(run.pid, run.process.pid)
  assert.equal(run.process.code, 0)
  assert.equal(run.process.timedOut, false)
  assert.deepEqual(run.state, receipt.baseline)
}
console.log(JSON.stringify({diagnosticOnly: true, scheduler: 'GOMAXPROCS unset', selectedPassed: 1,
 explicitlyDeselected: 10, witnessPids: pids, applicationClaim: 'No new native11 or 48-case result'}))
