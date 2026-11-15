# SB2 pure schema/preview foundation

Producer: show_engine `01a1dd19-5220-70d3-8349-e9e135399b4d`.
Branch: `codex/tadazz-hq-show-library-20261115`.
Base: `8a43c99c65d8923bd23d8c57ac3607e9a09b5764`.
The review commit SHA is provided with the manager/Asana handoff. This is a pure
foundation milestone; original SB-05/06/07 completion is not asserted.

## Consumer entry points

- `extensions/src/core/show-library/preview-port.ts`: canonical producer port;
  actual strict Zod schemas, `normalizePreviewDraft`, `derivePreviewIdentityMap`,
  `getPreviewIdentityId`, `projectShowBindings`, `resolvePreviewPlan`,
  `getCompiledPreviewManifest`, `getPreviewDigestContent`, shared types and
  canonical JSON/SHA256. No `createShowProjection` alias or parallel engine.
- `extensions/src/core/show-library/index.ts`: additional component/template/
  motion/sidecar/asset formats, candidate registry and metadata policies.
- `extensions/src/core/show-library/preview-fixtures.ts`: **test only**, absent
  from production barrels. Consumers import these vectors in tests, never as
  production fallback outcomes.

Internal portVersion is **2** everywhere. IdentityRuleVersion remains **1**;
authored `tada-show` version1, existing theme/runtime identifiers, MCP0.1.0 and
UI metadata1 remain untouched. Cards/questions/scenes identity maps are strict
arrays of `{authoredKey,previewId}`, unique and sorted by UTF8 byte order. Key
values `constructor`, `prototype`, `__proto__` pass the real authored validator
and are supported without dynamic dictionary properties or renaming saved data.
Unshipped port1, structural prototype keys, getters, cycles, forged/missing/
duplicate/unsorted map entries and invalid original authored data are rejected.

The current authoring MAX_ANSWERS is five. Real authored6/64 rejection is tested;
transient fixture projection of0/1/5/64 choices preserves all identities and is
not evidence of an authored format or renderer supporting64 answers.

## What is executable

Strict component/template/motion/asset and separate composition formats; bounded
graph depth/children/nodes, version references, semantic binding/input/role/phase
constraints and required functional content lanes; immutable registry/manifest
version fingerprints; independent asset/audio/template/motion section data and
exact-theme scope precedence/reset; metadata-only tenant/export/reference checks.

Preview normalization uses the real authored schema and bundled theme/asset
validators. Draft identity/content remains in the trusted controller.
`projectShowBindings` accepts a no-room deterministic-demo snapshot/context and
redacts by role/phase before visual props. The output schema also rejects phase/
role leaks. It supplies no room, PIN, join URL, contact record, live action,
future-question payload or pre-reveal solution. Diagnostic keys reuse existing
translations in all eight locales; shared/editor resources are unchanged.

**Zero renderer pins are accepted. Every preview plan is unavailable.** Candidate
registry syntax, foreign pin JSON or a document hash cannot manufacture ready
status. M2 must return unavailable honestly until the separate renderer lease
implements and proves a compiled adapter. No real stage, director, scoring,
clock scheduler, audio player, live projection, server mount or root export is
implemented/changed here. Asset metadata policy is not actual storage authorization
or a deletion transaction. Persistence/CAS/publication/room pins remain later work.

## Evidence and limits

Authoritative machine receipts are `summary.json`, `validated-source.json` and
the final server evidence directory named there. The source overlay and complete
baseline manifests remain as ignored immutable artifacts locally and in the
owned server fixture namespace; the compact validated-source receipt records
their hashes, base and all20 new source-file hashes. Git itself retains the
entire original base. Earlier packets and failures are retained separately.

The final server run uses arm64 Node24.22.2, pnpm12.18.0, TypeScript7.0.2 and
Vitest5.0.3 from the unchanged frozen lockfile. Source, dependency store, fixtures
and evidence are task-private. Resource cap0.75CPU/3GiB; no published ports,
production mounts/configs or customer data. Dependency preparation initially
missed a cached tarball; a frozen, ignore-scripts preparation populated the private
cache. Subsequent runs installed offline and executed with network mode none.
Workspace common code resolves to `/workspace/packages/common`, not image source.

Before/after audit checks every one of3297 baseline Git blobs plus all20 overlay
file SHA256 values. The historical raw TDS guard is **not waived or rewritten**:
its final failure denies only the20 explicitly leased new module paths and reports
`mismatches: []`. Design/token/catalog checks pass. Manager review must resolve the
old incremental guard's scope before integration; no full `ui:check` PASS is claimed.

Initial runner failures are preserved: premature start before transfer completion,
CRLF/read-only inspection/socket permission issues, offline dependency miss,
network-none attachment restriction, absent Git and incompatible direct Git binary,
missing reference blobs and a pre-format intermediate. Exact application test,
typecheck, format, source, lease and allocation release results are in the final
receipt. No browser/build/device/provider/host-installation/release acceptance.

Production modules target≤250 lines. The registry test file exceeds that target
to keep its shared graph and independent-section fixture cases together; it is
test-only. No existing application module or frozen snapshot was reformatted.

Next: independent QA and manager interface review, explicit TDS guard scope
decision, then a separate minimal compiled renderer/preview-runtime lease.
M2 may consume the validated pure exports now; it may not claim interactive
stage parity. SB3/M3 UI and original full acceptance remain open.

## Final verified snapshot

Overlay `28ea054180312e7acf39cc34861ed3f604f0e357bedfdc05924aae7bf95bb2b8`:
**80/80 tests PASS across four focused files**, including all eight diagnostic
locales; focused TypeScript and scoped formatting PASS. The final source and
lease audit PASS for3297 original files plus20 new module files. Full
`pnpm --dir extensions ui:check` exits1 solely at the unmodified historical
freeze allowlist; its denied set is exactly those20 new module paths and its
hash mismatch set is empty. No raw full UI/guard PASS is claimed.

Final resources were0.75CPU/3GiB/network none/no port bindings. The allocated
container was stopped and removed at `2026-11-15T04:47:36Z`; immutable source,
fixture/cache and evidence namespaces remain for independent review.

Two evidence logs had CRLF/extra terminal blank lines. Their tracked display
copies were normalized for Git whitespace checks. `evidence-normalization.json`
retains **exact original bytes in base64**, original raw hashes and normalized
hashes. Original command receipts retain their raw-output hashes. No command,
result, application source or test input was changed by evidence normalization.
