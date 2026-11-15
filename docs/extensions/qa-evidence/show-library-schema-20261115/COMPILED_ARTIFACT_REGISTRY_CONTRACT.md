# Minimal compiled artifact registry contract — proposal, no activation

15 November 2026. Core owner show_engine, top-level
`01a1dd19-5220-70d3-8349-e9e135399b4d`. Accepted source remains
`19a2e83060e78fa4505647b88eca762113cb1ca8`; all 26 module files stay frozen.
This is documentation for one later registry-integration milestone AFTER the UI
owner emits actual renderer bytes and a resource index. It implements no schema,
registry entry, pin, loader, asset grant or renderer and consumes no runner grant.
It narrows section 7 of RENDERER_BRIDGE_PLAN.md; original SB tasks remain OPEN.

## 1. Delivery and ownership

UI/build owner delivers one immutable artifact directory with actual emitted JS,
CSS, fonts/native images/licenses, canonical resource-index.json and canonical
artifact-index.json, plus separate build/source/QA receipts. Core does not copy
UI code or invent hashes for absent files. Core later validates exact bytes and
registers one reviewed entry. No executable registration API is exposed to user
JSON. Existing PreviewManifestCatalog is a format/immutability checker, not an
execution authority; parsing or catalog.register() never activates a renderer.

First entry remains ONLY silent observational TadazzClassic, manager/spectator,
single/multi quiz/survey, 2–5 choices, question/answerCards/voting/voteLocked/results.
Caller visual refs remain DENIED, localSelection false, seek unavailable; audio,
player actions, uploaded/tenant media, other phases/types and original Razzia
renderer parity are not granted. Native intrinsic stage resources require the
proof below even though caller media is absent.

## 2. Proposed exact records

These TypeScript declarations specify future strict JSON formats, not installed
exports. Digest is 64 lowercase hexadecimal SHA256 characters; Ref reuses the
existing host-side exactRefSchema rules. All numbers below are finite safe
integers; bytes/budgets are positive, never defaults or authority flags.

```ts
type Digest = string
type Ref = Readonly<{ id: string; version: string }>
type FileKind = "module" | "style" | "font" | "image" | "license" | "metadata"
type Mime = "text/javascript" | "text/css" | "font/woff2" | "font/woff"
  | "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml"
  | "application/json" | "text/plain"
type ArtifactFile = Readonly<{
  path: string
  kind: FileKind
  mime: Mime
  bytes: number
  sha256: Digest
}>
type SourceFile = Readonly<{ path: string; sha256: Digest }>

type NativeResource = Readonly<{
  artifactPath: string
  requestPath: string
  usage: "stage-fixed" | "product-logo" | "rubik-font"
  kind: "image" | "font"
  mime: Mime
  bytes: number
  sha256: Digest
  source: SourceFile
  catalogRef: Readonly<{ assetId: string; sha256: Digest }> | null
  licenses: readonly Readonly<{ artifactPath: string; sha256: Digest }>[]
  rightsBasis: "repository-existing" | "licensed" | "owner-authorized"
}>
type NativeResourceIndexV1 = Readonly<{
  format: "tadazz-native-resource-index"
  schemaVersion: 1
  scope: "intrinsic-source-only"
  resources: readonly NativeResource[]
}>

type RendererArtifactIndexV1 = Readonly<{
  format: "tadazz-preview-artifact-index"
  schemaVersion: 1
  portVersion: 3
  identityRuleVersion: 2
  renderer: Ref
  abi: "native-stage-mount-v1"
  entryModule: string
  entryExport: string
  resourceIndexPath: "resource-index.json"
  files: readonly ArtifactFile[]
  source: Readonly<{
    gitCommit: string
    lockfileSha256: Digest
    files: readonly SourceFile[]
  }>
  toolchain: Readonly<{
    node: string
    pnpm: string
    bundler: string
    platform: string
    arch: string
    buildRecipe: SourceFile
  }>
}>

type ExecutablePreviewRegistryV1 = Readonly<{
  format: "tadazz-executable-preview-registry"
  schemaVersion: 1
  portVersion: 3
  identityRuleVersion: 2
  registry: Ref
  renderer: Ref
  sourceTheme: Ref
  rendererBuildSha256: Digest
  resourceIndexSha256: Digest
  capabilities: Readonly<{
    roles: readonly ["manager", "spectator"]
    phases: readonly ["question", "answerCards", "voting", "voteLocked", "results"]
    questionTypes: readonly ["single", "multi"]
    playModes: readonly ["quiz", "survey"]
    minAnswers: 2
    maxAnswers: 5
    localSelection: false
    callerMedia: "denied"
    audio: "silent"
    seek: "unavailable"
  }>
  budgets: Readonly<{
    maxArtifactBytes: number
    maxResourceBytes: number
    maxImageBytes: number
    maxDecodedImagePixels: number
    maxFontBytes: number
  }>
}>
```

