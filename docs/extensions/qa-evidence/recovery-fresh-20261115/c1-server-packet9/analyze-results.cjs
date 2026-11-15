const fs = require('node:fs'), assert = require('node:assert/strict')
const result = JSON.parse(fs.readFileSync('/qa/results/startup-owners.results.json'))
assert.equal(result.success, true); assert.equal(result.numTotalTests, 25); assert.equal(result.numPassedTests, 25)
assert.equal(result.numFailedTests, 0); assert.equal(result.numPendingTests, 0)
const live = JSON.parse(fs.readFileSync('/qa/receipts/startup-owners/live-wal.json'))
const closed = JSON.parse(fs.readFileSync('/qa/receipts/startup-owners/clean-closed-wal.json'))
for (const value of [live, closed]) assert.deepEqual(value.before, value.after)
console.log(JSON.stringify({passed:25,sourceNoWriteWitnesses:2,closedWalWithoutSidecars:true,liveWalOwners:live.owners,
 scope:'Synthetic canonical owner snapshot and explicit-root startup; no production or hardware claim'}))
