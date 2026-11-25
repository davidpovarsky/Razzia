# Original Media Delete / Sidecar acceptance: concrete startup dependency

Lane B chat `01a1dfa9-5c5a-7723-8993-110f2dfe4892`, branch
`codex/tadazz-hq-recovery-fresh-20261115`, source tasks
`1220109925694179` and `1220111293723790`. Both remain OPEN.

The manager independently reviewed/integrated the prior C1 qualification at
`a616a542022100b7f13afa90e8bd7be47af97772`. This follow-up concerns the original
Media/Sidecar requirement to block startup while critical journals are
unresolved; it does not reopen C1 or implement B/F1/hardware work.

## What was already covered

| Original criterion | Existing executed evidence, not rerun here |
| --- | --- |
| Eight Media crash boundaries, coherent refs/binary state, unrelated show/media and two fresh replays | R2 `full/process-r2/`: quarantine-copy, staged-journal, first-base-write, last-sidecar-write, binary-delete, committed-journal, quarantine-cleanup, journal-cleanup |
| Full V2 metadata after base/sidecar interruption, two fresh replays, unrelated show unchanged | R2 process quiz-base-write/quiz-sidecar-write and native quiz-base/quiz-sidecar receipts |
| V1, malformed/incompatible V2, digest/identity, same-revision silent corruption, newer revision, write/cleanup failures and retries | Original focused86 and R2 native35/review14 at source991f38f |
| Actual native storage names/inodes, foreign/ambiguous bindings, authenticated backups, sidecar-only refs and Map compatibility | R2 native/review receipts and actual Map stager; exact scope in `R2_FINAL_HANDOFF.md` |
| Build/root regressions | Historical source991f38f socket build0 and root config/media17/17; not a fresh integrated run |

`source-equivalence-and-witness.json` verifies **15 exact byte matches** between
source991f38f and this worktree: Media library, quiz-save journal, native recovery
adapter, physical binding/recovery state and their original snapshot/native/
process tests and helpers. It does not assert full integrated graph equivalence.
Old full819 remains 813 PASS / 6 FAIL; corrected `/fake` API fixture5/5 and the
unrelated Theme timeout retain their prior dispositions. No bookkeeping rerun.

## New executed witness: 2 FAIL / 0 PASS

Run with existing local Node24.22.1 and Vitest5.0.3, one worker, isolated owned
synthetic temp roots only. No server/Oracle/DB/customer operation was performed.
`tenant-startup.witness.ts` is outside ordinary product test discovery and is
selected only by this directory's explicit config.

For each family, the witness enables account mode, derives a synthetic tenant
root with the **actual** `withAccount` and `native.getPath`, and places one
malformed journal there. Outside request ALS it invokes the same
`recoverStartupJournals({getPath,updateQuizz,deleteQuizz})` options used by the
production startup entrypoint. It then invokes explicit tenant recovery as a
positive control against that same journal.

| Family | Ownerless production-equivalent call | Explicit tenant positive control |
| --- | --- | --- |
| quiz-save | `status=clean`, unresolved0, no thrown startup error | `status=failed`, unresolved1; journal SHA unchanged |
| media-delete | `status=clean`, unresolved0, no thrown startup error | `status=failed`, unresolved1; journal SHA unchanged |

Both original fail-closed assertions fail because the ownerless call does not
throw. Both positive controls pass, demonstrating that the journal validators
do detect and preserve the same evidence when given its actual tenant root.
Malformed journal byte SHA256 is
`e1d2ee53dcbbd6a59d6f0c650bd59a9c2a8188a809a7a916fe6939f0868539c6`.
Raw `results-attempt3.json`, `runner-attempt3.log`, and two
`*.attempt3.receipt.json` files preserve the measurements. This is Windows
functional path/scope evidence, not Linux durability or a live deployed failure.

Earlier attempts are retained: attempt1 found zero tests because the generated
Windows glob used backslashes; the explicit include was normalized. Attempt2
executed both cases and captured the same clean/failed split, but its final
matcher received undefined; attempt3 uses the empty string for the absent error
and records the actual failing original requirement. Neither earlier result is
relabeled as a pass. Synthetic fixture cleanup uses the existing exact token/
parent/prefix guard and never touches user data.

## Exact source boundary and dependency

- `packages/socket/src/index.ts:23` invokes only one ownerless recovery root
  before `server.listen` at line41.
- `packages/socket/src/services/account-scope.ts:24` resolves to the global root
  when no owner ALS exists, even with accounts enabled.
- `extensions/src/server/media-library.ts:1350` accepts one `getPath`; at
  lines1398-1399 it replays both families against only that root.
- The C1 private registry discovers C1 intents only. It is not an authority for
  historical Media/V2 tenant journals.
- `getAccountDb` is not a read-only recovery-owner provider: it rejects accounts
  OFF, can create the DB/schema, switches WAL and chmods database/sidecars.
  Calling it as an improvised enumeration fallback would change the safety
  boundary and would not cover a flag change safely.

The remaining implementation therefore needs a **trusted startup owner snapshot**
and its composition at the existing protected startup seam. Directory-name or
recursive customer-show scanning is not substituted for account authority.
The current Lane B assignment owns downstream recovery source; the existing
protected C1 additions do not authorize new account-db/startup source seams.

## Minimal proposed contract for manager disposition

Provide one trusted snapshot of the configured physical root and exact account
owner IDs (including disabled owners with retained data), independent of request
ALS/current accounts flag. The provider must not bootstrap a DB, alter schema,
credentials, permissions or WAL state, create SQLite sidecars, or silently
interpret unavailable metadata as an empty tenant set. Existing WAL/snapshot
behavior must be tested rather than assumed from a read-only option.

Composition can pass this snapshot into a downstream root-recovery orchestrator:
validate/deduplicate exact UUID spellings, bind each derived root to the trusted
configured root, process the explicit legacy-global root and known tenant roots,
and refuse listen if discovery or any journal remains unresolved. No process-env
flag toggling or global-fallback native callbacks should redirect a tenant
restore; the existing native recovery adapter already supports explicit-root
filesystem restoration without the optional native CRUD callbacks.

Exact protected responsibility is the owner-provider seam in
`packages/socket/src/services/account-db.ts` (or the designated canonical trusted
owner source) and its invocation in `packages/socket/src/index.ts`. Downstream
root validation/recovery and focused synthetic regression tests belong to Lane B.
No implementation of either protected seam is included here.

Acceptance for that seam: both current failing cases; clean tenants; enabled,
disabled and accounts-flag-change cases; missing/unreadable/invalid/duplicate
owner metadata; no DB/WAL/permission writes; no off-root or unknown-owner access;
full restored V2/binary/ref state; two startup replays; unchanged legacy-global
and Map behavior. These are proposed seam checks, not executed passes.
