# Corrected compiled-index server plan — prepared, NOT granted or run

Corrected source: c35a65d97132f64c1ebd0112ebd7ae0a82273fda (53 authored cases, zero run).
The original 155c boundary findings are addressed in the exact three new leaves;
authority and all 26 accepted older files/barrels/runtime stay unchanged. The
correction source handoff is ../review-correction/HANDOFF.md. D095 remains
FAILED_PENDING_REPLACEMENT. No rights/store receipt or active pin exists.

This is a reviewable plan, not an execution authorization. No SSH probe, upload,
remote filesystem write, server allocation, test, TC, build or install occurred
while preparing it. Local checks only parsed/formatted the dormant helper and
runner, inspected JSON and compared pinned source hashes/commit bytes. No local
pnpm/project script was invoked; all prior incident/ignored links are preserved.

## Exact files and existing mounts

Four new module bytes total 64,216; transfer-manifest.json lists
exactly those four plus plan/config/runner/audit helper: eight files, with the
manifest itself as a ninth file. Total upload is 122,189 bytes, below 256 KiB.
Copy only this explicit file list AFTER a separate root resource/execution grant.
No original26, dependency, CAFS store, old docs, .git or whole-source copy.

Existing immutable source/dependencies:
/home/ubuntu/tadazz-hq-qa-20261115/source/sb-metadata-f9eaba0259c24a98394d4b61aa783e24c39beff1ca801c24c573d88852c96bf0

One accepted metadata test differs from that preserved original failed fixture.
Reuse its EXISTING corrected bytes read-only:
/home/ubuntu/tadazz-hq-qa-20261115/fixtures/sb-metadata-delta-b59cb6cf523773f3189a7fd9937c8e0000d0565c6d68ed18c88d8c00f8b1a418-xdg/stage-metadata.test.ts

The lower original26 file hashes are checked separately, preserving that old
failed fixture byte-for-byte. The effective view checks all 26 accepted hashes,
plus four new hashes and 10 exact static import/config baseline witnesses. The
17-file static closure includes dependencies, not other test collection. Full 3297
baseline audit is not repeated or claimed. Expected Node/Vitest/TS/Zod versions,
three known Vitest implementation hashes and before/after tool-file hashes are
recorded in overlay-plan.json/audit-view.cjs. Missing or changed input means HOLD;
never rebuild/reinstall/copy a replacement or reconstitute a full workspace.

The four new filenames do not exist in the old read-only directory. Therefore
propose a 2 MiB in-container tmpfs at the core directory (mode 0555), over the
read-only whole-source bind. Bind all 30 individual files read-only into it:
26 references to existing accepted bytes, four references to the new fixture.
This only creates mount targets in ephemeral memory; no protected source is
rewritten and no alias/plugin/source transformation is used. Startup mechanics
have NOT been tested. If the mount cannot be created, retain startup FAIL and
return the grant; no writable-source or security fallback.

Run as the invoking unprivileged QA owner's uid:gid; root filesystem/read-only
inputs, drop ALL capabilities, no-new-privileges, network none, no host port.
Only new evidence and /tmp 128 MiB are writable; core tmpfs cannot be written by
the process. The2MiB core and /tmp 128 MiB count inside the 2 GiB memory ceiling. Audit
actual mount flags, effective capabilities, exact30-file directory and no-new-
privileges before any test. Do not modify the shared metadata keeper.

## Proposed scope/resource bounds (not granted)

One container, 0.25 CPU / 2 GiB, 128 pids. Fresh disk >=2344 MiB; reserve >=2 GiB
throughout; total NEW fixture/evidence/container-layer disk <=8 MiB. Upload cap
256 KiB. Test-command watchdog 120 s; focused-TC watchdog 180 s; whole-job watchdog 450 s.
These are external process limits, not a change to the original 30000 ms Vitest
case timeout. Capture bounded raw logs (512KiB each) and exact output counts.
No claim that today's actual disk/resources meet the gate; recheck after grant.

Run exactly once each, inside /workspace/extensions:

```text
node node_modules/vitest/vitest.mjs run src/core/show-library/compiled-index.test.ts --maxWorkers=1 --no-file-parallelism --no-cache --configLoader=runner --reporter=json --outputFile=/evidence/compiled-index-tests.json
node node_modules/typescript/bin/tsc --project /plan/compiled-index.tsconfig.json
```

The TC config inherits the unchanged extensions tsconfig, overrides files to
exactly the four new modules, include=[], noEmit, incremental=false, and the two
already-proved explicit Node typeRoots. Normal imported dependencies are checked;
no wildcard old-test/project check. No suppression/noCheck/timeout widening.

Require one testResults file ending in the exact compiled-index.test.ts path,
total 53, passed 53, failed/pending/todo 0 and exit 0. Preserve startup/collection/
case failures and TC failures separately. TC may run once after a normal test
failure to collect the independent result; do not edit/retry or run any old 26,
installation 5 / strength 7 / full 819/build/browser/ui:check. Watchdog/resource/source
failure stops dependent work and always attempts owned-container release.

Before/after: check original26 lower hashes; effective26+four hashes;10 scoped
baseline witnesses and read-only mount/tool identities. Actual limits, stdout,
JSON reports, exits, timestamps, source hashes, free disk, writable-layer bytes,
OOM and stop/remove evidence belong to the new receipt. Failures stay failures.

## Explicit future operator invocation

After root approves this exact source/plan, create only the fresh fixture named
below, verify every transferred hash externally, and invoke as the unprivileged
QA owner. The CLI grant ID records the already-issued grant; it does not confer
permission by itself. Neither this text nor a JSON record activates a renderer.
Use asynchronous SSH/exec with short yields while monitoring; never block the
conversation for the full watchdog.

Fixture: /home/ubuntu/tadazz-hq-qa-20261115/fixtures/compiled-index-schema-4966fda3751f7de8bc92f80ed830493bb8190c9b7e37be44e4f94c807833e425
Evidence: /home/ubuntu/tadazz-hq-qa-20261115/evidence/compiled-index-schema-4966fda3751f7de8bc92f80ed830493bb8190c9b7e37be44e4f94c807833e425
Source-bundle SHA-256: 4966fda3751f7de8bc92f80ed830493bb8190c9b7e37be44e4f94c807833e425
Reviewed plan SHA-256: 123093f622de1e5055b83e3e4a31793f75a9c01be4c199e8a4ed7ff5d93dc8e1
Transfer-manifest SHA-256: 6d19fcafdad7374dac2dcbd31225ee96ea8fcd624417ff11b4d36d6144cc7f6d

Required argv, with the actual root-issued grant reference supplied at that time:

```text
python3 run-compiled-index.py --expected-plan-sha256 123093f622de1e5055b83e3e4a31793f75a9c01be4c199e8a4ed7ff5d93dc8e1 --expected-transfer-sha256 6d19fcafdad7374dac2dcbd31225ee96ea8fcd624417ff11b4d36d6144cc7f6d --root-grant-id ACTUAL_ROOT_ISSUED_REFERENCE --execute-after-root-grant
```

Runner refuses a pre-existing evidence namespace/container name; labels bind
cleanup to owner, exact source bundle and grant reference. It stops/removes only
that newly-owned container, including after startup failure, and leaves all
immutable fixtures, keeper and raw receipts intact. SIGTERM/SIGHUP request
cleanup. No automatic retry, reset/prune/delete or install/pull is permitted.
Both code and plan still need root source/security review before a grant.
