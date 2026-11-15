# Atomic web publication proposal — independent QA protocol

**Preparation only. Neither the helper nor this plan has run against any
container. No production execution is authorized by this file.** Independent
review and isolated trials precede a separate manager go/no-go. The Python
helper is `atomic-web-publish.py`; its production CLI has fixed expected
container ID, image, start time, operator directory, manifest hashes and paths.
There is no CLI option for an arbitrary root or container.

## Boundary and publication contract

- The host reads only fixed public operator manifests/artifacts. It verifies the
  202/242-file inventory hashes, exact intersection delta (`index.html` only),
  40 new asset names and all 152 artifact bytes; inspect obtains only container
  ID/image/running/start. No environment/config/customer data is read.
- The fixed container-side program verifies the entire current public web tree
  against the 202-file manifest *before creating the stage*. Directory and file
  traversal uses no-follow descriptors, requires a single device, and rejects
  symlinks, special files, unexpected files and directories. New files are staged
  under `/app/.tadazz-web-release-31b3cb0`; this private directory is outside
  `/app/web`. Root is required, with stage mode 0700 and backup files 0600.
- It copies all 202 public files to a verified, fsynced private backup, retains
  the original index and both manifest files, stages and verifies new data, then
  creates exactly 40 public new asset names via exclusive atomic hard links with
  file/parent fsync. Existing files are never overwritten. It rechecks the full
  intermediate inventory before replacing `index.html` with one `os.replace`
  and fsyncing its directory. It then checks all 242 expected file hashes.
- Rollback requires a confirmed publish journal and exact 242-file candidate
  tree/new index, validates the full old backup, creates/fsyncs a fresh copy of
  the old index and atomically replaces the current index. The 40 new assets,
  backups, journal and all other public files remain. Repeated publish/rollback,
  foreign index, partial stage or unexpected inventory fail closed.
- Journal files are create-only, fsynced 0600 and record index/manifest hashes,
  phase, source/app revisions, old backend image and candidate web image.
  Failures preserve stage and assets. A failed syscall or failure around index
  replacement reports uncertainty; absence of a final phase is not proof the
  index stayed old. An operator must inspect actual hashes and the journal.

The current running OCI image and Node process would still be the base image;
the candidate image ID is a provenance label for the effective web bytes, not
a claim of immutable-image activation. A later container recreation may use
the candidate image. This web-only method does not change or back up customer
databases, mounted config or running process state.

## Mandatory safety assumptions for review

The full manifest check and two host identity checks cannot make Docker inspect,
filesystem verification and POSIX rename one transaction. The procedure requires
an exclusive, externally enforced web-writer/restart lease covering all checks
and publication; the code cannot prevent a noncooperating writer or restart in
the final check-to-replace interval. Docker exec uses the exact container ID,
and a post-operation identity failure reports uncertain outcome, but it cannot
undo a race. A stage left by any prior attempt is deliberately not recovered
automatically. No actual overlay/dir-fsync/hard-link semantics are yet proven.
If those assumptions cannot be verified for the target, stop and do not publish.

Host input collection also assumes the private operator directory remains under
exclusive operator control during its scans. No first-party control of other
writers is asserted. The proposed public-web backup contains no database data and
does not replace any existing customer data backup or authorize a data restore.

## Exact isolated trial for independent QA

1. Acquire a separate runner and start a new network-none synthetic container
   from immutable base image `sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346`,
   with no public ports, no Docker-socket mount, no production mounts, fake-only
   credentials and isolated tmpfs config. Create a real synthetic unstarted room
   with a joined player. Record the server process PID/start, room identity and
   active client state without exposing real identifiers. Use the exact public
   base/candidate inventories and 9b artifact; retain image/input hashes.
2. Load the unchanged helper via `importlib` in a QA-owned host harness and
   override only `CONTAINER`, `IMAGE`, `STARTED` and `OPERATOR` in memory to the
   newly created synthetic target/operator copy. The embedded path remains
   `/app/web` and the stage remains fixed. Record helper SHA-256 before/after,
   overrides and all Docker commands. Assert target container is the synthetic
   one before any execution; do not mount a Docker socket into the QA container.
   Run `python -B test_atomic_web_publish.py` from a QA-owned copy for static
   manifest/path tests, then call `run("publish")` once.
3. During and after publish, assert backend PID/start unchanged, same room and
   client still connected, existing participant can submit a synthetic answer,
   health and expected cache headers hold, index changes atomically, all old
   202 and new 40 file hashes match the candidate inventory, and every asset
   referenced by both old/new entry points is present. Verify 0700/0600 backup,
   backup hashes, journal phases and actual overlay fsync/link/replace behavior.
   Run `run("rollback")` and verify old index, all 242 retained file hashes,
   same PID/room/client, continued synthetic answer handling and cache behavior.
4. Use fresh isolated targets/fixtures for each negative case: foreign index,
   modified shared file, extra file or empty directory, symlink/special entry,
   changed container ID/image/start, asset name collision, already-existing stage,
   and repeat publish/rollback. Each must fail before unsafe mutation, with
   expected state and journal captured. Test a simulated failure immediately
   before index replacement in a QA-owned wrapper that intercepts only that
   syscall in memory; document instrumentation and verify old index remains,
   new assets/backups are retained and journal correctly reports failure. Also
   inject an fsync failure at/after replacement and verify the status is
   explicitly uncertain and actual old/new hash is measured, not inferred.
5. Preserve full logs, command exits, manifests, backup hashes and time-ordered
   journal entries. Test container restart during the check/replace interval to
   characterize, not falsely close, the non-atomic external-lease gap. A failure
   or unsupported overlay primitive is a blocker for this method. No production
   action, customer backup restore, network service, paid operation or release
   approval is implied by a passing synthetic trial.
