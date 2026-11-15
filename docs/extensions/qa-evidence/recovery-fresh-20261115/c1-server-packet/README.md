# Corrected C1 runner packet 2 — reserved, not run

Application source `e1fb1b28420a62acca17ddd69f1e72b3a9d27907` is accepted within A's single synchronous cooperating-writer scope by HQ follow-up SHA-256 `95dc7796abec1473bbf42fce35c4d5afd43af04edd4476c2da14cc8ad45b9c6d`. This corrects only the returned `e41cfc3` runner packet. Original source, 48 prepared/unrun cases, archive and B/release boundaries remain unchanged. No application edits, application tests, server operation, upload or execution grant occurred. The source guard's recorded 1 and R2's 813/6 remain historical actual results.

The exact five runner changes are in [RUNNER_PACKET2_DELTA.md](RUNNER_PACKET2_DELTA.md). The old packet remains in Git at `e41cfc3fcd02040b15d934d40347cf0617832dd5`. Runtime still requires independent packet follow-up and a fresh ROOT-supplied admission/ledger. Both examples deliberately refuse execution.

## Frozen inputs and namespace

- Same 19 changed application/test/helper files, 141,571 source bytes; zero unchanged source/dependency/cache bytes copied.
- Same 34,242-byte archive, SHA-256 `2d89ba70f0d023dc5871fd2bed12a0c8994840bbe3d9049435120839c042ecf2`.
- Same effective 1,287 source inputs + two auxiliary files, and retained 1,391-file fixture verification. Source/dependency graph checks now run in the limited container and receive separate host-owned running/terminal observations.
- Same verified 9593 installed dependency/base fixture, 991 R2 overlay and pinned existing image `sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647` (R2 Node v24.22.2). No pull/install/full source/Git/docs/cache clone.
- Same 43 read-only passthrough mounts for unchanged files. Two additional read-only mounts expose the retained original fixture and its frozen manifest only for verification. Exact mounts and argv are in `plan.json`.

New source/fixture/host-observation prefixes use `recovery-c1-e1fb1b28420a62acca17ddd69f1e72b3a9d27907-packet2` under `/home/ubuntu/tadazz-hq-qa-20261115/{source,fixtures,evidence}`. These preserve any prior packet path. The host controller refuses pre-existing fixture, evidence, namespace or runner paths and never renames/deletes old runners or repairs retained mount targets. `manifest.json` changes only its physical source-prefix metadata; all 19 source content hashes and the archive stay fixed.

## Identity and actual access preflight

Invoke ordinary Python as verified host UID/GID **1001:1001**, matching the retained R2 review identity. The new source prefix must already belong to that identity with private directory mode; the controller creates only new owned fixture/observation/namespace directories at 0700 and files at 0600 as appropriate. It refuses a mismatched host identity or owner/mode instead of applying chmod/chown or assuming DAC override.

Docker explicitly receives `--user=1001:1001 --cap-drop=ALL --security-opt=no-new-privileges`, plus read-only root/source, network none, no ports, private PID namespace and the existing .25 CPU/2 GiB/no-extra-swap/96-PID bounds. Inspection checks Config.User, dropped caps and security flags. Actual Node preflight checks real/effective UID/GID, zero effective/permitted/bounding capabilities and NoNewPrivs=1. It reads/hashes the complete immutable graph/dependencies and verifies actual traverse/read/write access to every new scratch/HOME/tmp/cache/result/receipt directory with an exclusive write/read/fsync/unlink/parent-fsync probe. It checks immutable input/code write access is denied. Vitest cannot start unless all these checks succeed. These are prepared checks, not claimed runtime proof.

## Child outputs and host observations

| Host-owned new path | Container access |
| --- | --- |
| fixture `scratch/` | RW `/scratch`; persistent C1 fixture, TMPDIR and HOME only |
| fixture `child-output-root/` | RO `/qa`; empty namespace parent with only two child mount targets |
| fixture `child-results/` | RW `/qa/results`; Vitest JSON results only |
| fixture `child-receipts/` | RW `/qa/receipts`; explicit C1_RECEIPT_ROOT only |
| fixture `cache-0..3/` | RW root/extensions `.vite` / `.vite-temp` only |
| source packet/namespace and retained source/dependencies | RO inputs/code only |
| host `evidence/...-packet2/` | **Never mounted**, including read-only; identity, admission snapshot, commands, raw stdout logs, sampling, exits and analysis remain host-owned |
| host `admissions/` | **Never mounted**; actual ROOT admission and lane-ledger controls only |

