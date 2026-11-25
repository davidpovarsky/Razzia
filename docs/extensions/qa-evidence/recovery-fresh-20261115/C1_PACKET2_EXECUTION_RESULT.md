# C1 packet2 — actual first trial: 41 PASS / 7 FAIL

The sole granted 48-case trial ran once against accepted application source `e1fb1b28420a62acca17ddd69f1e72b3a9d27907` and packet `e121dff8be5d5df5652e76d187751bf5894e9746`. **It is not accepted as a passing native qualification.** No source/runner changes, retry, install/pull, B/native adoption or production/customer operation followed the failure.

| Actual group | Result |
| --- | --- |
| Linux fence primitives and scope | 9 / 9 PASS |
| Reservation, import/metadata, ownership and fence faults | 16 / 16 PASS |
| Independent-review regressions | 12 / 12 PASS |
| Actual native/API | 4 PASS / 7 FAIL (11) |
| Total | **41 PASS / 7 FAIL (48 attempted, no pending/todo)** |

The actual native validator/CRUD case, idless/missing-owner case, public HTTP error case and accounts-off legacy import pass. The actual API pending-tenant child fails: it returns without the expected SIGKILL, and captured stderr reports esbuild/Go could not create an OS thread (`errno=11`, `newosproc`, four threads already present). The six dedicated native kill-boundary cases then fail on absent `.c1-interrupted.json` checkpoints. Their kill/replay claims and the pending-tenant flag-change replay are **not established**.

The observed first error is consistent with process/thread capacity pressure under the configured 96-PID profile. It does not establish which kernel/user/cgroup limit was reached or prove a common cause for all seven. No `pids.events` or peak-thread receipt was captured. In the six cases, checkpoint reading throws before the source test records its returned child result, so those failed receipts lack the child's PID/stderr. This diagnostic limitation is preserved rather than repaired after the trial. Do not classify seven storage defects or seven verified infrastructure-only failures from this packet. Independent disposition and a new exact ROOT grant are required before any change or repeat.

The 12 review regressions pass, including both warm-absent public-parent fences, both move-parent fences for committed and empty-slot cases, repeated failed fresh replays followed by two successful fresh replays, unknown phase/privacy/OFF behavior and zero off-root lookup reads. Offline read-only analysis verifies all six five-process receipts: own killed PID matches checkpoint, five PIDs are distinct, targeted fence activation is positive, private witnesses are retained through both failed processes and final recovery preserves the required public state. It also verifies all four actual HTTP fault/route conditions, foreign/newer whole-pair negatives, qualified external-interference retention and warm-visible commit refusal/recovery. This supports A's cooperating-writer scope only, not hardware power-loss or B exclusion.

## Admission and actual sandbox proof

ROOT snapshot `hq-c1-9770877600484f8280acef0f4846c1fc`: admission SHA-256 `aa708d1b429f09e7a628700c6ea4d622f0a54fe0cb9e7469e618d3b8611c9b89`, ledger SHA-256 `2cfc5266f99d6d62c6e6549ba2093aa03a94ec0eec5717db0817d6d3eb3a55e0`. First Vitest freshness gate was **12.893 seconds** after admission. Actual root ledger/digest, current measurements and source/input identities are recorded in the host-only observation tree.

Before tests: actual real/effective UID/GID 1001, zero effective/permitted/bounding capabilities, NoNewPrivs=1; nine persistent scratch/cache/result/receipt access probes pass. All 1,287 source inputs, two auxiliary inputs and 1,391 retained fixture files match. The last full merged verification is after the passing review group and before the failing native group. After the failure the runner correctly skips further graph/analysis stages. It never runs the final packet analyzer that requires 48 passes. All eight staged packet input hashes independently match after shutdown.

All eight completed stages have an actual terminal resource sample, including the native job's exit 1. Across **148 samples**, minimum free disk is **2,778,378,240 bytes**, maximum accounted new physical data is **10,571,776 bytes**, with no sampled 2 GiB floor / 64 MiB growth / 16 MiB per-log breach. Sampled stage wall time is **283.480 seconds**. Container limits were .25 CPU / 2 GiB / 96 PIDs. Container `77bf6b4467255991f45c3ec71ebcedde77838e5e87b91ab192d82bafb542c570` is stopped, `OOMKilled=false`, writable layer 28,672 bytes. Its final exit 137 belongs to stopping the idle container, not a passing native kill case. Compute is no longer running; preserved artifacts remain.

## Immutable raw evidence

`c1-execution-packet2/` contains 68 raw server files, all SHA-256 matched against server copies by read-only collection; `readback-verified.json` records this and the eight unchanged input hashes. `server-evidence.tar.gz` is 89,168 bytes, SHA-256 `c828345765172601ac45d0cddd5722927c1fb315403f1e019bfc50cb5b4963cf`. `host/` contains commands, raw stdout, running/terminal resource samples, exits, actual identity/access/hash/admission and stop records. `child-results/` contains unchanged per-case results; `child-receipts/` contains both passing and failed receipts. No raw failure is overwritten or relabeled.

`offline-analysis.json` and `analyze-c1-packet2.py` are post-run data checks, not another application/test execution or the skipped final packet analyzer. The source/packet frozen artifacts remain unchanged. All four authorized Asana records were immediately updated to this actual 41/7 result and remain OPEN. Original R2 **813 PASS / 6 FAIL**, the recorded official source guard **1**, B/F1/tenant/hardware/release gates and original task boundaries retain their separate status.
