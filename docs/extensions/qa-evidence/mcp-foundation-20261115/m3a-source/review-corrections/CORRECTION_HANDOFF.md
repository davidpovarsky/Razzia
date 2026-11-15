# M3A review corrections prepared — runtime not granted

15 November 2026. Product candidate c3226b6683c4d12b45fd553e090928092e1881b9
in the owned tadazz-hq-mcp-20261115 worktree. This is a source-only correction
handoff, not acceptance of the corrected adapter. Independent review remains
CHANGES REQUIRED until its corrections and focused witnesses are accepted.
Original ad895 product, e199 producer evidence and immutable review are preserved.

## Corrected behavior

Existing schema1 admission now binds the exact ordered sqlite_schema object
definitions and explicitly checks columns, PK positions, nullability/defaults,
unique PK indexes and index key order/collation/direction. The expected set has
four tables and three implicit indexes. Any trigger/view/additional object or
different DDL fails closed. No normalization, migration, repair or GET creation.
The captured old-producer DDL, independent golden fixture and creation manifest
match byte-for-byte in the static source extraction. Actual SQLite compatibility
remains a required runtime witness.

The request signal is checked at entry, after awaited authentication/body work,
before private store operations and before disclosure. Pending authentication
is still awaited; no Promise race releases its lifetime early. A postcommit
abort can deny disclosure while committed rows remain. This does not interrupt
blocking SQLite or make separate account/draft revocation linearizable.

The old rollback test now injects an actual audit-prepare failure after observing
draft and operation inserts inside the transaction, rather than adding a trigger
which the new schema admission correctly rejects. Eight new tests cover frozen
producer compatibility, missing operations PK, missing native NULL CHECK,
unexpected mutating trigger/view/index, post-body and principal-handoff aborts,
and honest postcommit behavior. They use actual JWT verification and synthetic
accounts; no production test hook or fake valid-token result was added.

## Exact inputs

- Candidate source commit: c3226b6683c4d12b45fd553e090928092e1881b9.
- Baseline product: ad8955327a56213b3a437379fcc7ccc6e05a261a.
- Baseline150 manifest: d758084a11829061530a123dfdc6e371396b348196392dd8b8893b8e33303d4c.
- Corrected155 manifest SHA256: f38c1f13b01ddfd8e20e10b3015d1b5beb2fa28ed72f08e57e34f0591fdd5341.
- Delta11 files,57367 uncompressed bytes; gzip25824 bytes SHA256:
  12e5399145c0017dbd453d014235a6bdf08787ed9a6f8529167714b487e0a3af.
- Schema object fingerprint: b23f8155290acc986cfbec7f4129f39342c11a6d8f793b18973d76ab3296ae6b.
- Unchanged private lock: e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838.
- Immutable independent review: 8642a566699f6e96a0f5474414f8bca3a6e76d56e3be66636c6a648428a47a1e.

Apply candidate-source-overlay.tar.gz only on the verified original150-input
producer tree. The archive contains regular app/ source members and the complete
candidate-input-manifest.json. Check every155 byte count/hash after assembly;
do not import stale-image app files or change dependencies to make it run.

## Actual source-only checks

prepare-inputs.py exit0:602 protected files unchanged, frozen SDK/server/contracts/
tests-server unchanged, private package/lock/tsconfig unchanged, root lock
unchanged, no unleased paths and no parent Vitest test-name intersection.
Golden DDL statically equals the original ad895 source and current manifest.
check-syntax.py exit0:10 changed TS files parsed with local Node22.17.0
--experimental-transform-types --check, without importing the application.
This is syntax evidence, not the required Node24.22.2 runtime or TypeScript check.
Scoped staged whitespace check exit0.

The unmodified raw freeze guard remains FAIL exit1 on51 leased module paths,
mismatches[]. No guard/policy edit or waiver. Current inspection is recorded in
preparation-summary.json; the retained static-attempt-01/static-inspection and
provisional uncommitted manifest are historical failed/provisional preparations.
No failed receipt is replaced with a successful claim.

Functional tests, full private typecheck and scoped formatter: NOT_RUN.
An installed formatter was absent in the checked local locations; no package
install, app test, SQLite execution, server job or resource reservation occurred.
The prior ad895 producer26 and SDK41 passes apply only to their recorded source.

## Bounded follow-up awaiting Root capacity binding

Proposed one network-none/portless job:0.25CPU/2GiB, <=8MiB additional physical
disk, <=256MiB own installed modules in RAM. Use the same verified read-only
cache, metadata keeper and Node24.22.2/pnpm12.18.0 image; do not duplicate the
shared metadata or alter the pinned cache index. No active compute grant exists.
One ordinary frozen offline bootstrap is needed only if the previous ephemeral
graph is gone; no lock resolution or lock/metadata change is authorized.

After Root binds capacity, preserve first exits/raw logs and run once:

    pnpm --dir extensions/src/mcp-app typecheck
    pnpm --dir extensions/src/mcp-app test:first-party

The script selects exactly six nodecheck files: auth, filesystem, http, store,
schema and abort;34 declared tests, existing26 plus8 new. The harness must set
MCP_SYNTHETIC_REVIEW_EVIDENCE=/evidence/review-witnesses to retain raw rejected
SQLite before/after files and abort observations before fixture teardown.
Capture private-family/native snapshots separately from auth WAL/SHM. Apply
bounded evidence/stdout limits within the additional disk cap. Formatting and
source/lease checks must run against the same exact candidate bytes; a format
change creates a new source candidate and requires refreshed identity receipts.

Do not rerun SDK41: verify its unchanged source/package/lock/runtime/cache proof
and reuse its actual attempt03 result. No syscall zero-write proof is inferred
from snapshots or notifications; the prior stage had no strace.

All original MCP02–05 implementation tasks remain OPEN. Host OAuth/private
grants, actual client integration, renderer, C1/native publication, R2/download,
mount and release gates remain open. OAuth dependency planning stays deferred
until the review corrections are resolved. No push, merge, deployment or real
account/provider/credential action is authorized by this handoff.