No candidate ID is upgraded to executable just because its shape matches these
records. NativeResource catalogRef is an existing actual catalog reference or
null for a source-controlled font/product resource; it does not allocate a new
library asset ID or create a PreviewAssetRef grant. License/source paths refer
to real emitted/source bytes, not prose assertions. rightsBasis records reviewed
provenance; a caller selecting that string cannot supply physical rights.

The entry export is an actual own export of the indexed module, matching the
approved bounded mount/update/dispose ABI; no dotted/global lookup, prototype
name, native stage-handle escape, arbitrary callback/resource resolver or new
GameContext is accepted. The UI owner reports its real exported name; core
checks the actual export and ABI rather than rewriting/aliasing its source.

## 3. Canonical bytes, preimages and ordering

Use the existing host canonicalJson behavior: sorted object keys, preserved
arrays, finite numbers, compact JSON, UTF-8. Emit resource-index.json,
artifact-index.json and registry.json as EXACT canonical bytes: no BOM, trailing
LF, timestamps, locale sorting or pretty-print variants. A pretty diagnostic
view is a separately hashed receipt and is never consumed as a canonical file.

```text
fileSha256                 = SHA256(actual raw file bytes)
resourceIndexSha256        = SHA256(UTF8(canonicalJson(resourceIndex)))
rendererBuildSha256        = SHA256(UTF8(canonicalJson(artifactIndex)))
registrySha256             = SHA256(UTF8(canonicalJson(executableRegistry)))
```

No extra digest prefix/suffix is implicit. The canonical records' literal
format/schemaVersion/portVersion fields provide their explicit document domain.
The existing string sha256(canonicalJson(...)) is valid for these JSON digests;
do NOT feed decoded binary images/fonts into that string helper. Hash binary
file bytes directly with the actual byte-capable build/browser API. JS/CSS
integrity values use the indexed raw file hash, not rendererBuildSha256 (which
identifies an index, not a script file). Cross-language fixed-byte vectors for
the chosen documents and actual exported-file checks are required in the later
implementation; no invented example digest is an executable fixture today.

ArtifactFile arrays sort by exact ASCII path bytes ascending; source files sort
by exact UTF-8 Git path bytes; NativeResource arrays sort by artifactPath then
requestPath. License arrays sort by artifactPath. The fixed capability tuples
retain the order shown above. No sorting by host locale, source show order or
filesystem enumeration. Reject duplicate paths, duplicate request mappings and
case-colliding artifact paths; do not normalize/case-fold them silently.

Artifact paths are relative slash paths, <=240 ASCII characters from
A–Z/a–z/0–9/._-/; reject empty/dot/dot-dot segments, backslashes, absolute or
URL/drive paths, percent-encoded tricks, query/fragment, symlinks and traversal.
Source paths are exact relative Git paths with valid UTF-8 round trips and are
not served as URLs; ill-formed surrogate/lossy path conversions are rejected.
requestPath is an exact source-controlled rooted URL path, without host,
query/fragment, redirects or caller substitution. Every resource entry must
match an ArtifactFile's path/bytes/hash/MIME/kind, and every listed license
matches a real license file/hash. A missing required native file fails closed.
MIME is checked against file kind and actual bytes/response MIME essence, not
just declared metadata. SVG is limited to reviewed immutable native source with
no active/external content; it does not enable uploaded SVG. A new native MIME
needs a concrete format review, not a wildcard extension.

Future strict schemas reject unknown/prototype/accessor/non-JSON fields and
old/mixed versions. Reuse host producer validators rather than clones. Each
canonical document stays within existing bounded-JSON depth24/node10000 and
string limits; proposed limits are <=256 files/source refs and <=128 resources.
Actual lower budgets must be measured/approved from the UI export; there are no
permissive defaults or automatic limit increases when a build exceeds them.
The existing 100,000,000-byte asset-descriptor ceiling alone is not a preview
performance/decode/rights budget. Images need measured decoded dimensions;
fonts need correct format/license and locale glyph coverage.

## 4. Explicit hash-cycle exclusions

resource-index.json references resource/source/license bytes only. It must NOT
contain its own digest, rendererBuildSha256, registrySha256, a final pin/catalog
or an outer-loader digest. Its exact canonical file IS included as a metadata
ArtifactFile, so that entry's raw SHA equals resourceIndexSha256.

artifact-index.json lists actual executable/resource dependencies, including
resource-index.json, but NEVER itself, registry.json, accepted-pin manifest,
outer loader/bootstrap, build/QA receipt or a file that imports those final
digests back into the payload. No symlink, fake stub, research-document digest
or source-only assertion may stand in for an emitted executable file. Private
non-served debug maps may remain separate evidence only if no runtime file
requests them; anything served/loaded/referenced belongs to the audited closure.

