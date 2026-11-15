# Theme installation timeout — bounded public-step trace proposal

15 November 2026. NOT RUN; requires a new explicit scoped server grant. Existing
819-case full result remains 813 PASS / 6 FAIL. Its five route fixture failures
were separately followed by 5/5 original route tests; the full FAIL is retained.
The installation case remains an original 30000ms timeout in full and isolated
runs. No source/test/timeout/PRAGMA/budget change is proposed as a diagnostic.

## One diagnostic run, not a blind third repeat

Run a new, separately owned instrumentation test that reproduces ONLY the first
case's public call/assertion sequence using actual installation.ts, actual
installation.fixture.ts and original Vitest expect. It is diagnostic evidence,
not a replacement PASS for installation.test.ts. Existing tests/source are RO.
Keep testTimeout=30000 and the same image/dependency files, .25CPU/2GiB, network
none and original fixture sizes. Do not raise CPU or timeout to make it pass.

Use the existing immutable 991 source/dependency fixture and a tiny new test
bind overlay only; no clone/install/pull/archive/full suite. Fresh disk gate and
scratch/output budget must be approved by root at run time. A single owned
scratch database directory is used; no customer/source DB or other job changes.
The original test is not edited, mocked, skipped or substituted in acceptance.

Every marker prints a small JSON line to stdout with START/END/THROW, monotonically
increasing step number, wall timestamp, hrtime delta, process.cpuUsage delta,
RSS/heap and process.resourceUsage I/O/context-switch counters. Never print
buffers, signing keys, manifests or data rows. Keep <=64KiB trace output.

A wrapper calls the exact supplied synchronous function once, records END and
returns its original result; on error records THROW and rethrows. Expected
errors are still asserted with the original toThrow semantics. Do not patch
SQLite, class internals, global fs/prototypes, Zod or the matcher. Split only
nested expressions into equivalent local values for measurement.

## Required markers in order

1. Actual tmpdir(), chosen DB path, PID, image/tool hashes and buffer lengths;
   record the actual filesystem/mount, not just Docker's /tmp configuration.
2. main constructor, fixture-v1 construction, draft-v1, upload-picture-v1,
   upload-sound-v1, validate-v1; catalog-empty, preview-v1, expected unstaged
   publish denial.
3. request-review-v1, details/approval receipt-v1, approve-v1, stage-v1,
   publish-v1, other-tenant empty catalog.
4. **readAsset published picture** into a local variable, then separately
   **expect(bytes).toEqual(picture)**. Preserve the exact matcher and bytes.
   This split is the highest-information boundary: the original nests them at
   installation.test.ts:102 and cannot identify which consumed time.
5. fixture-v2 construction, draft/upload-picture/upload-sound/validate-v2,
   request-review/details/approve/stage/publish-v2, active lookup.
6. reopened constructor while main store stays open (as in original); catalog
   two versions, rollback publish, active, availableVersions, catalog again,
   audit-log assertion; duplicate fixture creation/expected immutable draft
   denial and immutable upload denial.
7. BODY_COMPLETE sentinel before the callback returns. Trace close/reopened,
   close/main and scratch cleanup separately as teardown, not body work.

About 45 bounded labels are enough; instrumenting every SQL byte or source
schema property would confound the measurement and is not authorized here.
An outer parent watchdog may terminate ONLY its own stuck worker after a small
approved cleanup window (e.g.45s), keeping the actual test timeout30000 unchanged.
A killed/incomplete trace is not PASS. Retain the final START without END and
all source hashes. Do not delete failed scratch evidence before recording it.

## Parent counters and decision rule

Read the owned worker/cgroup counters at start/end and at a bounded <=1Hz:
cpu.stat (usage/throttled intervals), memory peak/OOM, /proc/PID/io and context
switches. These are observations, not configuration changes. Existing disk
resource receipts contain free/new bytes only, not CPU/SQLite latency proof.

- If the byte matcher dominates wall time and worker user CPU/heap/GC pressure,
  while surrounding store calls are short, the assertion-cost hypothesis is
  supported. If BODY_COMPLETE appears before Vitest reports its deadline,
  this was cumulative synchronous overrun rather than a still-blocked method.
- If write/constructor calls dominate with low CPU, verify actual tmpdir/mount
  and I/O/lock evidence. Only then propose an optional preinstalled syscall
  trace of the same single sequence (fsync/fdatasync/fcntl/open/write), under
  another explicit bound. FULL or a 3s-looking interval alone proves neither
  storage latency nor a SQLite busy lock.
- If a step never ends, preserve PID/native error/counters and last marker.
  Distinguish matcher/JS loop/native wait before proposing a fix. No inferred
  R2 regression from an unrelated full-suite failure.
- If the trace remains inconclusive, request one isolated matcher-only profile
  using Buffer.from(the real picture), the SAME expect.toEqual and original
  30000ms limit. This is a no-database negative control, not a smaller/fake asset
  or an acceptance replacement. Do not run it automatically as another repeat.

No 8a43 timed baseline exists in the inspected evidence. Source closure and
lockfiles are byte-identical to 991, so first measure the specific interval;
do not rebuild/clone/re-run819 to learn the same static identity fact. Any
later runtime baseline must preserve exact image/dependencies/CPU/filesystem.

If a matcher cause is actually measured, the owner can separately consider a
native byte-for-byte comparison plus explicit length check. This report does
not change the assertion, propose weaker content/hash-only equality, grant an
installation/test lease or permit a timeout increase. Record any later fix and
original-budget original-test validation independently. Pins remain zero.
