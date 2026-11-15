# Recovery C1 native qualification — owner-activated wave

Lane B, chat `01a1dfa9-5c5a-7723-8993-110f2dfe4892`, branch
`codex/tadazz-hq-recovery-fresh-20261115`. Source GIDs: Media Delete
`1220109925694179`, Sidecar V2 `1220111293723790`, creation/import rollback
`1219882508725158`. **All remain OPEN.**

The previously missing native qualification now passes: one startup witness
(1 PASS / 10 deselected), followed by the unchanged native group (11/11 PASS).
An additional single witness with the old, unset Go scheduler also passes.
This is producer qualification of prototype A's one synchronous cooperating
writer. It is not a new 48-case run, independent consolidated acceptance,
hardware power-loss evidence or production enablement.

## Source and observed correction

Executed application source is `e1fb1b28420a62acca17ddd69f1e72b3a9d27907`, with
the existing Node observer `47b68268375b5adf8c56a8496882830bc5922de3`. Application
code, child entry, five tests, assertions and timeouts are unchanged from
activation HEAD `50e40eb842f9d19fbc918141fc758fedbc322302`. All 20 archive
members match the current worktree. Preparation commit is
`bb74091de039d23c1c4ae25d46d5374ed6e18270`.

Packet5 reached an actual isolated container but stopped before tests:
the pinned Node24 process's `/proc` comm is `MainThread`, while the inherited
controller required `node`. Its retained samples show one namespace PID1
process, seven threads, zero zombies and zero PID-limit events. This was a
PROVISIONING_ERROR, not a failed application case.

The corrected controller accepts the observed Node comm and additionally binds
the supervisor's host PID to Docker's owned init PID. With init enabled its
optional two-process branch also requires the child to belong to that pinned
parent; init was never enabled in these trials. Future drains continue to
require the original PID/start-tick identities, no extra processes and zero
zombies. No PID, CPU, memory, test or timeout ceiling was widened.

## Executed trials

| Trial | Actual result | Process/resource evidence |
| --- | --- | --- |
| Packet5, init OFF, GOMAXPROCS=1 | Pre-test supervisor-name refusal; 0 application cases | Container stopped; 8 downloaded files SHA-match; 11 frozen packet inputs unchanged |
| Packet6, init OFF, GOMAXPROCS=1 | Startup witness 1 PASS / 10 deselected, then native11 11/11 PASS | 24 raw child results: 8 SIGKILL, 16 exit0; all drain gates pass; 134 downloaded files SHA-match |
| Packet7, init OFF, GOMAXPROCS unset | Comparison witness 1 PASS / 10 deselected only | 3 raw child results: 1 SIGKILL, 2 exit0; all drain gates pass; 48 downloaded files SHA-match |

Packet6 checks six genuine native kill boundaries: before public linking,
after sidecar linking, before ID return, committed marker visible, private
witness cleanup and before resolved-slot removal. Every boundary has its own
checkpoint and two distinct fresh replay PIDs; the second replay recovers zero
additional work. Both real JWT/session tenant creations, pending tenant
creation followed by accounts-flag change and startup discovery, private HTTP
create/import failure responses, ordinary native CRUD, idless legacy bytes and
accounts-off legacy import are exercised by the 11-case group. The tenant
witness also runs separately before that group.

Each successful packet verifies 1,288 effective inputs plus two auxiliary
inputs before/after its jobs, and separately verifies all 1,391 retained base
inputs. All mismatches are empty. Each packet's 11 frozen transferred files
remain unchanged after execution. Raw stream lengths/hashes and all 27 child
outcomes across the successful trials are independently rechecked offline.

The old 37 passing cases remain **REUSED old packet2-profile evidence only**:
their raw results, case names and unchanged source/test bytes are hash-bound.
They were not rerun or relabeled. In particular their revision/foreign-evidence
and repeated failure/retry cases do not become new observer-profile passes.
The historical C1 41 PASS / 7 FAIL and R2 full 813 PASS / 6 FAIL remain intact.

## Go/resource diagnosis and limits

Packet6 has 87 resource/drain samples, kernel pids.peak 66/96, zero PID-limit
events and zero observed zombies. Packet7 has 30 samples, peak 47/96, zero
events and zero observed zombies. All before/after drains complete on their
first clean sample. Both use the same pinned Node24.22.2/dependencies, .25 CPU,
2 GiB, 96 PIDs, network-none/read-only source profile and persistent ext4 device
2049, with private UID/GID1001 fixtures. No tmpfs substitution, install or pull.

The original esbuild/Go failure is **not reproduced by either fresh isolated
witness**. The old failed trial has no live PID-controller/zombie/peak history,
so this does not establish its exact cause, demonstrate that GOMAXPROCS=1 was
necessary, prove accumulation across its old prefix, or justify a larger cap.
No init change was necessary. No broad 37/48/819 rerun was made to manufacture
a cause or a new aggregate pass.

Minimum sampled free disk is 2,646,425,600 bytes. Maximum sampled accounted
growth is 17,571,840 bytes; retained cumulative accounted growth after stopped
packet7 is 11,984,896 bytes, including the prior 782,336 bytes, both subsequent
iterations, host controls, writable layers and a conservative 2 MiB metadata
reserve per new container. This stays inside the same 64 MiB allocation.
Both new runtime claims are terminal and released; the old manager-reconciled
claim was not released twice. Every new runner is stopped/PID0/OOMKilled=false.
No other owner's container was signalled or modified.

## Acceptance and handoff decision

The current missing native process/tenant witness is closed within prototype A
and ready for manager source/evidence review and integration as a coherent
batch. No application defect was observed by the new native cases; the actual
change is the diagnosed host-controller identity correction and execution
evidence. The full original tasks remain open: independent consolidated
acceptance and applicable original release conditions remain; legacy opaque
`/quizz` creation, all-writer B coordination, historical Media/V2 tenant-root
discovery, F1/hardware/storage migration and production adoption are not
established by this C1 run. Their previously documented boundaries are not
silently expanded into new implementation work.

Local checks: 11 content-control validation cases PASS, Python AST/JavaScript
syntax and packet/archive/current-source hashes PASS, exact protected-hook
audit PASS. Official files-only boundary remains exit1 for the same three
inherited socket mismatches. The frozen raw patch's context-line whitespace is
preserved; source whitespace excludes only that exact patch artifact in each
new packet. All 16 inherited untracked files retain their original hashes.

Evidence: `c1-wave-final-verification.json`, `c1-execution-wave-packet{5,6,7}/`
(raw host/results/receipts, archives, download manifests, readback verification),
packet6/7 resource summaries and `host/analysis.json`, immutable
`c1-server-packet{5,6,7}/`, transfer receipts and driver logs. No deployment,
push, merge, customer data action, provider spend or credential/settings change.
