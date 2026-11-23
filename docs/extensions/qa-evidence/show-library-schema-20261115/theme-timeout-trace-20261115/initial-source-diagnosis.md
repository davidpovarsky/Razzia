# Theme installation timeout — independent read-only source diagnosis

15 November 2026. show_engine `01a1dd19-5220-70d3-8349-e9e135399b4d`.
**Cause is not yet runtime-proven.** A concrete first-case-only matcher hotspot
is a stronger next target than an unmeasured claim of CPU capacity, FULL fsync
or SQLite contention. No existing theme code/test/timeout was changed and no
new profile/test/container was run. Renderer/asset pin work is unrelated; pins 0.

## Existing evidence, unchanged outcome

Frozen recovery source 991f38f216ad265e06aec53313db8928437da248: full 819 result
813 PASS / 6 FAIL. Five route fixture failures were remedied by an owned /fake
scratch bind and 5/5 original route tests passed; that does not rewrite fullFAIL.
Installation first case took 33,095 ms in full and 33,084 ms in isolated original-budget
followup, both failing 30,000 ms. Its other four isolated cases took 208/401/200/399 ms
and passed. No third repeat or timeout increase was performed for this review.

Canonical raw logs/analysis remain at
C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-recovery-fresh-20261115/docs/extensions/qa-evidence/recovery-fresh-20261115/r2-server-991f38f/
(extensions-full.log, followup/theme-installation-original-budget.log and
followup-analysis.json). Source/hash receipt and diagnostic plan are in
C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115/docs/extensions/qa-evidence/show-library-schema-20261115/
(theme-timeout-source-comparison.json, THEME_INSTALLATION_STEP_TRACE_PLAN.md).
These retain exact input evidence hashes; no original receipt was modified.

## Exact source/dependency comparison and R2 closure

27 relevant files are exact Git-blob matches between base
8a43c99c65d8923bd23d8c57ac3607e9a09b5764 and991f38f: installation test/store/fixture/
review, validate-package, theme definition/selection/registry and two manifests,
package protocol/manifest/path helpers, eight locale resources, two actual media
fixtures, Vitest config, root/extensions package manifests and pnpm-lock.yaml.
Per-path Git blobs, SHA256 and sizes are recorded in the comparison JSON.

The 12-node static import graph (test +9 TS runtime modules +2 JSON manifests):

```text
installation.test
  -> installation.fixture -> theme registry -> classic/razzia JSON
  |                         -> theme definition -> selection
  |                                             -> packages/protocol
  |                                                 -> packages/manifest
  |                                                     -> packages/paths + selection
  -> installation -> theme definition + registry + validate-package
                                                    -> theme definition
```

External runtime dependencies are Zod, Vitest and Node builtins. ./review is a
**type-only** ThemePrincipal import; ThemeReviewWorkspace is not called. The
first case does not call validateThemePackage's async filesystem walk; it calls
synchronous validateThemeAssetBytes. R2 storage/service/journal/sidecar/native/
physical-binding code is absent from this runtime import/call closure. The
recovery module diffs therefore do not establish a direct installation path
regression. Full-suite environment interference is not ruled out by static
closure alone, but the isolated failure also occurred without running R2 tests.
No actual timed 8a43 baseline was found; unchanged source is not a historic PASS.

Both logged containers use image
sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647,
0.25 CPU / 2 GiB / network none/read-only root; /tmp is configured tmpfs 128 MiB. The
actual tmpdir() environment was not captured, so do not assert the database was
on host disk or tmpfs without that marker. A read-only SHA check of the executed
immutable9593 dependency fixture verified the exact Vitest 5.0.3 package, matcher
chunk and runner chunk against the inspected local source. This was file reading,
not a new test/container/install. Dependency hashes are in the comparison JSON.

## Concrete first-case-only hotspot

installation.test.ts:102 calls
`expect(store.readAsset(..., true).bytes).toEqual(picture)`.
The actual unchanged picture is **1,976,726 bytes**, blob
3100afcd466c060ea8de1c8d1f41665b897d952b. The MP3 is1,246,763 bytes.
readAsset creates a new Buffer from stored bytes, so this is not same-object
identity. This is the only large-buffer deep-equality assertion in the five cases.