Scratch, results, receipts and observations stay on persistent same-device ext4/xfs. There is no tmpfs/RAM substitute or customer/config/secret mount. Actual API requests remain in process with synthetic JWT/account/session authority generated only in private fixtures; no listener/signup/email/provider flow is added. No full host evidence tree is writable at `/qa`.

Every host write uses an exclusive anchored file open in the directory this invocation created with exclusive mkdir and claimed by device/inode. If evidence already exists, or admission fails before the claim, refusal is stderr-only: no driver-error or admission-error append anywhere. Python bytecode writes are disabled before importing the controller. Existing paths are preserved on refusal.

## Fresh ROOT admission and lane ledger

`admission.example.json` and `lane-ledger.example.json` are schemas/examples, not grants. ROOT supplies two private JSON files under the host-only `/home/ubuntu/tadazz-hq-qa-20261115/admissions` directory. They must belong to the pinned host UID/GID and have no group/world permissions. The actual admission binds source, manifest hash, final packet-hash-file hash, independent source/packet dispositions, explicit execution authorization, ROOT thread UUID, fresh timestamp, ledger absolute path, snapshot ID and exact SHA-256.

The ledger binds the same source and packet, ROOT issuer, capture/expiry timestamps (maximum 300-second lifetime), and a unique list of **all actual reserved lanes**. Each row declares laneId, cpuGrant, memoryGrantBytes, newPhysicalBudgetBytes and already consumedPhysicalBytes. Recovery-C1 must occur once with the reviewed .25 CPU/2 GiB/64 MiB limits. ROOT also supplies current aggregate CPU/RAM authority, retained shared metadata counted once, disk floor/future reserve/margin and required host-available RAM. Empty/example/stale/changed ledgers fail closed. No hardcoded other-lane names or 200 MiB future QA reserve survive in runtime admission.

Immediately before the first Vitest job, after actual identity/access/graph verification, the host reopens the ROOT ledger, checks the same digest/content and fresh timestamps, writes the exact snapshot/digest plus actual measurements to host observations, then enforces admission. Required free disk is ROOT floor + current remaining lane growth + ROOT future reserve + ROOT margin; C1 uses measured allocated blocks with inode deduplication, and other consumption comes from the bound ROOT snapshot. The floor cannot be below 2 GiB. Historical 2,568 MiB, 1.25 CPU/9 GiB and 435 MiB planning metadata are explicitly non-authoritative. ROOT will provide current numbers only after packet approval.

## Sequential jobs and resource receipts

The four unchanged case groups are 9 primitive/scope, 16 reservation, 12 independent-review regressions and 11 actual native/API = **48 prepared, none run**. `plan.json` has the exact existing Vitest argv, single-worker flags and synthetic `env -i` allowlist. Only reporter output paths change to `/qa/results/<job>.results.json`. C1_RECEIPT_ROOT remains `/qa/receipts`, matching frozen helpers.

The shared host monitor covers each test job, each source/dependency/retained-fixture verification stage and final receipt analysis. Every stage records commands and running samples, then **always records and checks a terminal sample after the child has exited**, including final raw log length, free disk, total new physical allocation, return code and terminal state. A fast exit cannot skip the final check. A cap, timeout, nonzero exit or missing terminal state prevents every later stage. Raw log/resources/exits cannot be modified through child mounts. Only the exact verified new C1 container may be stopped.

Prospective allocation stays RESERVED at .25 CPU/2 GiB/at most 64 MiB new physical disk. Estimates remain 6–12 minutes and under 16 MiB, unmeasured. Whole packet bound 30 minutes; test-stage bounds 120/600/900/600 seconds; verification/analysis each 90 seconds; every child fixture retains its source timeout/assertions. Sampling waits are bounded to two seconds between checks plus measurement cost, with final checks mandatory. Resource observations include the exact ROOT ledger digest. Self-SIGKILL/fresh replay ownership checks and all application assertions are unchanged; process interruption is not hardware power-cut evidence.

After independent packet approval, ROOT transfer/hash readback and fresh actual admission only, invoke:

```sh
python3 /home/ubuntu/tadazz-hq-qa-20261115/source/recovery-c1-e1fb1b28420a62acca17ddd69f1e72b3a9d27907-packet2/server-run.py /home/ubuntu/tadazz-hq-qa-20261115/admissions/ROOT_C1_PACKET2_ADMISSION.actual.json
```

Transfer only the seven runtime members listed in `packet-hashes.json` plus that hash file to the new private source prefix. The actual admission and ledger stay separately in host-only `admissions/`; do not stage them under mounted `/inputs`. Local packagers, examples and review documents need not be transferred. No execution is requested or inferred by this packet.
