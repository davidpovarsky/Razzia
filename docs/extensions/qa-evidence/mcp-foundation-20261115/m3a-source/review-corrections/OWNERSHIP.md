# Source-only independent-review correction lease

Baseline product ad8955327a56213b3a437379fcc7ccc6e05a261a; evidence
e1994cf7c308352fd704c91a0ea96c220b87000d remains preserved.
Independent review SHA256:
8642a566699f6e96a0f5474414f8bca3a6e76d56e3be66636c6a648428a47a1e.

Root authorized preparing only these corrections and exact inputs, before any
new runtime grant. OAuth planning is deferred until they are resolved.

Pre-edit paths/responsibilities:

- first-party/schema.ts and NEW schema-manifest.ts: pin the original producer
  version1 DDL/object fingerprint, explicit columns/PK/unique/not-null/default/
  check/index structure, and reject unknown objects without repair or GET writes.
- first-party/ingress.ts, bindings.ts and http.ts: check the actual request
  signal at request/authentication/body/private-store/disclosure boundaries.
  Keep awaited work/budget ownership; do not race abort against pending auth.
- tests/first-party/store.nodecheck.ts: replace trigger-based audit failure
  injection with an actual in-transaction audit preparation failure so the
  rollback test retains its meaning under trigger rejection.
- NEW tests/first-party/schema.nodecheck.ts, abort.nodecheck.ts and
  schema-ad895.fixture.ts: old producer compatibility, missing operations PK,
  missing native NULL check, unexpected trigger/view/index, controlled post-body/
  post-auth abort and committed-write disclosure semantics.
- Supporting tests/first-party/review-evidence.fixture.ts captures only optional
  synthetic server witnesses under the owned /evidence mount. This entry records
  the helper now; it is not a claim that its exact name was listed pre-edit.
- first-party/README.md: state exact new guards and preserve cancellation,
  cross-DB revocation and syscall-observation limitations.
- Owned evidence under this review-corrections directory only.

No packages/**, editor, SDK/server/contracts/tests-server, package/lock/tsconfig,
actual auth service, credential/provider/client/config, mount or cache edits.
All original implementation tasks stay OPEN.

Proposed runtime: one0.25CPU/2GiB network-none job, <=8MiB additional physical
disk, own installed modules <=256MiB RAM, same read-only cache. NOT GRANTED.
One frozen bootstrap may be needed because the old ephemeral graph is gone.
Existing26 may run once with new witnesses; SDK41 must reuse its unchanged
source/lock/runtime proof rather than repeat. No local install/TC/project tests.
