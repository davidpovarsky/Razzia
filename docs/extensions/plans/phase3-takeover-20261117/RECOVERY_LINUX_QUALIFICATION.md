# Recovery qualification — scoped PASS on real ext4

Immutable source: `60472d05aa14cfdc0fd07b9fe43a003ba42bdd8f`.
Receipt: `tadazz-codex-60472d05aa14-520466ee/receipt.json`.
Existing network-none, no-published-port QA container; Linux arm64 Node24.22.2.
All 1,653 archived file SHA256 values matched before and after the run.

Actual results: case5 PASS (3.027s); full8 PASS (64.559s); recovery TypeScript,
six-file lint and configured format PASS. Fixture statfs is `0xef53`, ext4.

The run exercised six C1 process-loss checkpoints and fresh replay with a tenant
B sentinel, native operation idempotency/conflicts/corruption refusal, rev2→3
save and media-delete SIGKILL recovery, checksummed disposable backup capture,
tamper refusal, restore/rollback, traversal/symlink/corrupt WAL negatives, and
the three raw-V2/media-digest invariants. No customer mount or production data
was used. Hardware power loss and production backup/restore remain unverified.

This closes the previously unrun f6fc339 matcher qualification against the
takeover's guarded runtime, including the stronger foreign storage-ID check.
It is not the final combined-source matrix, human consent/browser acceptance,
full-show Widget, installed-host acceptance or a production deployment.

Two earlier controller setup failures are retained alongside the successful
receipt. They did not execute product tests and are not counted as passes.
