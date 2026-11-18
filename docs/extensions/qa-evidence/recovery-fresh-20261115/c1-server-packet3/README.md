# C1 executable diagnostic packet3 — staged for review, not execution

Assembly follows the approved `526a92a` proposal. Application and all five test files remain byte-identical to `e1fb1b2`; the only source exceptions are the permitted parent Node fixture observer (`a4bd884`) and observation-only fence isolation refinement `47b6826`. `node-observer.delta.patch` discloses the complete two-file delta. No assertions, child entry, application fsync, timeouts, B or production behavior changed. Original packet2 **41 PASS / 7 FAIL** and 37 old-profile passes remain immutable evidence, not new-profile passes.

## Exact staged scope

New prefix: `/home/ubuntu/tadazz-hq-qa-20261115/source/recovery-c1-e1fb1b28420a62acca17ddd69f1e72b3a9d27907-packet3-process`. Fixture and host-observation prefixes use the same basename under `fixtures/` and `evidence/`. Only source inputs may be staged now. Fixture/namespace/container creation, access probes and tests require a new exact ROOT admission/ledger after independent packet review.

`manifest.json` binds 20 source files: all original application/test bytes plus exactly two Node-only observer paths, 1,288 effective inputs and two auxiliary files. The same installed dependencies/image and retained 1,391-file source fixture are mounted read-only. Three old passing-result files are additionally mounted read-only and SHA/case-name checked, tagged **OLD packet2**. No source/dependency/Git/docs/cache tree is cloned; the overlay is small. All original packet2 input files remain untouched.

## Controller and process gates

`runner_base.py` is byte-identical to the reviewed/executed packet2 host controller. `runner_host.py` extends it with live host-only PID/cgroup metrics, process baseline/drain gates, per-job receipt isolation and strict selected-result/raw-child gates. `server-run.py` retains its exclusive evidence-claim/stderr-only refusal behavior. Host observations/identity/controls are never mounted; only child results/receipts and owned scratch/cache directories are writable. UID/GID 1001, cap-drop ALL/no-new-privileges, network none, read-only inputs, persistent same-device scratch and fresh ROOT controls are retained.

Caps stay **.25 CPU / 2 GiB / 96 PIDs / 64 MiB**. Init remains OFF, verified from Docker identity. `GOMAXPROCS=1` is the only scheduling change. No install, pull, global setting, capability increase, fallback or automatic retry/init activation is included.

Before source preflight, the host sampler resolves only the live owned container's cgroup. Every running/terminal sample records actual pids.current/max/events/local/available peak, owned PID/PPID/NSpid/state/threads/startTicks/limits and parent transitions. It starts with a zero max-event requirement, keeps actual max at 96, and stops on a new cap event or unavailable live accounting. Snapshot races are explicit; missing historical counters are not zeros. Old packet2 cgroups were already removed, so their peak/orphan history remains unavailable.

Before and after every stage, a five-second harness-only drain requires the original supervisor process identities and zero zombies; no signals are sent to manufacture a drain. Persistent adoption/extra descendants/zombies stop later work. A measured pre-stop snapshot is written before Docker stop destroys the cgroup. Init/cap changes can only occur in a later independently reviewed packet/grant. Parent-controller counters are diagnostic only; no unrelated command line/environment is read and no container exec is used for sampling.

## Ordered execution after a new grant

1. Exact previously failed native startup case: **one selected test / ten explicitly deselected**. Require a real self-SIGKILL, two distinct fresh recovery PIDs/state, all three raw child results and a clean PID/drain gate. It must pass before any later job.
2. Full frozen native group: **11 cases**, requiring all passes, six kill boundaries/replays, tenant flag replay and public HTTP error assertions. Require all 21 raw child outcomes. No 37/48 repeat.

`plan.json` gives exact argv, unchanged single-worker/test timeouts, sanitized env and per-job receipt locations. The witness and native group use separate `/qa/receipts/<job>` subtrees, preventing the repeated tenant case from overwriting witness evidence. `analyze-results.cjs` checks only this witness plus native group; it never reports a new single 48-case pass. Old 37 results are identified by exact raw hashes/case names/profile.

## Observer isolation and credential boundary

The Node observer exists in the **parent fixture process only**. The frozen child entry does not import the process helper/observer; its injected fsync selectors cannot intercept another process's observation writes. Raw capture closes/fsyncs synchronously before the original close listener resolves the caller promise. The parent HTTP fault case never forks, so enabling the flag does not invoke the observer there. To cover late close/error paths too, the observer captures **its own** native fsync reference at module import, before tests install parent selectors. It never replaces a global fs function or changes the application's dynamic fsync calls. This small refinement is separately disclosed in `47b6826` and the patch.

Observation files live only under separate runner-selected receipts, outside every application's synthetic fixture tree. They record context/PID/exit/signal and raw child streams; they never record the fixture token argument, parent request headers, environment or real credentials. Child execution receives only the existing sanitized synthetic API/JWT/account/session allowlist. Any observation error/missing result/hash fails the qualifier; a missing checkpoint remains a failed application assertion.

This enabled observer adds pipe and receipt I/O. Its old default-off path and original fork/wait/result/25-second bound are preserved, but the 37 old-profile passes are not claimed under active observation/GOMAX. If new measurements change a relevant successful-path assumption, stop for disposition rather than assuming reuse. Hardware, B/F1/tenant/production gates remain open.

## Review and launch controls

`packet-hashes.json` binds every runtime member plus the source delta. Static checks only have run: Python AST, JavaScript syntax, archive hashes, application/test equality, scope/mount identities and observer-only no-emit types. No new runtime result exists. A false admission example is not a grant; actual controls stay private in the host-only ROOT `admissions` directory.

After independent approval and a fresh ROOT admission only:

```sh
python3 /home/ubuntu/tadazz-hq-qa-20261115/source/recovery-c1-e1fb1b28420a62acca17ddd69f1e72b3a9d27907-packet3-process/server-run.py /home/ubuntu/tadazz-hq-qa-20261115/admissions/ROOT_PACKET3_ADMISSION.actual.json
```

No launch is authorized by staging this packet.
