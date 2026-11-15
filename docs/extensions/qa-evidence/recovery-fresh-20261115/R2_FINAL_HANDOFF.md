# Recovery R2 — final producer handoff

Executed source/test commit **`991f38f216ad265e06aec53313db8928437da248`**, branch `codex/tadazz-hq-recovery-fresh-20261115`, worker chat `01a1dd18-8818-7573-b311-f54bbe0b811f`. All approved Recovery corrections are implemented. **113 prerequisite tests pass. The full extensions run remains 813 PASS / 6 FAIL (819).** Its API fixture failures pass on the corrected isolated execution fixture; the unchanged theme-installation test still times out at its original 30-second limit. This is producer runtime evidence, not independent full acceptance or release approval.

## Actual results, kept separate

| Execution | Actual result |
| --- | --- |
| Frozen 4138 application + 3f92 test-only review cases | 11 FAIL / 2 PASS (13); all four review findings reproduced |
| 8b9593 review / native+Map / process | 14/14, 36/36, 10/10 PASS |
| 8b9593 original focused | 84 PASS / 2 FAIL (86), retained |
| Final 991 original focused, including A4 and Gate3 | 86/86 PASS |
| Final 991 review / selected native Media+retry / real Map stager / selected Media SIGKILL | 14/14, 4/4, 1/1, 8/8 PASS; 113 prerequisite tests total |
| Final 991 full extensions, actual existing config | **813 PASS / 6 FAIL (819), 92 PASS / 2 FAIL files (94), exit 1** |
| Final 991 socket build | exit 0 |
| Final 991 root socket config + media tests | 17/17 PASS, exit 0 |
| Final 991 scoped server types / source format / official freeze files-only | 0 / 0 / 0 |
| Unchanged API routes on corrected fixture | 5/5 PASS, exit 0 |
| Unchanged theme installation isolated, original timeout | **4 PASS / 1 TIMEOUT (5), exit 1**, 37.20 seconds total |

Selected native/process prerequisite runs explicitly deselect 31 and 2 other cases. The subsequent full run executes them and retains **59 complete final-candidate receipts: 35 native, 10 process and 14 review** under `r2-server-991f38f/full/`. Offline analysis verifies expected SIGKILL, distinct fresh recovery PIDs, timeout flags and unchanged negative states. No 8b receipt is relabeled as 991, and no later focused pass changes the original full-run result.

## Corrections and exact source boundary

The independent review approved the four source fixes on 8b9593: require a recorded null state before admitting a missing sidecar; reject ambiguous native non-string-ID basename candidates before callbacks; authenticate every still-needed private backup before any Media rollback mutation; preserve the admitted native ID when default replay publishes a wrapper-free logical backup. Generic callback-backed version-1 journaling and the actual Map-only package stager remain supported.

Two further corrections were explicitly approved after the actual 8b failures. Media replay resolves the existing quarantine path without creating a directory during insufficient-intent admission. Original Gate3 now writes its legitimate complete backup sidecar before staging the interrupted save. Its only insertion is line 1298, `writeSidecar(getPath, quizId, v2Extras)`. Every assertion and the rest of that original test file are byte-identical to 8b after removing this insertion. The pre-edit ledger and exact old/new section hashes are in `R2_8B9593_RUNTIME_DISPOSITION.md` and `ORIGINAL_GATE3_APPROVED_INSERTION.json`.

Earlier approved original-test changes remain restricted to the two ledgered insufficient legacy Media cases and CORE01's matching storage-ID/logical-digest expectations. CORE06 assertions were preserved; its actual native create/export/import/GET/re-export behavior is covered. No protected package, editor, global hash, root dependency, provider or tenant boundary was changed.

## Six full-run failures and disposition

Five API route assertions cascade from a failed create: the unchanged test's Map callbacks use a physical sidecar/journal path at hardcoded `/fake`, but the read-only container root lacked a writable fixture there. A fresh runner used the **same read-only application/dependency mounts and pinned image**, fresh caches/output directories and a dedicated empty **owned HOST SCRATCH BIND at `/fake`**. The unchanged file passed 5/5. Only two sidecar files remained; `quizzDirectoryExists=false` proves there was no Map-base disk mirror. No application, API test, journal contract or dependency changed. `followup-analysis.json` checks these facts. The manager accepted this actual fixture remedy. The later proposed tmpfs profile was **not executed**; its unused plan is explicitly named `NOT_RUN_server-tmpfs-followup.py.txt`.

The sixth failure is `show-themes/installation.test.ts:92`, the actual validation/approval/stage/publish/restart/rollback case. It timed out in the full run and again in isolation at **the unchanged 30000 ms budget, .25 CPU / 2 GiB**. Test, installation implementation, fixture and review source are byte-identical from 9593 to 991; exact hashes are in `THEME_TIMEOUT_SOURCE_BASELINE.json`. This demonstrates a repeatable timeout under the leased profile. It does not prove a capacity cause or historical runtime baseline result. Theme code, assertions and timeouts were not edited. The manager owns further diagnosis; no duplicate full run or higher-resource run occurred.

## Inputs, artifacts and release of resources

The effective 991 graph contains **1,274 staged files plus two exact Git freeze-policy auxiliary files**, verified inside the merged container before/after focused, broad and followup runs. Separately, all **1,391 retained 9593 delivered inputs** stay hash-identical. These are different input scopes. The immutable prior source/dependencies were mounted read-only; only 294,017 source/test bytes were duplicated in the bounded overlay. No full root, .git, store, dependency copy, install or image pull was used.

Staged manifest SHA-256: `d67a1041f7c43392ad83d4e6812e597fa05a391683766ab6a46112a2c67b2f54`. Overlay archive: 169,148 bytes, SHA-256 `c16d90d69a6b030f2f4a58e21e1238a7ded7096bfbc9a527bebfee376ad27286`. **All 162 downloaded raw server files SHA-match** their server copies. `artifact-receipt.json` records the built socket bundle/map and generated scene harness hashes. Raw old failures remain immutable.

Commands are preserved verbatim in `server-overlay.py` and `server-followup.py`: existing extensions Vitest config, one worker/no file parallelism; actual socket Rolldown config; root Vitest `--project socket` for `config.test.ts` and `media.test.ts`. Source audits and portable scoped typecheck config are included. Runtime is pinned Node image `sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647`, network none, .25 CPU / 2 GiB, read-only root.

All Recovery runners are **stopped** and the manager released the grant. Main-run resource sampling recorded 120 samples, minimum free disk 2,754,895,872 bytes and maximum aggregate new disk 53,680,334 bytes. Followup final aggregate new disk was 53,713,155 bytes, below the 96 MiB cap. Later global disk pressure was reported to the manager; no preserved dependencies or fixtures were deleted. No further job is pending in this lane.

## Remaining owner gates

The three original tasks and HQ lane stay **OPEN**. The repeatable theme timeout requires owner disposition. C1 pre-ID reservation, F1 whole-writer quiescence/durability, tenant startup discovery, trusted migration to another root/device, independent full acceptance and release remain separate gates. No push, merge, deployment, production enablement or customer-data operation was performed.

Packet: `r2-server-991f38f/analysis.json`, `followup-analysis.json`, `server-evidence-verified.json`, manifests, exact commands, raw logs/exits/receipts, baseline audit and stopped-runner records. Prior packets: `r2-review-4138/` and `r2-server-8b9593/`.
