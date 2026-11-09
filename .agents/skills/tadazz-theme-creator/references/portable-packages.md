# Portable Theme / Game / Complete packages

This is an additional v1 contract. Legacy `theme-authoring.ts` JSON packages,
trusted compiled renderers, Classic/Razzia and JSON/XLSX game imports remain.
The private package installer/runtime are OFF by default. Source availability
does not imply deployment, publication or human review approval.

Read `docs/extensions/PACKAGE_RUNTIME_ADR_2026-11-09.md`,
`docs/extensions/PACKAGE_RUNTIME_API.md` and the acceptance report. Live contracts:
`extensions/src/core/packages/{manifest,paths,protocol}.ts`. The separate source
entry `extensions/src/presentation/package-runtime/sdk.tsx` is the build SDK.

Run from the repository root with the pinned workspace toolchain:

```sh
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/package-authoring.ts scaffold /new/arcade complete arcade
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/package-authoring.ts pack /new/arcade /output/arcade.tadazz
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/package-authoring.ts validate /output/arcade.tadazz
node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/package-authoring.ts inspect /output/arcade.tadazz
```

`scaffold DIR theme|game|complete|declarative arcade|cinematic|playful` creates a
new directory only, never overwrites. Starters are explicitly synthetic, with
generated PNG/WAV assets. Replace titles, IDs, labels, provenance and rights for
actual customer work. Do not assert a customer license from a generated fixture.
`pack` refreshes actual file sizes/hashes, validates inventory/media/contracts,
rejects unlisted files/symlinks and refuses an existing output. `fixtures DIR`
emits the six packaged examples. `schema FILE` exports the manifest JSON Schema;
runtime Zod checks remain mandatory for reference integrity and media safety.

Every reference is relative to its declaring file, including nested JSON media,
TSX imports and CSS URLs. No absolute paths, URLs, escaping `..`, backslashes,
duplicate NFC/casefolded names, script-like media, placeholders or silent asset
downloads. Metadata declares exact SHA256, bytes, provenance, rights and export
permission. The descriptor uses the existing complete theme manifest, with
`kind: sandboxed-react`, `rendererId: tadazz-sandbox-stage`, and `sandbox` v1:
entry path, role list and explicit `implemented|classic` choice for every runtime
phase. The platform owns the installed `runtime` pin; do not supply one.

Entry TSX exports a default React component receiving `ThemeSDK`. Import React
and hooks normally, SDK **types** from `@tadazz/theme-sdk`, and relative modules,
CSS and media. Supported external imports are the pinned React/React DOM and
SDK only. No package scripts/install/Node/SSR/server SDK/socket/private API.
`snapshot` supplies public scene/title/question/options/results/standings,
server clock/deadline, role, locale, pause and reduced-motion state. `asset(path)`
returns only bundled assets. `submitAnswer(optionIds)` is an intent passed to
the existing answer handler, never scoring logic. Core phase audio stays in
AudioCuePlayer; the player may request the approved answer-selection effect.
Images supplied from a live room are authorized and projected as bounded data
URLs by the parent, without disclosing media credentials or account endpoints.

The timer is a display of the latest authoritative snapshot. Do not invent a
second authoritative countdown or replay sound on every snapshot. Use labels
from `snapshot.labels`, eight-locale manifest text, semantic keyboard controls
and reduced motion. Do not place account/manager controls inside the theme.

For authenticated installation set `TADAZZ_PACKAGE_SERVER`,
`TADAZZ_PACKAGE_TOKEN`, and optionally the assigned `TADAZZ_PACKAGE_WORKSPACE` in
the private environment. CLI: `upload FILE`, `build UPLOAD_ID`, `status UPLOAD_ID`,
`preview UPLOAD_ID`, `approve UPLOAD_ID REVIEW.json`, `install UPLOAD_ID CONTENT_IDS...`,
`list`, `rollback UPLOAD_ID`, `export UPLOAD_ID OUTPUT.tadazz`.
The operator's worker processes the queued build outside the application.
All media, including data-only packs, pass the isolated decoder stage first.
An independent assigned reviewer signs the exact source/build/revision and QA
receipt before any private theme installation. Synthetic test assertions never
count as actual human licensing/content/accessibility/performance review.

Use the manager Packages panel for upload, content selection, build status and
the actual isolated preview. A complete pack installs the theme and creates
fresh games only after staging succeeds. Demo games can be deselected. Installing
privately does not publish to a marketplace. Running rooms keep immutable pins.
Rollback changes future choices only; referenced installed versions are retained
and deletion fails closed. Existing legacy/trusted publication rights are not
expanded. Production enablement requires separate explicit authorization.
