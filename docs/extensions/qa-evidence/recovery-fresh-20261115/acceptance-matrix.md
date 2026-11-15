# P2 recovery acceptance matrix — 15 November 2026

Worker: `01a1dd18-8818-7573-b311-f54bbe0b811f`; base: `8a43c99c65d8923bd23d8c57ac3607e9a09b5764`.
Own tree verified clean before edits. Only synthetic temporary filesystem fixtures; no customer data or SQLite production database.

| Source task | Required acceptance | Deterministic cases / oracle | Initial state |
| --- | --- | --- | --- |
| 1220109925694179 | Media-delete staged rollback across quarantine, journal, base/sidecar writes and binary deletion | Interrupt actual filesystem calls without running exception rollback; restart twice; SHA256 of all original base/sidecar/binary files restored; unrelated show untouched | Pending |
| 1220109925694179 | Committed deletion across marker, quarantine cleanup, journal cleanup | Restart from real captured transaction boundary; zero references, binary absent, cleanup idempotent | Pending |
| 1220109925694179 | Fail closed on missing binary, invalid journal, restore/cleanup failure, unreadable files and concurrency | Retain journal/quarantine and block startup; never restore dangling references | Pending; media-library.ts is read-only under current lease |
| 1220111293723790 | Full V2 metadata and V1 compatibility after either save boundary | Exact canonical base/sidecar digest including timeline/scenes/catalog/visuals/audio/backgrounds; second restart no-op | Pending |
| 1220111293723790 | Failed, partial or silently wrong restores must preserve journal | Inject base no-op/wrong write, sidecar write corruption with unchanged revision, ENOSPC/EACCES, cleanup failure; retry and verify exact content | Source checks only base existence and sidecar revision |
| 1220111293723790 | Invalid/incompatible backup, digest mismatch and concurrent newer revision | No destructive writes; original journal retained; startup fails closed | Pending |
| 1219882508725158 | Create/import cleanup failure and process crash | Inject deleteQuizz/deleteSidecar errors, partial sidecar writes; restart recovery and safe retry | Existing create/import has no journal and swallows secondary cleanup errors; ID is minted inside injected saveQuizz |

Independent reviewer acceptance is required before source tasks are DONE. Full CI/socket build, physical devices and production are not covered by this bounded local bundle.

## Verified local checkpoint

Successor review correction: see `REVIEW_CORRECTION.md`. Independent QA returned REQUEST_CHANGES on the initial commit; seven new transaction-path faults reproduce before the correction and pass afterwards. Final successor focused regression is 85/85 (44 new + 41 original), including full immediate rollback byte verification, committed cleanup retention and removal of forced chmod. Independent QA and the pre-ID creation gate remain OPEN. The 78-case run below is retained as the earlier checkpoint.

`focused-final-r2.log`: **78/78 PASS**, five files: 37 new recovery cases plus 41 original focused regressions. The extra case beyond the manager's earlier 77-case count proves compatibility with the real adapter's matching top-level storage ID and payload digest. `types-final.log`: scoped TypeScript exit 0. `scope-audit.json`: no protected source/manifest changes, media edits confined to approved symbols, original media test confined to the two approved fixture lines. `freeze-files-only.log`: all 602 protected paths verified, with only nine previously approved historical seams.

The initial valid-fixture baseline was 19 PASS / 8 FAIL; fixes cover the five failed quiz-save checks and three failed media checks. `baseline-create.log` separately records three failing cleanup cases before after-ID journal hardening. The first `baseline-storage.log` had an invalid test fixture (`scene.audio.mode=media` instead of the real schema's `custom`); it is retained and is **not** evidence of a production failure.

Full `ui:check` remains exit 1: design/token/catalog PASS, freeze `mismatches=[]`, assigned recovery source paths rejected by the historical UI-only allowlist. The guard was not edited. That pnpm invocation unexpectedly installed 354 packages from the existing local store (0 downloads); no tracked manifest/lock changed. Manager acknowledged preservation of generated dependencies. Later checks use direct installed executables only.

All three source tasks remain OPEN pending independent review. The pre-ID-return crash interval of create/import is explicitly unresolved; see `creation-adapter-contract-proposal.md`. No actual power cut, process kill, production/customer fixture, browser/build/full CI, provider, push, merge or deployment was performed. Boundary snapshots reproduce disk states after real filesystem operations, before any exception rollback, then run the actual startup recovery twice against disposable copies.
