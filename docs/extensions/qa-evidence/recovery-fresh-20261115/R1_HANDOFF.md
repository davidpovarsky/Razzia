# R1 native recovery witnesses — tests committed before execution

2026-11-15 05:30 UTC. **Corrected V2 oracle: 2/2 PASS. Actual native adapter
suite: 2 PASS / 7 FAIL. Production unchanged. All source tasks remain OPEN.**

Executed test-only commit: `bd4de1fb9b94548973c79f2f710bbec7f438e3e2`, parent
`e58350423727ba1c5aadf4164a2b09ee25745839`. The only existing source edit is
the exact manager-approved process-test oracle patch. Three new native test/support
files use actual protected callbacks and scope resolution. All twelve previously
reviewed blobs are SHA-verified unchanged; no `packages/**` source, dependency
manifest, lockfile, production implementation or original FAIL receipt changed.

## Exact source and execution provenance

Full source archive: 1,332 files / 121,758,976 bytes; tar.gz 112,727,387 bytes.
Archive SHA-256 `f97c79c377c3e7f1c4670c9d14518ccc0ce8bbf0e41bbf95028d089aaf7dabfc`;
manifest SHA-256 `5528d18ebb39d806c6ea22ec215df0c6b4017459042d78332ad15d5a4d2218f3`.
Manifest, package receipt, exact scripts, exits/logs, source verification and all
eleven raw process receipts are in `r1-server-bd4de1f/`. All eleven copied receipts
match SHA-256 values computed on the server; `analyze-results.mjs` checks them
before producing the offline `analysis.json`.

Server root: `/home/ubuntu/tadazz-hq-qa-20261115/` with NEW assigned
`source/recovery-r1-bd4de1fb9b94548973c79f2f710bbec7f438e3e2`, matching
`fixtures/.../work` and `evidence/...`. Dedicated container
`tadazz-hq-recovery-r1-20261115`, image `tadazz:design-system-qa-20261110`,
Node 24.22.2 ARM64, network none, zero published ports, 0.25 CPU, 2 GiB,
one worker. Actual memory/disk margin was checked immediately before preparation
and before native execution. All 1,332 delivered input hashes pass before/after
install, after V2, and before/after native execution, with zero mismatches.

Initial offline preparation failed because pnpm selected a new bind-mounted store
after hard-linking was unavailable. Its original exit 1/log are preserved.
The scoped retry used the same offline frozen install with explicit
`--package-import-method=copy --store-dir=/root/.local/share/pnpm/store`,
succeeded with zero downloads, and changed no delivered input. No local install,
build or runtime test was run. Local formatting/scoped strict types/freeze
files-only each exit 0; source-only `git diff --check` exits 0. Windows-generated
text evidence retains its captured line endings; raw QA receipts are not normalized.

This was producer-run server evidence, not independent acceptance. The runner is
stopped and the allocation released. Holder exit 137 follows explicit Docker stop;
it is separate from test exits 0 and 1. No production/customer mounts or data,
authenticated routes, tenant discovery, provider/network behavior, fsync or
hardware power-loss coverage is claimed.

## V2: the original serialization failure is resolved by the approved oracle

The exact command in `server-v2.sh` selects `quiz-(base|sidecar)-write` from the
existing process suite. Exit **0**, **2 PASS / 8 unselected**. The historical eight
Media successes are preserved and were not rerun here.

| Boundary | Interrupted PID / first startup / second startup | Result |
| --- | --- | --- |
| quiz-base-write | 99 / 113 / 127 | SIGKILL; recovered; then clean; exact second-state equality |
| quiz-sidecar-write | 141 / 155 / 169 | SIGKILL; recovered; then clean; exact second-state equality |

The original four e583 FAIL receipts remain byte-identical in
`r1-e583-byte-diagnosis/`. Complete decoded base/extra values were equal; compact
225-byte base serialization became native/default 375-byte two-space formatting.
The manager approved full strict semantic equality for the target V2 base, while
retaining exact sidecar, unaffected-show, binary and Media byte assertions. These
new passes do not replace the historical full-suite **766/768** FAIL result or
establish native binding acceptance.

## Native R1: observed failures, not hypothetical filename collisions

The unchanged nine ordinary tests ran once via `server-native.sh`, exit **1**,
**2 PASS / 7 FAIL**, 84.30 seconds. All six interruption children report SIGKILL.
Every scenario records both distinct fresh startup processes before any outcome
assertion. No native getter runs after the idless sentinel is installed.

