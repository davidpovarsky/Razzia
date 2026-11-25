# Extension gate fixture alignment — 2026-11-18

## Authorized scope before editing

The parent assigned five failures from extensions-unit-final.log after the
integrated editor work. Only two test files will change; runtime authorization,
canonical digest calculation, storage recovery, and test configuration stay intact.

- p0-telephony-roster.test.ts: configure an isolated pilot secret and send it only
  to the pilot endpoint; send the matching caller phone with roster-bound answers.
  Retain unknown-caller rejection, phone privacy, 100-caller scoring, 15-caller
  redial identity/score preservation, duplicate rejection, and host counts.
- storage/process-interruption.test.ts: construct the expected media-detached
  base independently, compute its canonical digest for the expected sidecar, and
  retain complete object equality, fresh child processes, unresolved-count checks,
  unrelated-file preservation, cleanup, and second-recovery idempotence.

Production detach updates a valid matching sidecar digest when base media changes.
The previous expected sidecar retained the original digest, causing three failures.

## Verification

Explicit Windows Node 24.22.1 and Vitest 5.0.3: both focused files PASS, 12/12
tests, 37.93 seconds, exit 0. Command from extensions: `node
../node_modules/vitest/vitest.mjs run src/server/p0-telephony-roster.test.ts
src/server/storage/process-interruption.test.ts --maxWorkers=2`.
Evidence: extension-gate-fixtures.log and ten JSON receipts in
extension-process-fixture-receipts. All ten abrupt process interruptions and
two fresh-process recovery replays per boundary passed. This Windows run uses
abrupt exit 86, not SIGKILL or hardware power-loss simulation.
Prettier reports both files unchanged; scoped git diff --check passes.