registry.json may reference the completed rendererBuildSha256 and completed
resourceIndexSha256. It does not contain registrySha256 or a pin list that would
refer to itself. The existing strict CompiledPreviewPin remains unchanged:

```ts
// Construct only after actual byte/provenance/ABI QA and explicit acceptance.
const pin: CompiledPreviewPin = {
  portVersion: 3,
  identityRuleVersion: 2,
  registry: executableRegistry.registry,
  registrySha256,
  renderer: executableRegistry.renderer,
  rendererBuildSha256,
}
```

Build order: actual payload/resources → resource index → artifact index/root
hash → executable registry/hash → external accepted pin manifest/loader. Host
loader and Theme Builder application have separate build hashes/evidence.
Payload dependency metadata must prove that host producer/compiled-catalog
imports do not enter it, including through barrels. Type-only imports are
allowed only when erased. Current stage-metadata-schema is a Zod-only runtime
leaf; preview-port/stage-metadata/digest/manifest/primitives are NOT approved
payload runtime imports. Any additional core runtime schema dependency must
be checked and, if needed, separated by the core owner in an assigned phase;
UI must not clone validators or silently pull a broad producer graph.

## 5. Native asset and execution proof before one entry can be accepted

source.files is the actual application payload dependency closure, not the
whole repository or host compiled-catalog source. The payload build's source
commit may precede the later host catalog-activation commit; their byte proofs
remain separate. Source-controlled runtime leaves used by the payload must
match the accepted core bytes. An unused host manifest must not be bundled or
added as a dependency merely to assert an all-repository source fingerprint.

The UI export must account for intrinsic native frames/backgrounds, fixed
product logo /tadazz-show/v4/tadazz-brand-logo.png, Rubik files and CSS/image
resources used by the bounded five-phase renderer. Preserve their source
bytes, logos and licenses. Every resource has actual source SHA, emitted SHA,
MIME, size/decode measurement and license evidence. Catalog ID/hash must agree
where one exists. Rights/storage authorization is not obtained from a manifest
flag; checkAssetReference explicitly provides metadata policy only. First
milestone has no uploaded/private/tenant media or declarative caller grants.

Required handoff contains: frozen UI source commit/closure (including accepted
core bytes), lockfile hash, exact toolchain and build recipe, real payload and
canonical indexes, module dependency graph, native resource/license closure,
ABI/capability tests, observed runtime requests, and isolated-CSS/editor-freeze
proof. No sample roster/scoring/live room/provider is used to make it look ready.
All eight locales and reduced-motion/layout cases retain their actual evidence;
narrow player usability and Razzia-original parity are not inferred from Classic.

The loader must execute/render the same verified bytes. SRI must bind actual
script/style bytes; resource preflight hashing alone does not defeat mutable
URL/redirect/TOCTOU substitution. Require an immutable serving contract or a
reviewed verified-byte binding that preserves native source behavior. If native
fixed URLs cannot meet that boundary, activation stays unavailable and the
exact seam is proposed separately. No global URL alias, hidden DOM/CSS rewrite,
arbitrary network/file/data URL or raw snapshot lookup is permitted. No loader
or serving change is implemented/authorized by this document.

QA must include one-byte executable/resource/index tampering, missing/extra or
changed transitive dependencies, wrong MIME/size/decode/license, wrong core
source/role/phase/count/theme, forged JSON catalog, missing export/ABI, stale
metadata, unsupported URI, loader-integrity failure and actual resource-request
closure. Changing UI bundling or a vendor/resource byte requires a new actual
index/pin/evidence; old prebundle hashes cannot bless changed payload bytes.
Same ID@version/same digests is idempotent; different bytes require a new version.

## 6. Later core integration gate, not work started now

AFTER actual UI artifacts arrive, manager may assign host-only strict index/
registry schema and one immutable executable catalog entry, then precise changes
to owned manifest.ts / preview-resolve.ts and tests. No candidate auto-registration.
Format validation and artifact-byte verification precede source-controlled
catalog acceptance; an HTTP request or user JSON cannot add entries. The resolver
checks exact renderer/theme and the bounded per-question role/phase/type/count
matrix, retaining honest unavailable diagnostics elsewhere. Existing question
identity allocation, metadata binding and MCP/native wire formats are reused.

Activation requires separate actual build/independent QA evidence and manager
acceptance, not this document or its static audit. No declarative asset-grant
implementation, visual-ref gate lift, localSelection, audio, arbitrary seek,
public deployment, provider change, publishing or persistence is included.
Keep all pins empty until that decision. Original SB-05/06/07 stay OPEN.

## 7. This checkpoint's verification

Documentation only: source anchors checked and all26 accepted 19a2 module hashes
unchanged. No test/typecheck/build/install/browser/server runner or integration
branch mutation is performed. Parent integration QA's frozen snapshots are not
touched. The 26-test/TC metadata proof and historical raw UI/freeze failures
remain their original evidence, not a new registry/renderer result.