The actual executed matcher chunk index.C4tKZ0yW.js SHA256
82c2b55e5dd5245c0c5e9eccd73fa6d7ade2694644175967e27a28b67932cb9d:

- :1999 toEqual calls equals with iterableEquality; it does not call Buffer.equals.
- :1399/:1452 iterableEquality iterates the Buffer's byte values and compares each.
- :1459 then compares Object.entries(a) and Object.entries(b), unless immutable
  collection sentinels apply. Plain Buffers are not those collections.
- Generic eq/keys recursively enumerates and compares those entry arrays. Two
  approximately 1.98 million-entry lists imply approximately 3.95 million key/value
  pair arrays plus their recursive comparisons, in addition to the byte loop.

This is a concrete CPU/allocation/GC mechanism specific to the failing assertion,
not a measured time attribution. No large-buffer assertion was executed locally.
The other cases also upload/validate/publish and the tamper case opens a second
connection, yet finish in subsecond time in the isolated log. That prioritizes
splitting readAsset from toEqual in the next trace; it does not prove SQL/I/O
latency impossible or justify a matcher change before measurement.

## Public callgraph and blocking intervals

The original test callback and every store method it invokes are synchronous.
There is no await/network/child process/async recovery operation on this path.

| Interval | Actual work and possible latency |
| --- | --- |
| workspace constructor | mkdir/open/stat/chmod, DatabaseSync(file,{timeout:3000}), foreign_keys ON + synchronous FULL, five CREATE TABLE IF NOT EXISTS statements. |
| prepare(v1), prepare(v2) | Actual fixture clones/localization reads/schema parse; draft, two BLOB uploads and validate. Media hash + PNG signature/bounded chunk/dimension checks; MP3 hash/header check, not a decoder process. |
| publish helper each version | requestReview -> details/receipt -> approve -> stage -> publish. Repeated schema/JSON/HMAC work and own SQL transactions; no nested transaction helper call. |
| preview/read/catalog | Preview audits via an autocommit write; published read verifies signature, reparses runtime definition and validates bytes; catalogs reverify/reparse returned rows. Separate matcher cost must be traced. |
| reopened constructor | New connection to SAME DB/key while original store remains open. This is a new connection, not a process restart. |
| rollback/catalog/audit/denials | Signed published rollback, lookups, existing audit assertions, two expected immutable denials; normal transaction catch executes ROLLBACK. |

Counting source paths for a normally completed first body gives 20 BEGIN IMMEDIATE
calls: 17 COMMIT and 3 expected ROLLBACK, plus one preview audit outside the helper.
The constructor is called twice; its five CREATE statements are not proof of
five physical schema writes on reopen. FULL may add durability cost, but neither
fsync count/latency nor lock waits can be inferred from the source setting.
No public transaction is deliberately left open across methods; native statement/
filesystem behavior still requires observation before ruling out a lock.

The runner chunk run.BTlFXlnv.js SHA256
950469eb28cec3faa51f30c3203e1ab3099b54a52e3282b05f388930e7769717 checks
`deadline.exceeded()` at:3285 when a synchronous callback resolves. Thus a test
can complete its entire body and THEN fail the original deadline. The entry-line
timeout stack at test:92 does not identify a blocked SQL method, and timeout does
not imply an unresolved promise. A BODY_COMPLETE sentinel will distinguish this.

## Recommended next action and limits

Grant ONE bounded public-API/assertion step trace under the same original 30000ms
case budget and existing read-only source/deps, as specified in the companion
plan. Separate `readAsset` timing from the exact `expect(bytes).toEqual(picture)`;
retain all original assertions and teardown markers, add wall/CPU/heap/I/O/cgroup
counters and a body-complete marker. No broad819 rerun, no blind third original
repeat, no existing test/source/timeout/PRAGMA edits, no local heavy fallback.

If the matcher dominates, a subsequent owner-approved byte-comparison fix could
preserve exact byte equality using a native comparison and explicit length check;
this review grants no edit and does not weaken the assertion. If SQL steps instead
dominate with low CPU, confirm actual temp filesystem and lock/fsync evidence
before a separately bounded syscall trace. Capacity from budget alone, FULL
storage latency, busy-lock logic and a concrete runtime cause remain **unproven**.
Root may choose the one discriminating trace; there is no new heavy grant now.
