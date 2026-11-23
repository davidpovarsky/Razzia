# R2 scoped implementation checkpoint — runtime not yet verified

Authority: manager decision `RECOVERY_R2_NATIVE_BINDING_20261115.md` and subsequent
explicit native admission, digest and fixture dispositions in the manager chat.
Before evidence is the immutable R1 `bd4de1f` run/evidence `be73927`: 2 corrected
V2 process passes; 2 native passes / 7 native failures. Those raw failures remain
unchanged. No source task is complete and no production enablement is authorized.

## Two storage contracts

File-backed Media now stages version-2 physical records: actual root-relative
basename, base/sidecar kind, complete raw byte images/hash/length, bigint device
and inode identities and mode. Private prepared target/backup files establish
atomic publication/rollback identities before rename. Both siblings are checked
before mutation; ambiguous identity, changed content, replaced inode, linked path,
sidecar-only record or insufficient old Media record fail closed. Rollback fully
verifies the binary before restoring references, and retains journal/last copy
when restoration fails. Restored binary identity is recorded by this invocation
before reference restoration; the unresolved gap before recording is fail-closed.
This does not provide filesystem durability or cross-process writer quiescence.

Generic quiz journaling remains the existing callback-backed version-1 contract.
The real `stagePackageGame` production path uses a Map-only base adapter and is
covered by a new actual production-function regression. No filesystem absence
selects a memory fallback. Mandatory physical staging is **not** imposed globally.

Native startup explicitly composes `createNativeRecoveryAdapter` and its optional
recovery-boundary guard. It resolves one physical target by matching embedded ID,
never an unrelated ID-derived filename or a normalizing native getter. Before
base/delete/sidecar writes it validates both complete logical states against the
declared backup/target and pins current raw bytes/inodes. Callback results and
both siblings are checked again; native binding errors cannot fall through to a
guessed filename. Full sidecar data is preserved at native restoration. A missing
sidecar can be restored from complete validated legacy logical intent without
overwriting a foreign file. Generic V1 intent does not prove pre-crash inode
ownership: that stronger writer capability remains separately gated.

The earlier broader generic-physical prototype was saved, then only this worker's
own generic journal/service edits were restored before this narrower implementation.
Exact deferred patch SHA-256:
`984951ad54f0ae59e0aa588ad3e37fa226bb7657e2926a44f8c297fc3a3a3aa4`.
`deferred-physical-binding.ts.txt` preserves its helper snapshot. These are a future
explicit opt-in proposal, not active generic behavior or an approved F1 proof.

GET now hashes the complete logical payload after removing only a matching root
storage ID. All other fields/types remain. Legacy sidecar compatibility accepts
only exact payload or matching-ID-bearing digests for that same quiz, without a
global hash change, saved ID rewrite, sidecar-on-GET mutation or forced match.

## Reviewed test premise changes

- R1 unrelated ID-named foreign sentinels retain exact bytes while a newly recorded
  real target may recover cleanly. True recorded-target/sibling inode, content,
  symlink and revision negatives remain fail-closed with both attempts captured.
- Sidecar-only detach is denied before any write, with full tree/hash comparison.
  Separate malformed legacy Media replay is a retained-evidence negative.
- Copied-root/inode Media snapshots become explicit no-mutation negatives.
  Actual same-root eight Media/two V2 SIGKILL positives retain two fresh PIDs.
- Original `storage.test.ts` changes only the approved CORE01 expected digest:
  assert matching returned ID, omit only that root ID, retain every other assertion.
  No Map-to-disk mirror or original Media Gate3 fixture change was applied.
- New tests call real `stagePackageGame`, actual native save/update/delete/startup,
  actual post-ID create/import interruption, binary rollback copy failure and
  full-content digest compatibility controls. No expected-fail or skipped tests.

Assumption: startup before accepting requests, one cooperating writer. No tenant
discovery, authenticated-route, fsync/fdatasync/directory fence, hardware power-loss,
warm commit re-fence, protected C1 hook, provider/billing or customer-data work.
All `packages/**`, editor, global hash, manifests/lockfile and other worktrees remain
unchanged. Original source tasks remain OPEN through independent acceptance.

## Verification order

First exact source export, offline cache-only preparation in the assigned
`recovery-r2-<SHA>` paths and dedicated 0.25 CPU / 2 GiB, network-none, one-worker
container. Recheck actual memory/disk margin immediately before execution.
Run native/ownership/package/process and original focused tests first, preserving
all failures and twice-replay receipts. Do not run the broad extensions/socket/root
checks until the eventual review candidate is ready and known source changes end.
