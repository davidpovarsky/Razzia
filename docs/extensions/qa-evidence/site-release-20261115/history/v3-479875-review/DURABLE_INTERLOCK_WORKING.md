# Durable exec interlock — source review candidate

This is not a live recovery procedure. The reviewed `3b77` helper, tests,
draft and measured receipt are frozen in `history/v2-3b77-reviewed`. The
successor production `REVIEW_GATE` and legacy wrapper gate remain false. The
explicit fixture target calls the same coordinator and Engine adapter. No live
action is authorized; independent source review and separate successor QA are
required before any production decision.

## Required state and transitions

- Under the same private-directory canonical flock, persist and fsync a
  no-expiry hold with nonce, requested action, immutable target ID/image/start,
  mount tuple, exact helper/input hashes, and state before any create/start.
  Every cooperating entrypoint checks the same hold before writing. Never use
  wall-clock expiry, an interactive word, a missing handle, or a current process
  list as proof that a prior writer cannot run.
- Use the Engine exec-create API and durably record its returned exact exec ID
  before the single exec-start request. Record positive start acknowledgement
  for that ID, then inspect and persist a terminal stopped outcome for the same
  child. Create, start, inspection and crash windows must be independently
  tested against the daemon's actually supported API. A pre-start stopped
  snapshot is not proof of completion; missing/evicted IDs and unrecorded or
  ambiguous acknowledgements remain blocked indefinitely.
- The launch mechanism must prove that no surviving launcher or queued start
  request can issue a later start. A synchronous spawned `sudo docker exec`
  does not meet this condition. On loss, permit only explicitly labelled
  read-only observation that may race the lost operation. Recovery itself is
  a separate identified mutating child with the same persisted hold and lock;
  first prove the old child started and stopped, then recheck identity, mounts,
  the exact public tree, complete backup and all input pins.
- Emit one authoritative terminal verdict for the original requested action,
  including any recovery action, actual classification and final identity.
  Reconciliation or rollback resulting in an old entry must never be reported
  as successful publication. A genuine I/O error remains unresolved until
  qualified re-verification and fences, not merely a matching later read.
- Full coordinator QA needs explicit immutable synthetic target injection,
  validated before each action: fresh complete container ID, unique name and
  nonce label, known image/start, network none, no ports, exact allowed synthetic
  mounts, and distinct owned operator/control/lock paths. Always reject all
  production identifiers and paths; no target field may fall back to production.

## Cooperating controls

The helper must itself acquire the canonical host flock while the manager's
separate non-expiring HQ lease excludes all other production writers. The two
old cutover scripts and authorized manual Docker lifecycle commands require a
wrapper that checks the same persistent hold under the same lock; source and
hashes of old scripts must stay unchanged. `legacy-control-wrapper.py` is a
review-only, disabled implementation; it has not been installed or executed.
The named package builder was classified separately
as isolated; arbitrary root scripts are outside this cooperating contract.
Automatic restart/OS failure remain outside the lock and require indeterminate
handling if identity or proof changes.

## Engine probe and current work

After the manager restored disk headroom, a synthetic Engine API 1.52 probe ran
in a fresh network-none container with 0.1 CPU, 128 MiB, no ports or mounts.
Create produced a full exec ID; inspect returned `Running=false` before start,
the single detached start returned HTTP 200, the same ID then reported running,
and its terminal inspect reported stopped with exit 17. The container was
removed and disk remained above 2 GiB. Evidence is in HQ
`docs/tadazz/qa/fresh-team-20261115/engine-exec-probe-site-20261115/` and the
corresponding remote evidence directory. Assertions SHA-256 is
`bc49c3fa441bf144ef6cf3dce996d4a4ab62ab3af0f8a8a948dd9a9578be5142`.
The remote shell itself exited 1 after the assertions because of a trailing CR;
independent readback confirmed its recorded assertions and probe removal.
A second equally restricted synthetic probe attempted to restart the same
completed exec: API 1.52 returned HTTP 409 and inspection still showed stopped
with exit 17. Its assertions SHA-256 is
`83ecb8be04a42b0526e88339e58f7edfeee92f9778518e338a49aef730845437`;
evidence is in the sibling `engine-exec-probe-site-retry-20261115` directories.
That container was also removed; the wrapper again exited 1 on a trailing CR
after recording its assertions. These probes did not simulate a lost start
acknowledgement, and establish no general lost-start guarantee.

The successor uses the Engine socket directly in the coordinator (the host
operator must run it with socket access); no subprocess launches its mutating
exec. It fences the hold and exec ID, records start intent, records the start
acknowledgement and a positive running observation before sending stdin, and
requires terminal inspection of that ID. Incomplete states retain the hold.
The separate HQ lease file and reviewed helper hash must be provisioned in the
private control directory; the lease authorizes all requested recovery actions.

Focused synthetic results on helper `479875362995a714489b1d5f3c507dbad1593895f151f5350b3fe1490f215785`:

- Ten isolated Linux unit/static cases passed in a 0.25 CPU/256 MiB,
  network-none container; source was mounted read-only. The unit receipt is
  `/home/ubuntu/tadazz-hq-qa-20261115/evidence/site-interlock-final-unit-20261115/`.
- Attached stdin transport and durable exec state passed with a synthetic
  non-mutating child on helper `98af669428650804a400ed3e850c6fbcdef74ff172d18364a1a9665fadd3e33d`;
  this predated the lease and target refinements. Evidence is
  `/home/ubuntu/tadazz-hq-qa-20261115/evidence/site-interlock-stream-20261115/`.
- With the current helper, a read-only synthetic baseline with no stage returned
  an indeterminate reconcile verdict and retained a stopped nonzero exec record.
  Receipt: `.../evidence/site-interlock-coordinator-20261115/`.
- A current-helper test killed the coordinator while a known synthetic child
  remained running. Publish, rollback and reconcile all remained indeterminate
  and the started hold survived. After that same child stopped, a separate
  reconcile child was allowed, then failed closed because there was no backup.
  Receipt: `.../evidence/site-interlock-disconnect-recover-20261115/`.

The complete successful publish/rollback filesystem path, public serving,
faults at every fence, lost acknowledgement, changed target start, physical
power loss and independent successor QA have not been tested. An orphaned
temporary hold file or a crash while archiving a verified disposition fails
closed and may require a separately reviewed administrative recovery. The
review-only legacy wrapper retains a permanent hold even after a normal legacy
return because it cannot yet prove every possible descendant stopped. It must
not be installed. No rollback completion or release is claimed from these tests.
The old 3b77 local mock tests are preserved with its frozen copy and do not
validate this work-in-progress.
