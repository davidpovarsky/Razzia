# Correction after independent review of 1f33047

Prior review SHA: `1f33047cc7baec3e958ff54089c894887604c6bf`.
Assignment base: `8a43c99c65d8923bd23d8c57ac3607e9a09b5764`.
Independent report: HQ `docs/tadazz/qa/fresh-team-20261115/recovery-review-1f33047.md`.
The successor immutable SHA is supplied in the manager handoff and Asana readback. These are producer results; independent execution/integration acceptance is still pending.

## Reproduction before source edits

Seven targeted tests were added while production source remained at reviewed `1f33047`. `review-transaction-before.log` records **7 FAIL / 18 intentionally filtered**, with corresponding immediate-transaction states and SHA256 in `review-transaction-before.jsonl`:

| Transaction fault | Observed before fix | Corrected requirement |
| --- | --- | --- |
| Committed quarantine unlink throws EACCES | Binary/refs gone, quarantine remains, committed journal removed, clean success returned | Keep committed journal + remaining quarantine, surface cleanup warning, restart safely |
| Rollback base write silently changes valid content | Reports safely rolled back; journal/quarantine removed despite wrong base | Compare exact restored base bytes and retain intent/copy on mismatch |
| Rollback sidecar write silently changes valid content | Reports safely rolled back; journal/quarantine removed despite wrong sidecar | Compare exact sidecar bytes and retain intent/copy on mismatch |
| Rollback binary copy silently changes a byte | Reports safely rolled back; wrong binary remains and quarantine removed | Compare entire binary in bounded chunks before releasing backup |
| Rollback base rename throws EACCES | Legacy rollback attempts chmod 0666 | No permission-widening workaround; retain recoverable evidence |
| Rollback quarantine cleanup throws EACCES | Journal remains, but result incorrectly says safely rolled back without pending journal ID | Surface incomplete cleanup and pending recovery journal |
| Rollback journal cleanup throws EACCES | Journal remains, but result incorrectly says safely rolled back without pending journal ID | Surface incomplete cleanup and pending recovery journal |

The reproduction intercepts the legacy chmod calls so it does not itself widen fixture permissions. No customer files or process settings are used. This proves lost cleanup linkage / unsafe verification, not an assertion of observed customer data loss.

## Minimal source correction

Only `executeMediaDeleteTransaction` changed in this successor. The original test fixture correction and all prior assertions/negative cases remain unchanged. No API shape, caller, provider, protected adapter, startup recovery function, guard or baseline modification.

- Let committed quarantine cleanup errors reach the existing committed-warning return, preserving its journal and remaining quarantine for startup recovery. Do not retry destructive cleanup in that error handler. The committed deletion remains committed; no old refs are restored.
- Remove unconditional chmod 0666 calls. Restore failures under existing permissions retain intent rather than attempting permission elevation.
- Verify exact base and sidecar bytes after immediate restoration; verify full media equality against quarantine with 64-KiB bounded reads. A missing recovery copy or mismatch makes rollback incomplete and prevents backup/journal cleanup.
- Treat rollback cleanup exceptions as incomplete recovery with a journal ID, rather than reporting a fully safe rollback.

## Actual validation and receipts

The focused before/after command, from the assigned clean-base worktree, uses installed Node24 and the read-only reference Vitest executable with `vitest.recovery.config.mts`. All application aliases resolve to this worker's source; installed dependency aliases remain read-only. `maxWorkers=1`, no browser/build/install/remote runner used.

```powershell
& $node $vitest run --config docs/extensions/qa-evidence/recovery-fresh-20261115/vitest.recovery.config.mts src/server/media-library-recovery.test.ts -t 'transaction committed cleanup|transaction rollback' --reporter verbose
# before source fix: 7 FAIL / 18 filtered; after fix: 7 PASS / 18 filtered

& $node $vitest run --config docs/extensions/qa-evidence/recovery-fresh-20261115/vitest.recovery.config.mts --reporter verbose
# review-focused-final-r2.log: 85/85 PASS, five files, no skips (44 new + 41 original)

& $node $tsc --project docs/extensions/qa-evidence/recovery-fresh-20261115/tsconfig.recovery.json
# review-types-final.log: exit 0
```

`review-transaction-after.jsonl` records all seven immediate transaction states after the fix; tests then remove injected faults, execute real startup replay and check a second clean restart. The binary corruption case is additionally strengthened to alter the final byte of a **64-KiB + 3-byte** fixture: `review-multichunk.log` is 1 PASS / 24 filtered, with `review-transaction-multichunk.jsonl`. Startup preserves a present mismatched binary and its quarantine copy, because that binary could be a concurrent replacement; the test explicitly removes only its disposable corrupted synthetic file, then proves byte-exact recovery from quarantine. No automatic overwrite of an uncertain replacement is introduced.

`review-scope-audit.json` verifies the entire assignment diff against the exact lease, the original two-line positive-fixture permission, and unchanged protected sources/manifests. `review-freeze-files-only.log` verifies all 602 protected paths; full historical UI-only scope allowlist remains a disclosed denial from the previous checkpoint. `review-format.log` and staged whitespace checks pass. Windows-generated evidence line endings are normalized to LF without altering outcomes.

No pnpm, new installs, local heavy/browser testing, Site/server runner competition, production/customer data, provider calls, actual process kill/hardware power-loss test, push/main merge/deploy or integration approval. Independent focused server execution must be scheduled by the manager after the Site BUILD runner lease. All P2 source tasks remain OPEN, including the separately documented pre-saveQuizz-return identity gap.
