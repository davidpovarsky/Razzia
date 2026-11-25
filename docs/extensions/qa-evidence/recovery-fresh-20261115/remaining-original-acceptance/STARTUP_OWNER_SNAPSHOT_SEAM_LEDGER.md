# Approved startup owner snapshot seam — pre-edit ledger

Manager contract decision in chat `01a1dfa1-57d8-7223-a965-2f4f31fe8b23`
explicitly assigns Lane B the additive account-db export and startup composition,
plus downstream explicit-root recovery/tests. Base is
`dd18d31c8a54307394e66bbeb3b347f90a12c12d`.

- `packages/socket/src/services/account-db.ts`: add a non-creating trusted owner
  snapshot from the actual existing accounts table, all exact IDs, independent
  of account flag/session/disabled status. Existing bootstrap and auth functions
  remain byte-identical. Validate physical configured root/store path and owner
  metadata; fail closed without journal mutation. SQLite/WAL no-write behavior
  will be tested on actual Node/OS, not assumed from readOnly.
- `packages/socket/src/index.ts`: replace only ownerless legacy Media/Sidecar
  recovery composition with snapshot-bound explicit global/tenant recovery
  before listen. Preserve C1 hook and account bootstrap/auth semantics. No global
  account-scope fallback change or other protected source edit.
- Downstream: explicit-root plan validation and existing native filesystem
  recovery adapters, with all metadata/root admission completed before journal
  mutation. No schema, owner registry, migration, B/F1 or hardware work.

Reason: two executed original-requirement failures show ownerless startup
missing critical tenant journals, while explicit tenant positive controls detect
the same evidence. A trusted owner provider is missing from the old interface;
directory scanning or a mutable getAccountDb enumeration fallback is rejected.

Focused checks: original two cases, clean/global-only structural absence,
all-row disabled/unverified owners, accounts flag changes, wrong/unsafe/missing/
corrupt metadata, duplicate/case-conflicting IDs, no source DB/WAL/SHM or
permission mutations, explicit known-root restoration and repeated replay.
Existing relevant legacy regressions and scoped types/format/source audit only;
no full819 rerun. No production/customer/provider operation.
