# Minimal bound server run — prepared only

No runtime grant exists. Root must bind the final exact manifest to fresh
.25CPU/2GiB/8MiB ADDITIONAL physical disk, <=256MiB installed modules in own RAM,
network-none/portless capacity before any command below is executed.

Use the same accepted cache descriptor/index/inventory, read-only metadata
keeper and Node24.22.2/pnpm12.18.0 image. Prepare the private /ram/store from the
verified index and read-only CAFS links and BOTH own HOME metadata-full/metadata
links exactly as in the accepted prior cache consumer. No resolution, copying
the shared metadata, registry/pull or root dependency bootstrap. The previous
64MiB consumer must NOT be launched unchanged: its allocation/log/source paths
and old resolve/reinstall/SDK-fallback phases do not meet this8MiB lease.

The parent harness must verify all final160 source byte counts/hashes before
imports, meter all new source/evidence/container disk within8MiB, retain every
phase's first exit and cap each streamed log <=1MiB. Record Node/pnpm versions,
read-only mounts/cache pins, before/after exact source, own RAM usage, natural
exit/OOM state and returned compute. Keep shared metadata counted once.

On a FRESH own RAM source tree with no prior installed graph, the minimal
functional commands are:

    cd /ram/work/extensions/src/mcp-app
    pnpm install --ignore-workspace --frozen-lockfile --offline --ignore-scripts --store-dir=/ram/store --package-import-method=copy --verify-store-integrity=true --reporter=append-only
    test ! -e /ram/work/node_modules && test ! -L /ram/work/node_modules
    ln -s /ram/work/extensions/src/mcp-app/node_modules /ram/work/node_modules
    pnpm run typecheck
    MCP_SYNTHETIC_REVIEW_EVIDENCE=/evidence/review-witnesses pnpm run test:first-party
    MCP_SYNTHETIC_REVIEW_EVIDENCE=/evidence/review-witnesses pnpm exec tsx --tsconfig tsconfig.json tests/first-party/compatibility.observation.ts

Run each phase through the bounded evidence logger independently so a failed
typecheck/test is preserved and does not masquerade as an absent later phase.
There is exactly one frozen offline bootstrap and no forced reinstall.
If a genuine preserved installed graph exists and all pins verify, Root may
reuse it instead of bootstrapping; never clone a root node_modules tree.
The last command is ONE standalone compatibility observation in addition to
the unchanged34-test declaration count. The standard test script excludes it.

Use the existing image formatter read-only at
/cleanup/node_modules/prettier/bin/prettier.cjs and the accepted format options
(semi:false, tabWidth:2, singleQuote:false, printWidth:80, trailingComma:all).
Check only the changed authored c322/current test files, excluding the three
immutable ad895 source snapshots and their provenance.json. Never format the
frozen source copies: their original Git blobs are the compatibility input.
A formatting change to authored files requires a newly pinned source manifest.

The observation verifies all three complete original Git blob/SHA/byte pins
before dynamic import, the private lock and installed Zod4.6.6, and actual
Node24.22.2/Linux/arm64. The harness separately pins pnpm12.18.0 and the image.
It invokes the exact old initialize(db, syntheticOwner) export, closes it
normally, asserts there are no sidecars, and preserves that clean DB. It then
adds one canonical fixture row using ordinary parameterized INSERT only, before
the new API GET. The seeded-before-GET DB is also preserved. No DDL/version
rewrite or journal deletion occurs. GET compares the complete private/native
byte/mode/mtime/directory snapshot; normal authenticated PUT then advances the
same draft1->2 and produces exactly one operation/audit with native_id NULL.
Owner UUID, runtime, original blob closure, raw DBs and snapshots are recorded.
The normal fixture removes its own temporary root only after these receipts.

No retained crashed DB/journal or customer data is accessed. Native sentinels
stay equal. Account auth WAL/SHM and OS atime remain excluded from private-file
claims. Snapshot equality is not syscall-level no-write proof. No SDK41 rerun:
verify unchanged SDK source/package/lock/runtime/cache and reuse its recorded
actual result. Prior producer26 and C1 outcomes remain separate.
