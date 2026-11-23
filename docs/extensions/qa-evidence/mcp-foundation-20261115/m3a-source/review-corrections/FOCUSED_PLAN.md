# Corrected source candidate — runtime approval pending

The independent ad895 review is copied byte-for-byte beside this plan. Producer
ad895/e199 and every earlier result remain preserved. This candidate has only
source syntax parsing evidence; private TC, formatting and tests are NOT_RUN.
Previously used local formatter packages are absent. No package was installed
or server container started for this correction preparation.

## Schema decision

Keep producer schema1 and its data/wire shape. Creation uses the exact captured
ad895 CREATE TABLE statements. Admission first hashes the exact ordered
sqlite_schema objects against b23f8155290acc986cfbec7f4129f39342c11a6d8f793b18973d76ab3296ae6b,
then checks table_xinfo columns/defaults/not-null/PK positions, exact PK index
uniqueness/origin/partial flags and index_xinfo key order/collation/direction.
Four tables and three implicit PK indexes are the complete supported object set.
CHECK expressions are bound by the exact DDL fingerprint. Unknown objects/DDL
are rejected, never normalized, migrated or repaired. INTEGER rowid PK and the
legacy TEXT PK not-null flags remain exactly as the original producer declared.
Version/owner/quick_check checks remain after schema attestation.

The golden old-producer fixture is independent of the new manifest. Future
runtime must prove old producer compatibility before accepting this candidate.
No actual SQLite execution has established compatibility for the new guard yet.

## Cancellation decision

An already observed abort denies HTTP400 before private work at request entry,
post-initial-auth, post-body, post-principal and immediately before each private
store method. Post-method/response checks withhold disclosure if an abort is
then observed. Authentication is awaited to settlement; no abort race frees an
ingress slot while owned work is pending. Synchronous SQLite is not interruptible
under this policy, and committed data is not rolled back for a later abort.
Account/draft revocation remains non-linearizable across the two DBs.

## Focused synthetic witnesses

The existing26 are retained, with the audit rollback case changed from a trigger
to a forced audit-prepare failure after observing draft+operation inserts inside
the actual transaction. The additional eight tests cover:

1. Frozen old producer schema1 GET and mutation compatibility, GET unchanged.
2. Same visible owner/version/columns without the operations PK: GET/mutation
   unavailable, bytes/mtime/membership unchanged.
3. Same visible shape without native_id IS NULL: same preservation/denial.
4. Unexpected mutating trigger: reject before it can delete a draft.
5. Unexpected view and index: separate synthetic DBs preserved and rejected.
6. Complete body with final actual WebCrypto verification held: abort denies
   before store allocation; response stays pending until auth work settles.
7. Abort at the verified-principal promise handoff: real JWT/authority still
   checked; a test-only scheduling observation queues abort before dispatch
   resumes; no store allocation or private mutation.
8. Abort just after real COMMIT: response contains no private data; committed
   draft/operation/audit rows remain, demonstrating the stated limit.

Each fixture sets synthetic env/root before actual auth imports. No production
test hook, fake verifier success or caller-built principal is introduced.
Raw rejected SQLite files and before/after observations are captured if the
future harness sets MCP_SYNTHETIC_REVIEW_EVIDENCE=/evidence/review-witnesses.
That variable accepts only an own Linux /evidence path. These are synthetic
fixtures; no customer account/config/token is read or logged.

## Bounded future run, not granted

Root must bind fresh capacity first:0.25CPU/2GiB, <=8MiB ADDITIONAL physical
disk, <=256MiB own installed modules in RAM, network-none/portless, same read-only
cache and shared metadata keeper. No dependency resolution or lock change:
the private lock remains e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838.
The old ephemeral installed graph is gone; one ordinary frozen offline bootstrap
is allowed after grant. Use exact candidate inputs and preserve every first exit.

Run full private TC, six first-party nodecheck files (existing26 + new8 =34)
once and scoped formatting/source/lease checks. Retain raw schema witness DBs
before teardown, bracket private/native file state, and keep auth WAL/SHM separate.
No syscall proof is inferred from snapshots or notifications.

Do NOT rerun SDK41: verify its same source/lock/package/runtime/cache proof and
reuse the actual prior result. SDK/server/contracts/tests-server, core/common
and private package/tsconfig are unchanged. No protected or native/C1 hooks.
All implementation tasks stay OPEN. OAuth plan/implementation remains deferred
until these corrections are reviewed; no registration, mount, credential,
provider, renderer, download or release action is part of this phase.
