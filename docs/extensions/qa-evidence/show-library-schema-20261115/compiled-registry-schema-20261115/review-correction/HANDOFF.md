# Independent review corrections — source only

Root assigned the exact three findings in COMPILED_REGISTRY_155C_REVIEW_20261115.md
(SHA-256 14070018f834d4ed15fd69627b46378fc3f260bf3c5dc3368cd7d45a227b1dea).
Only the NEW schema, byte-validation and test leaves change from 155c. The host
authority leaf and all 26 older accepted files/barrels/runtime stay unchanged.

1. A single case-folded regular-file tree check now rejects duplicate/case aliases
   and file/ancestor collisions in artifact/resource/license paths, tracked-source
   files, per-package source groups and concrete dependency/store/platform file
   collections. Importer directories are not treated as regular files. Reserved
   outer index/registry/pin root names are checked case-insensitively, including
   a path that would use such a reserved file as an ancestor. No normalization
   silently rewrites an identity.
2. The declared artifact source revision is a single repository snapshot. Every
   tracked input and the build recipe must use that commit; the exact recipe
   record must occur in the declared input set. Tracked path case aliases and
   file/ancestor pairs are rejected. Per-package file trees are checked within
   their own locked package root, with consistent package integrity. This is
   diagnostic consistency, not proof of actual Git/lock membership.
3. Evidence-map keys must be ordinary bounded strings using the exact artifact
   path policy before any diagnostic interpolation. Intrinsic Map size/entries
   operations reject non-Map/proxy values and bypass subclass overrides; an owned
   map is used for later lookup. No arbitrary key conversion runs. Raw byte-array
   values remain host-owned ordinary Uint8Array/Buffer snapshots, not caller JSON
   or a claim of production TOCTOU/immutable-serving verification.

The synthetic positive fixture now includes its exact recipe. Twenty-four new
isolated witnesses cover mixed-case reserved roots, file/ancestor pairs and case
variants, declared/input/recipe commit mismatches and exact membership, tracked
aliases, package/resource/license trees, oversized/object/symbol/traversal/control/
absolute keys, poisoned Map methods and proxy/non-Map evidence. There are 53
AUTHORED cases in the one new test file; none has run. Positive parse remains
unavailable/diagnostic-only with empty immutable receipt registries and zero pins.

Actual validation: direct local Prettier and Babel static syntax/import audits
PASS, source-case count 53, all 26 accepted hashes match, only the three assigned
new leaves differ. The authority file is unchanged. No local project/pnpm script,
functional test, TypeScript, build, browser, remote probe, upload, allocation or
server command ran for this correction/preparation. Prior pnpm auto-link incident,
ignored links and both raw guard failures are preserved; no cleanup/reset/install.
D095 remains FAILED_PENDING_REPLACEMENT; historical examples remain unchanged.

CORRECTED_STATIC_RECEIPT.json binds final source hashes. A separately committed
server-plan will bind this corrected Git snapshot and propose exactly this one
test file plus focused TypeScript, without any old metadata/theme/broad rerun.
Source review and explicit resource execution grant are still required.
