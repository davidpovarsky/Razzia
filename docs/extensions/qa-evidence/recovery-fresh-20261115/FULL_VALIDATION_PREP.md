# Required P0 validation package — prepared, not executed

The manager confirmed independent SERVER **85/85 PASS** on exact `66b4535632ee6cd4bbc4515e7d3ab9004fe1915e`; HQ independent report `qa/fresh-team-20261115/recovery-review-66b453.md` records Node24.22.2/ARM64, network-none, before/after491-file hashes and installed WASM hash. That receipt covers the existing five focused suites. This successor adds only test harness/evidence; all twelve previously reviewed source blobs (including production, test and runner files) are unchanged. It reuses identical85 evidence honestly; it does not claim the new process tests or full suite/build passed.

## New real interruption harness

Owned `storage/process-interruption.test.ts`, `process-interruption-child.ts` and `process-interruption-state.ts` prepare ten cases:

- Media: after quarantine copy, staged journal rename, first base rename, last sidecar write, physical binary unlink, committed journal rename, quarantine unlink and journal unlink.
- Composite V2 save: after base write and after sidecar write, before journal cleanup.

Each test creates its own token-bound synthetic temp directory with two affected shows, rich V2 metadata, an unrelated show and unrelated binary. The child imports the delivered production functions using installed `tsx`, wraps actual filesystem operations, writes a boundary-state receipt, then self-SIGKILLs on Linux. It does not throw into transaction rollback. The parent must observe exit signal SIGKILL and matching child PID/checkpoint. Windows fallback is explicit abrupt exit86, but no Windows interruption test was run and it cannot count as Linux SIGKILL proof.

The parent verifies the exact interrupted frontier, then forks **two fresh recovery processes**, checking full base/V2 content and byte digests, refs/binary rollback versus committed cleanup, unrelated data, zero unresolved journals and idempotent second restart. A64KiB+3-byte binary exercises multiple chunks. All wrappers are test-only; no production hook or source change. Receipts retain before/interrupted/recovery1/recovery2 state and stdout/stderr/PIDs/exit signals even on failure. A pre-journal quarantine copy remains unclaimed rather than guessed/deleted. No hardware power-loss/fsync claim.

Only lightweight formatting/type preparation checks ran locally. **New process10, full extensions suite, socket build and root config/media regression are NOT RUN** pending the manager's server runner allocation after the Site diagnostic. Do not start a competing job.

## Full export inputs and immutable provenance

`prepare-full-export.mjs EXACT_SHA NEW_TEMP_EXPORT_DIRECTORY` creates a Git-only archive and per-file Git-blob/SHA256 manifest with streaming hashing/compression. It requires a clean exact HEAD. This is the full workspace source/assets/fixtures/build/test input set, not the earlier491-file subset: all `packages/**`, `extensions/**`, root tracked non-env files, `assets/**`, `docker/**`, `scripts/**`, required motion-reference HTML and this evidence directory. It excludes ignored dependencies, `.env*`, runtime/customer config, secrets and unrelated historical documentation/QA outputs. It never reads a working `.env` or copies ignored data.

The one reference HTML is an actual full-suite input. Existing `source-parity-export.test.ts` writes a generated native-scenes HTML into its historical evidence path; that generated output is not an input and is not delivered from old evidence. Full tracked input hashes must match before/after; newly generated HTML, build dist and QA caches/dependencies are separately recorded outputs. Do not weaken tests or modify protected positive fixtures if failures appear.

## Proposed server validation (QA-owned writable copy; not run here)

After manager allocates the runner, safely extract the verified archive into a NEW QA-owned writable execution copy. Do not install/build inside an immutable producer delivery or old image source tree. Preserve lockfile; install frozen dependencies using the existing store/offline first, per manager authorization. Use Node24 and exact delivered source; no production mounts/ports/customer configuration. Limit concurrency to one job/worker. Record installed versions and resolve read-only dotLottie WASM from this execution copy's installed package, never Windows or stale image source.

The provided `extract-full-source.py ARCHIVE MANIFEST NEW_QA_WORK_PATH EXPECTED_ARCHIVE_SHA256 EXPECTED_MANIFEST_SHA256` validates all members and blob hashes before creating files, rejects link/device/absolute/traversal/duplicate entries, and refuses overwrite. It only permits a new host path beneath `fixtures/recovery-required-<manifestSHA>/` after QA creates that allocated parent. It creates a writable execution copy; it starts no process/test. `verify-inputs.py` performs subsequent read-only input hashing. These extraction/verification tools are prepared, not executed by this worker for the new package.

Set `WORK` to the new writable copy and `EVIDENCE` to QA's allocated evidence directory. Create those directories only in assigned namespaces. Set `RECOVERY_PROCESS_RECEIPT_ROOT=$EVIDENCE/process-receipts`, plus optional existing transaction/boundary receipt env paths. Use the actual committed project configs, not producer Windows aliases.

```sh
# Save exact manifest verification before any dependency/test/build output.
python3 verify-inputs.py "$WORK" source-manifest.json > "$EVIDENCE/inputs-before.json"

# Dedicated real child-process cases first (10 cases; currently NOT RUN).
(cd "$WORK/extensions" && node node_modules/vitest/vitest.mjs run \
  --config vitest.config.ts src/server/storage/process-interruption.test.ts \
  --maxWorkers=1 --no-file-parallelism --reporter verbose)

# One full extensions suite; all its cases, including process10, no exclusions/skips added.
(cd "$WORK/extensions" && node node_modules/vitest/vitest.mjs run \
  --config vitest.config.ts --maxWorkers=1 --no-file-parallelism --reporter verbose)

# Required actual socket build (do not run dist / start the server).
(cd "$WORK/packages/socket" && node node_modules/rolldown/bin/cli.mjs -c)

# Relevant root consumers with actual socket setup and config; not a1079 rerun.
(cd "$WORK" && node node_modules/vitest/vitest.mjs run --project socket \
  packages/socket/src/services/config.test.ts packages/socket/src/services/media.test.ts \
  --maxWorkers=1 --no-file-parallelism --reporter verbose)

python3 verify-inputs.py "$WORK" source-manifest.json > "$EVIDENCE/inputs-after.json"
```

The dedicated process run is useful for diagnosis but the full extensions run must still include it. Preserve separate actual exit codes/logs for all required phases, continue independent phases when useful after a failure, and report exact failures. Do not turn nonzero exits into success, skip failed tests, modify assertions/guards, or silently repair outside-lease fixtures. QA owns its writable copy, fixtures, cache/build output and independent receipts.

All original tasks remain OPEN until those real requirements are independently verified. The pre-saveQuizz-return ID and failure-to-establish-journal contract remain explicitly OPEN; no orphan scan/deletion or reservation adapter was introduced.
