# SB2 schema foundation — validation request

**Current successor: INTERNAL PORT VERSION 2**, adopted in
`HQ/docs/tadazz/decisions/SB_PORT_V2_IDENTITY_20261115.md`. See
[PORT2_STATUS.md](PORT2_STATUS.md) for current identity representation, validation
receipts and version policy. The initial port1 packet below is historical;
its exact original README is preserved in `initial-port1-README.md` and original
`source-overlay.tar.gz`/`source-manifest.json` remain unchanged. Port1 is explicitly
rejected by current code. No runtime/renderer acceptance follows from adoption.

Owner: show_engine `01a1dd19-5220-70d3-8349-e9e135399b4d`.
Source base: `8a43c99c65d8923bd23d8c57ac3607e9a09b5764`.
Branch: `codex/tadazz-hq-show-library-20261115`.
Worktree: `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115`.

This directory and `extensions/src/core/show-library/**` are the sole writes.
No existing source, root/package exports, dependency manifests, presentation,
server/storage, editor, site or legacy data is modified. No renderer is shipped:
the accepted compiled manifest has zero pins and every resolved plan reports
unavailable. Candidate component/schema presence cannot manufacture readiness.

## Implemented scope

- Strict Zod component/template/motion/asset/sidecar-composition schemas;
  candidate-only availability, semantic binding/role/phase constraints, bounded
  props/layouts, graph depth/size/child/reference/invariant checks.
- Immutable registry/manifest formats and version fingerprint checks; external
  manifest syntax does not confer trust or renderer availability.
- Actual `tadaShowV1Schema` normalization and existing theme resolver/registry;
  derived package `RUNTIME_PHASES`, stable UTF-8/card-key preview IDs, canonical
  digest-content export. M2 remains sole MCP envelope serializer owner.
- Explicit no-room demo context, phase/role-redacted `projectShowBindings` and
  output schema restrictions. Fixtures are deterministic synthetic data; no
  live projection, socket, score engine, scheduler or audio owner is added.
- Independent asset/audio/motion/template override section data, exact matching
  theme scope and metadata-only tenant/export/deletion checks. These are not
  storage authorization, media transport, refcount transactions or persistence.
- Test-only shared fixture entry point, not re-exported from production.

## Validation status

Focused tests/typecheck/format/runtime checks: **NOT RUN** on Windows; local
execution is not authorized for this wave. No installs/build/browser/device or
provider actions performed. A coherent server runner window is requested through
the manager. Test assertions below are prepared coverage, not passing evidence.

With preinstalled matching baseline dependencies and no implicit install, run
from the actual exported source root (one worker; no concurrent site browser):

```sh
pnpm --dir extensions exec vitest run \
  src/core/show-library/identity.test.ts \
  src/core/show-library/registry.test.ts \
  src/core/show-library/projection.test.ts \
  src/core/show-library/preview-port.test.ts \
  --maxWorkers=1 --no-file-parallelism
pnpm --dir extensions exec tsc --project src/core/show-library/tsconfig.focused.json
```

Use the installed repository formatter for only the leased new files; retain
exact commands and failures. Check all existing file hashes against the base,
and run the mandated `pnpm --dir extensions ui:check`/freeze guard. Node22 needs
process-only `--experimental-strip-types` for the token check; never alter global
configuration. The historical TDS guard may reject newly staged `core/show-library`
paths because its old incremental allowlist predates the manager's explicit new
lease. Record its actual result; do not edit/bypass the guard or claim a raw PASS
if it fails. An exact base/current protected-file comparison plus the new lease
footprint is the independent source-preservation evidence, not visual parity.

Prepared cases cover SHA256 against Node crypto, canonical JSON/prototype/cycle
defenses; stable/reordered/non-ASCII/Q3-edit IDs; real authored schema rejection of
0/1/6/64 answers (current MAX_ANSWERS is five); unknown themes, forged draft/plan/
compiled pins, version immutability; graph/binding/role/phase/system limits;
independent sections/metadata rights; all runtime phases and roles, hidden results
and choices, private/controller fields, disabled live actions, transient 0/1/5/64
fixture projection without truncation. A fixture with 64 choices is not a saved
authored show or proof that any actual renderer supports 64 answers.

## Compatibility counterexample and proposed successor

`identity.test.ts` contains an executable (not yet run) counterexample:
an actual authored card key `constructor` passes `tadaShowV1Schema` while preview
identity-rule1 dictionary handling rejects prototype-sensitive keys explicitly.
The stored authored JSON is left unchanged; no cast, hidden field or key rename
is used to evade this. The same bounded preview restriction applies to `__proto__`
and `prototype`. Ordinary unique authored keys are preserved exactly.

Proposed compatible successor, **NOT ADOPTED / NOT IMPLEMENTED**: preview-port
version2 represents each identity map as bounded arrays of strict
`{authoredKey,previewId}` pairs; keys become data values instead of dictionary
properties. Retain identity-rule1 SHA256 namespaces/ID bytes and legacy authored
format/version1. Require uniqueness and stable sorted map order, preserve authored
array order, and produce versioned digest-content. This can support these valid
legacy keys without prototype exceptions or in-place saved-data migration. A
future M2 wire/content-digest revision must explicitly pin that version; never
inject new fields into frozen strict metadata. Until adopted, preview returns a
clear validation/unavailable condition for the unsupported key subset.

Original SB-05/06/07 and HQ tasks remain OPEN: persistence/CAS/publication and
real media integration, original-format full roundtrips, actual-stage/renderer,
browser/frame/cue/device/provider acceptance are later leases/gates.
