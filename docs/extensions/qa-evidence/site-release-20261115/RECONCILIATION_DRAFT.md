# Reconciliation successor — incomplete source draft

**Historical 3b77 draft; no execution.** Astra required changes to the reviewed
`3b77` coordinator. Its exact bytes and this earlier draft are preserved in
`history/v2-3b77-reviewed`. For the current successor and remaining gates see
`DURABLE_INTERLOCK_WORKING.md`; the production review gate remains false.
The independent v1 trial remains on the
read-only `history/v1-9b035-reviewed/` copies. The successor deliberately has
an explicit closed review gate, so its coordinator refuses execution.

The intended reconciliation uses the original, retained input files and private
verified backup under the same exclusive operator lease. It classifies the
public tree from hashes: old entry with a subset or all of the expected new
assets, complete new tree, or foreign/ambiguous. A complete new tree with a
verified old backup can be rolled back without relying on a publish journal.
An existing rollback staging file is accepted only if its bytes match the
verified old index. Unknown bytes or paths must be preserved and denied.

The previously reviewed `3b77` implementation did not pass the independent
source review and is **not ready for production**:

* The process retains its flock during an interactive uncertainty disposition,
  but a lost exec may still be running. Before reconciliation or rollback the
  operator must independently establish that it stopped. EOF, process death or
  host failure can release the flock, so the separate manager lease must
  remain in force; this behavior needs independent tests and review.
* The production allowlist is the manager-measured exact bind tuple
  `/app/config` from `/var/lib/tadazz-release-5312660/config`, writable.
  The flock path is `/home/ubuntu/tadazz-release-control/production-release.lock`.
  The two older cutover scripts and manual lifecycle commands require the
  manager-approved wrapper. The manager's read-only qualification classified
  the named package-build worker as isolated from production targets; this is
  not a claim about arbitrary root scripts. Automatic restart and OS failure
  are not covered by the advisory lock. The manager must not independently
  hold the flock when invoking the helper: the helper acquires it itself under
  the separate manager HQ lease.
* The receipt's SHA-256 is `ff28b4363b86e3f7430ccc895872d0390c5943c6955f8f5e9003b83232ab99d9`.
  Its public file sizes and hashes are checked against the pinned inventories;
  each file is size-checked before body reads. The 41 transfer bodies total
  3,315,539 bytes; tar assembly is capped to their exact total plus the pinned
  manifest/receipt lengths and 1 MiB for archive overhead, with a 6 MiB hard
  tar cap before allocation. The receipt itself
  must be retained with the other immutable operator inputs and provisioned
  in the operator directory before any future trial.
* Failure-injection, same-filesystem durability, concurrent-exec and synthetic
  container tests have not run for the successor. The eleven local Python tests
  exercise parsing, manifest invariants and mocked coordinator outcomes only.
  The reviewed v1 trial does not validate this changed successor.

Retain the complete input set and old backup throughout the rollback window;
backup-only recovery is not promised. No backend, server, customer-data or
production execution is authorized by this document.
