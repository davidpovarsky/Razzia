# P2 recovery local review handoff

Latest checkpoint: independent QA requested changes on `1f33047cc7baec3e958ff54089c894887604c6bf`. The targeted transaction corrections and new fault receipts are documented in `REVIEW_CORRECTION.md`; the earlier 78-case checkpoint below is historical and does not represent QA acceptance. All source tasks remain OPEN.

Worker UUID `01a1dd18-8818-7573-b311-f54bbe0b811f`; reviewer `01a1dd1a-0c70-7b02-a179-c8c2b7c11755`.
Tree `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-recovery-fresh-20261115`, branch `codex/tadazz-hq-recovery-fresh-20261115`, verified clean assignment base `8a43c99c65d8923bd23d8c57ac3607e9a09b5764`.
Result commit is the review commit containing this document; its exact SHA is included in the manager handoff and original Asana updates.

Sources: `1220109925694179`, `1220111293723790`, `1219882508725158`; HQ `1220541793835278`. All remain OPEN for independent QA / unresolved creation adapter gate.

## Result

- Media transaction publishes in-memory committed state only after the committed journal rename succeeds. A real injected ENOSPC rename now rolls back rather than deleting the last quarantine copy and reporting success.
- Committed startup recovery retains journal/quarantine on unreadable shows, surviving refs, unexpected binary presence or cleanup failure. Staged replay checks exact base/sidecar bytes and binary equality in bounded 64-KiB chunks before releasing recovery data.
- Quiz-save recovery verifies backup filename/identity/digest and complete restored base/sidecar content rather than existence/revision alone. It accepts both legacy digests containing the matching storage ID and validated-payload digests excluding that storage-only ID. Corruption, mismatches and restoration/cleanup errors retain intent and block startup.
- Create/enhanced-import persist null-backup rollback intent once `saveQuizz` returns an ID, attempt base and sidecar cleanup independently, expose secondary errors, retain unresolved journals and replay safely. Recovery refuses to delete a subsequently changed created base. Pre-ID-return crash safety remains unproven and requires the separately proposed reservation contract.
- Manager approved the exact original positive Gate 3 fixture correction: import the canonical digest helper and replace its arbitrary `"b".repeat(64)` digest with the actual base digest. Assertions and all negative tests are unchanged. An earlier manager message from this worker incorrectly called this placeholder `a`; actual inspected value was `b`.

## Actual validation

All commands below ran in the assigned tree. `$node` denotes installed `C:/Users/DAVID/.local/tools/node-v24.22.1-win-x64/node.exe`; `$vitest` denotes the installed reference `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-design-system-20261110/extensions/node_modules/vitest/vitest.mjs`. Config aliases resolve all application source to the assigned tree, and dependency/tool code to installed read-only reference packages. The sole explicitly named reference control runs baseline tests against baseline source and is not counted as current-source success.

```powershell
& $node $vitest run --config docs/extensions/qa-evidence/recovery-fresh-20261115/vitest.recovery.config.mts --reporter verbose
# focused-final-r2.log: exit 0; 78/78 PASS, five test files (37 new / 41 original)

& $node C:/Users/DAVID/Code/Razzia-worktrees/tadazz-design-system-20261110/node_modules/typescript/bin/tsc --project docs/extensions/qa-evidence/recovery-fresh-20261115/tsconfig.recovery.json
# types-final.log: exit 0, no diagnostics

& $node docs/extensions/qa-evidence/recovery-fresh-20261115/verify-review-scope.mjs
# scope-audit.json: PASS, exact source lease + original two-line fixture audit

node extensions/qa/tds-boundary.mjs --files-only
# freeze-files-only.log: exit 0; 602 protected paths, 593 unchanged + nine historical approved seams

git diff --check
# PASS
```

`boundary-digests.jsonl` records before/after base/sidecar/binary SHA256 for eight captured boundaries: quarantine copy, staged journal rename, first base rename, last sidecar write, binary unlink, committed marker rename, quarantine unlink and journal unlink. Staged rollback preserves all original content; committed cleanup leaves no references/binary. Each snapshot is recovered twice; unrelated show hashes remain identical. After-copy/before-journal snapshots preserve the original files and an unclaimed quarantine copy; recovery never guesses ownership of that copy.

Additional fault cases cover real filesystem rename failures, silent valid-content corruption, partial writes, ENOSPC/EACCES, missing both binary copies, invalid journal IDs, concurrent newer sidecar revision, cleanup failures, repeated recovery and cross-family replay with a real digest. These are deterministic filesystem snapshots/throws, not hardware power-loss or actual process-termination evidence. Existing journal renames do not establish hardware/disk-cache durability proof.

## Guard/tooling incident and limits

The required `pnpm --dir extensions ui:check` unexpectedly auto-installed 354 packages by local-store linking (0 downloads), including an esbuild postinstall. No explicit install command, tracked lockfile/manifest edit or global configuration edit was performed. Full output is retained in `ui-check.log`; manager acknowledged leaving generated dependencies intact. No further pnpm commands were used.

`ui:check` design/token/catalog pass; its original freeze allowlist rejects assigned server work (`mismatches=[]`). The guard remains unchanged. The official files-only mode separately verifies the protected hashes, and the scope audit checks this manager-approved recovery lease. This is a disclosed scope-aware limit, not a claim that the complete historical UI gate is green.

No browser, socket build, full CI, production data/storage, physical devices, provider calls, push/main merge/deployment or release qualification. All tests use disposable synthetic directories and bounded single-worker execution. Dirty site and other project trees remain untouched. Follow-up: independent exact-SHA review, then source-task acceptance decisions; separate adapter reservation approval for the pre-ID crash interval.

Evidence-only normalization: Windows-generated log/JSON CRLF line endings were converted to LF before the review commit after staged whitespace verification exposed them. Test output content/outcomes are unchanged; no comparator, assertion or production source change resulted.