| Witness | Actual result and both startup attempts |
| --- | --- |
| Media original basename | FAIL. Native file `native-r1-69VN1kgZ.json` remains detached. Recovery invents `Rftedyw2vLwUMn_1KWq0d.json` containing the old base; startup exits 0, clears journal, next startup claims clean. |
| Native V2 base-write | FAIL. Both attempts restore original native basename/base bytes and full V2 sidecar bytes, but exit 2 and retain one journal because the startup verifier reads the nonexistent ID-derived filename. PIDs 253 → 267 → 281. |
| Native V2 sidecar-write | FAIL. Same false unresolved outcome despite exact original bytes; PIDs 295 → 309 → 323. |
| Media foreign ID-derived sentinel | FAIL. The planted foreign file SHA changes from `07c5f6348054deaec7c3418af987e1964715a0b964ef6ebf03b97c56bc196fca` to victim backup SHA `c27e21f8188a5cb02dc1cda395699172d97acf739e6e526ffd8d2efedec4d0bb`; original victim basename stays detached. Both startups exit 0, journal discarded, then clean. This is actual overwrite in an explicitly planted synthetic collision, not evidence of an ordinary same-title native-save collision. |
| Quiz foreign ID-derived sentinel | PASS negative control. Both startups exit 2, preserve the foreign bytes and one journal; native victim and V2 bytes restored. PIDs 379 → 393 → 407. |
| Media sidecar-only record | FAIL. Recovery creates `quizz/wY8l7sFqvehPswtVRaM0V.json` containing **V2 sidecar JSON** (schemaVersion/quizId/scenes/etc., no base quiz ID), SHA `c97a59e75dba6fdbc1efb5875ec3a80553df49e4640a7e3297a1cc8ef1081d77`; it also creates the victim ID twin. Both startups exit 0 and clear the journal. |
| Native create → GET → export, ordinary | FAIL. Create and exported sidecar digest equal logical normalized payload `6b26da92fdaccc4f0d610b620ceaeddaf5bd2cf76569a38b4c3de85dc4c3a1f9`; GET hashes the ID-bearing record instead and returns `digestMatches:false`. Raw-byte ownership SHA is separately recorded. |
| Same chain, stripped extra field | FAIL at the same GET digest assertion. Public parser normalization strips the extra field; logical digest remains the same. GET digest again equals the stored ID-bearing record digest, not the logical payload. |
| Actual native stripped-field baseline | PASS. Native writer strips its extra input; normalized payload digest differs from raw input, ID-bearing record digest and raw-byte ownership SHA. |

Across all twelve native startup attempts: unrelated quiz bytes, full target V2
sidecar bytes and binary bytes are preserved; idless sentinel stays byte-identical
and idless. Public files are stable between the first and second attempts, including
the wrong Media outcomes. Stability does not imply correct restoration.

## Source cause and next approval boundary

1. `media-library.ts:874` reconstructs base path as `<quizId>.json`, ignoring the
   captured actual native filename. `loadAllShowsHealth` represents sidecar-only
   records using their sidecar `filePath` (`:156`); journal staging reads that path
   as `originalBaseRaw` (`:367`). Replay then writes those extras bytes as a base.
2. Production-shaped `recoverStartupJournals` supplies native update/delete but
   retains an internal ID-derived getter (`media-library.ts:1173`). Journal replay
   consequently restores through the native callback, then verifies through a
   different physical binding (`journal.ts:366–394`), causing false unresolved boots.
3. `service.ts:139` hashes the native ID-bearing GET record, whereas creation
   hashes its normalized payload (`:286`). Native formatting/ID allocation and
   stripped-input normalization are distinct from raw-byte ownership.

**Request manager disposition of a bounded F1 implementation ledger before source
edits.** Required outcomes are actual relative basename + file kind + raw byte
hash/length in new records; ownership validation before either sibling mutation;
sidecar-only/foreign ambiguity fail-closed; one read-only native binding for writes
and verification without a normalizing getter; normalized logical digest distinct
from raw ownership. Old records with insufficient ownership remain preserved,
with no guessed ID-derived fallback. Keep all nine R1 assertions unchanged.

F1 must also retain the independent review's binary verification/file+directory
fence before restoring references, failed commit-directory-fsync re-fencing gate,
and effective quiescence covering actual native CRUD/shortcut/fast paths. These
are not proven by this R1 run. C1 pre-ID creation reservation and any protected
seam remain separately gated. No production source edit, blanket full-suite rerun,
task closure, merge, push, activation or release was performed.

Asana checkpoint appended with prior notes preserved and exact native readback:
`1220109925694179`, `1220111293723790`, `1219882508725158` and HQ
`1220541793835278` all remain OPEN. Readback proof is in
`r1-server-bd4de1f/asana-readback.json`.
