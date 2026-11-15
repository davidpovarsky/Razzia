# Restore a published composition into a new draft revision

The original SB-06 scope requires version restoration without changing active-room pins. E already owns Builder undo/redo and installation rollback; this addition does not replace either. It fills the separate composition repository operation using the existing storage interface.

Both explicit repository classes inherit:

```ts
restoreDraft(key, expectedRevision, version): Promise<CompositionDraftRecord<Document>>
```

The operation validates the key and revision, reads the exact published version through the existing strict `version` method, then saves that full document through the existing atomic draft CAS. A successful restore produces `expectedRevision + 1`. It never overwrites a publication, calls `publishIfRevision`, mutates an installation or room pin, or upgrades a V1 document to V2. V2 restores include the existing native-presentation sidecar and all stable IDs unchanged.

Missing versions use `show-library:composition-version-not-found`. Stale or racing revisions fail through the existing draft-conflict path. Digest/tenant/publication validation precedes draft writes. Invalid revisions and revision overflow produce no write. Authentication and tenant-key construction remain the existing host/storage owner's responsibility; the repository is not an authorization service.

No storage method, document/wire version, V1 ABI, renderer payload, MCP digest, feature flag, or installation policy changed. E/F can consume the additive method at their normal integration point; no Builder/HTTP action is wired by this batch.

## Actual checks

`corrected/receipt.json` captures 25 passing tests across 2 files: 14 new restore cases (7 each for V1 and V2) plus the existing 11 repository cases. Focused TypeScript, two-file Prettier, and two-file oxlint all exited 0; lint ran 233 rules with zero diagnostics. Four source hashes before/after match, including both explicit repository facades. Exact raw streams, empty TC files, byte counts, and SHA256 are preserved in base64 plus display logs.

The cases cover full content/digest restoration into a new revision, immutable old publications, stale edits, missing/foreign versions, tampered digest and tenant keys, CAS race loss, invalid revisions and overflow. Synthetic storage implements the existing atomic protocol; this is not production-durability, real-database, browser, or active-room acceptance.

`initial/` retains the first 25-test PASS/TypeScript PASS/format PASS and lint failure on two synthetic test-counter increment expressions. The two counter expressions were corrected and all scoped checks rerun against the final exact source. Previously accepted integration suites were not rerun or relabeled.

Original SB-06 acceptance remains OPEN pending actual storage/consumer/media roundtrips and other outstanding product acceptance. No remote write/job, install, browser/build, provider, customer, production, push or deployment action occurred.
