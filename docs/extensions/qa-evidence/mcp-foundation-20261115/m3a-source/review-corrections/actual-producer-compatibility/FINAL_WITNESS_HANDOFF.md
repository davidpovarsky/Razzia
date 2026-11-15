# Actual ad895 producer witness frozen — awaiting Root runtime binding

15 November 2026. Source candidate bfb796c72495f0f9d99442066f825a74ebd054d4.
The Site follow-up review f212c3d76e216c339a17a5a624091343fca0cb5ef44533f2c5fce75dceafeef3
accepts the c322 source corrections for bounded validation, with this actual
old-producer compatibility gate still required. No compatibility/runtime pass
is claimed. No app import, SQLite execution, install or server work occurred.

## Exact final inputs

- Application guards unchanged from c3226b6683c4d12b45fd553e090928092e1881b9.
- All prior155 input bytes unchanged; package/lock/tsconfig unchanged.
- Candidate source bfb796c72495f0f9d99442066f825a74ebd054d4 adds only five
  test-input leaves: the observation, three complete old modules and provenance.
- Final160-input manifest SHA256:
  4c02c37421191cd8ea2fe46e35c0b8a37467a7d89708a11bf8cd68047bac29ab.
- Final16-file thin overlay72466B; gzip30452B SHA256:
  4b7d492161100582dfd2b0871554c73f63d8d54eeb6e03856e7586db2d6060a6.
- preparation-summary.json SHA256:
  c2382fd921ead2ad9e82d1d3b5cf38fe6040fa2c4ea7a13096bf281eef521767.
- MINIMAL_COMMANDS.md SHA256:
  964aab0df5adf6c3b4545c98dc84f19dae3dd17e45a41d9e2739676b02f721fc.
- Producer provenance.json SHA256:
  306f771ef1e9cf5db4b89fca736dfe26c7387e465426140a24ea2a698ba27fc6.
- Private lock unchanged:
  e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838.

Apply final-source-overlay.tar.gz only over the verified original150 producer
tree, then check all160 byte counts/hashes against final-input-manifest.json.
This archive supersedes the prior11-file correction overlay for the next run;
all earlier artifacts remain immutable and retain their historical identities.

## Genuine implementation and import closure

The frozen producer commit is ad8955327a56213b3a437379fcc7ccc6e05a261a.
These are complete byte-for-byte Git blobs, not extracted initialize/DDL text:

| Original module | Git blob SHA1 | SHA256 |
| --- | --- | --- |
| first-party/schema.ts | 1413d9927f05cb0f5d9e1890c5e4219ec716b761 | 19c73e2a850515bb5bbef078aafbad4185306f7741f78a194a365716de929986 |
| server/errors.ts | 626c968dde34204c2cedf4f1f4a9d19c2a8ff519 | 9bdef8a34a50ff204d87cff417cac7475fa34ac349da363ab318f585713a4657 |
| contracts/schemas.ts | 8956231761975fd375fda441359443ea946353e7 | 8d2ab36da1292c178e0a974e9c331eed05e59adb97f530df11ae3ad3de812656 |

The original relative imports are unchanged: schema -> errors -> schemas ->
Zod4.6.6 from the unchanged private lock. Node:sqlite is the original schema's
type-only edge and the observation's actual runtime dependency. No stub/error
replacement, alias, source transform other than normal pinned TS loading, or
new package is introduced. Runtime must be Node24.22.2/Linux/arm64 with the
same image/cache and pnpm12.18.0. The source observation verifies the three
blob/SHA/byte pins, actual Node/platform/arch, private lock and installed Zod
before importing the complete old schema module. The harness pins pnpm/image.

The new isolated observation creates its own synthetic actual manager account,
records its owner UUID/runtime and calls the exact old initialize export on a
fresh private DB. It preserves that clean actual old-producer DB before adding
one canonical fixture row with ordinary parameterized INSERT. It does not copy
or rewrite CREATE statements, reset version, normalize SQLite SQL or delete any
journal. The new authenticated API GET then checks the same seeded DB and
preserves its full private/native bytes/mode/mtime/directory snapshot. The same
DB receives a normal authenticated PUT and must advance revision1->2 with one
operation, one audit, native_id NULL and unchanged native sentinels.
Raw initialized/before-GET/after-GET/final DBs and observations are preserved
under /evidence/review-witnesses before the own temporary fixture is removed.
Retained crashed hot-journal evidence is not opened or changed.

This is one standalone compatibility observation, separate from the unchanged
34 declared nodecheck tests. The original golden-DDL positive stays as a golden
fixture and does not satisfy this actual-producer gate.

## Actual static evidence and next bounded command

prepare-final.py exit0 verifies all155 prior input bytes, the exact original
three-module Git closure, c322 guards/private metadata,602 protected sources,
root lock and zero unleased paths. Four new TS syntax parses exit0 on local
Node22.17.0 without app imports. Staged whitespace check exit0.
verify-final.py exit0 additionally checks all160 source files against their
committed bfb796 Git blobs and verifies every regular read-only archive member.
Raw unmodified freeze guard remains FAIL56 leased paths/mismatches[], no waiver.
Full TC, formatting,34 tests and this separate observation are all NOT_RUN.

After Root binds fresh .25CPU/2GiB/8MiB additional physical capacity and own
RAM modules<=256MiB to these exact inputs, use the existing verified read-only
cache/metadata and a single normal frozen offline bootstrap. No resolution,
reinstall or SDK41 repeat. The complete environment/preconditions, capped
phase logging and minimal commands are in MINIMAL_COMMANDS.md; the functional
sequence is frozen offline install, private typecheck, test:first-party, then:

    MCP_SYNTHETIC_REVIEW_EVIDENCE=/evidence/review-witnesses pnpm exec tsx --tsconfig tsconfig.json tests/first-party/compatibility.observation.ts

Preserve first exits and exact source/resource receipts; separately check the
scoped authored-file formatting while excluding immutable producer copies.
Prior producer26/SDK41 and C1 outcomes remain distinct. No syscall zero-write
claim follows from snapshots. All original implementation tasks remain OPEN;
OAuth/host/render/native/C1/R2/download/mount/release gates stay separate.
