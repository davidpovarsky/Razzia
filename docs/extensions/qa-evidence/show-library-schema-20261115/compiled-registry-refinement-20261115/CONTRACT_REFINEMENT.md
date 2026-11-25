# Compiled registry refinement from the actual UI inventory

15 November 2026. Proposal revision 2, documentation only. This companion refines
ced0b3e without changing that historical contract, any accepted core module or
an existing runtime. Input: UI source d09529dc5c26bc71972d5e0809bc2dddd2849c60 and
inventory 60ec000bd88c5096fdb2009ab0d9f2ff013f15ce. The supplied UI inventory and
its build evidence remain attributed to that owner; this checkpoint adds a
local static source/hash audit, not another build, browser or server result.

The tagged source records, rights state and fixture mapping below are concrete
proposals for root approval. No new validator is implemented yet: independent
package-byte binding, the actual emitted resource graph and loader binding are
still open. A structural validator alone would not close those acceptance gates.
All 26 accepted core files remain frozen, caller refs remain denied, and pins
remain zero. Original SB-05/06/07 and the broader HQ task remain open.

## Actual available bytes and their limits

source-grounded-examples.json is an evidence example, explicitly non-executable.
It is not resource-index.json, artifact-index.json or registry.json. Its inventory
contains five images and the two reported emitted JS/CSS records, with real
hashes and source provenance. It contains no guessed hashes or font URLs.

The existing two-file candidate index has raw SHA-256
07b72f09185b629c0aee8a73e1c0a523b8963c33af4b920bbfeb2c744d274d90:

| Candidate file | Bytes | Raw SHA-256 |
| --- | ---: | --- |
| renderer.js | 1,604,790 | 1fa5ca2b9f163ecc52b61ad54faf2656bbca612b3a67ab26ffbc6d375b6503eb |
| renderer.css | 148,376 | 3b220b024863d1e4a58b86b0b14a74e94be7b3da0c07e9921c2fb17430b67064 |

These file hashes come from the UI owner's actual build index; the emitted
files themselves were not re-read here. The index's own bytes were verified.
It is an array of two feasibility records, not ced0's complete canonical index.
Five known images total 2,554,738 bytes; JS/CSS plus those images total 4,307,904
bytes before any resource index, license or other real dependency. This is an
inventory sum, not an approved runtime budget or a closed request graph. The
four unresolved CSS images and native logo are conservative known resources.
Static sound/video/source strings do not prove requests, playback or closure.

## Source records: tracked Git files and locked package files

Replace the earlier untagged SourceFile proposal with this strict discriminated
union in proposed revision-2 index formats. Do not silently parse a revision-1
record with these semantics. The six-field CompiledPreviewPin stays unchanged.
The old proposal was not installed or accepted as an executable format.

```ts
type GitTrackedSource = Readonly<{
  kind: "git-tracked"
  gitCommit: string       // exact 40 lowercase hex in this repository
  path: string            // exact relative Git path
  gitBlob: string         // exact Git blob identity, independently checked
  sha256: string          // SHA-256 of raw file bytes
}>

type PnpmPackageFileSource = Readonly<{
  kind: "pnpm-package-file"
  packageName: string
  packageVersion: string
  lockfilePath: "pnpm-lock.yaml"
  lockfileSha256: string
  snapshotKey: string
  resolutionIntegrity: string // exact lock SRI; not a file SHA-256
  packagePath: string          // package-relative, never a fake Git path
  bytes: number
  sha256: string               // actual package-file bytes
}>

type SourceRecord = GitTrackedSource | PnpmPackageFileSource
```

A source Git commit never claims ownership of node_modules bytes. Package files
use stable package-relative paths; absolute server paths, pnpm store locations,
symlink aliases and machine-specific node_modules paths are receipt details,
not canonical source identities. Both path kinds reject traversal, URL/query/
fragment, invalid UTF-8, empty/dot segments and lossy normalization. Source paths
are not automatically served URLs. Bytes and digests have ced0's exact bounds.

A separate proposed dependency-provenance metadata record includes the real
GitTrackedSource of the lockfile, importer path/specifier/resolved version,
package name/version/snapshot key, exact lock integrity, declared license, and
sorted observed package files. Package-file records must resolve to that exact
package/lock tuple and its independently attested file list. No automatic package
fetch, install, lock repair or network lookup belongs to validation.

Actual Rubik package selection is:

- package @fontsource-variable/rubik, version 5.3.0;
- both extensions and packages/web importers: specifier ^5.3.0, resolved 5.3.0;
- snapshot key @fontsource-variable/rubik@5.3.0;
- pnpm-lock.yaml SHA-256 f2e3f2183bc308e7e113a23f2ae901d98aade9a173c6b16019d014072684b9a0;
- resolution integrity sha512-yQUf8qle24MJYA+EuauyF+cqjjN6I715nGjitt3sGmwZA0XfA4fWJcLq1C/diREZl4Qzn1E80nLMc0ipC/a4Lg==.

The inventory reports the existing server package's OFL-1.1 declaration and
actual LICENSE (4,486 bytes, SHA-256
46a250495a963b0b84f2736c0185d0e3af8df9d23427bd425b92a8ece020283c),
wght.css (2,581 bytes, SHA-256
5c5ce7a83a10034b877db7b8f1080abbbf84329beb192163dbbf02419c442f8b),
and six files/rubik-<subset>-wght-normal.woff2 files. The example contains each
reported subset hash/size and the exact source record for LICENSE and CSS.
It attributes those package-byte observations to the UI inventory; this worker
did not retrieve or independently hash raw package files in this phase.

Lock integrity identifies the package archive resolution, not any individual
installed file. Matching package name/version plus an observed file hash alone
does not prove archive membership or absence of post-install edits. Before an
executable package resource is accepted, an independent receipt must bind the
actual observed files to the locked resolution using the existing immutable
package/tarball/store evidence, or an owner-reviewed equivalent. That receipt is
currently absent; no archive was downloaded or invented. A future record may
reference an attestation, but caller JSON cannot assert that it passed.

## Rights: provenance and private fixture use are separate

Replace rightsBasis as an acceptance-bearing string with a strict rights
assessment union for resource inventories. repository-existing is provenance
only. A proposed unknown assessment is exactly:

```json
{"status":"unknown","provenance":"repository-existing","reviewReceipt":null}
```

A future reviewed assessment must refer to a trusted owner-reviewed receipt
covering the exact byte hashes, intended operation and scope. Its concrete
receipt authority and acceptance process require root approval before schema
implementation. A license label, MIT repository LICENSE, catalog registration,
owner name or user-supplied reviewReceipt is never itself approval. Keep source
attribution, license evidence and rights assessment as distinct fields.

| Evidence / operation | Current disposition |
| --- | --- |
| Five existing images and logo | Catalog/hash provenance verified; redistribution rights unknown |
| Unchanged five-image private internal QA fixture | Explicit manager scope permits this private fixture only |
| Customer-package export or public redistribution | Denied pending exact rights review |
| Executable pin / registered renderer | Denied pending full acceptance, including rights |
| Rubik package license | OFL-1.1 and actual text/hash reported; no new export or blanket approval |

Manager's private-QA permission is a bounded operational instruction, recorded
outside the executable resource index. It is not a new rights determination or
a reusable permission boolean. The example records that instruction and keeps
each image's rights unknown. Existing strict checkAssetReference behavior is
unchanged; this policy does not lift caller-media denial or enable a resolver.
No private fixture was created by this checkpoint.

Any later approved package export must preserve the verified actual license
text, attribution and reviewed obligations. A hash/reference without the actual
license bytes in the approved artifact is insufficient. No per-image license
file was found; the example labels repository LICENSE and catalog provenance as
license evidence, not as proof that those images are cleared. Do not copy font
license text from an unrelated version or substitute a generic OFL template.

## Exact rooted URL to fixture-byte mapping

For a later private QA fixture, propose preserving the request paths byte-for-
byte and placing immutable copies at matching artifact-relative paths. The
mapping is explicit; the host must not prepend a version directory to a native
root URL, rewrite CSS, alias a global resolver or mutate the DOM.

| Exact request path | Proposed artifact path | Existing catalog asset |
| --- | --- | --- |
| /tadazz-show/motion/backdrop.webp | tadazz-show/motion/backdrop.webp | classic-backdrop |
| /tadazz-show/v4/question-bg.webp | tadazz-show/v4/question-bg.webp | classic-adapter-a27be4883ee9 |
| /tadazz-show/v4/show-stage.webp | tadazz-show/v4/show-stage.webp | classic-poster |
| /tadazz-show/story/84acdb923677d591.webp | tadazz-show/story/84acdb923677d591.webp | classic-adapter-5ebee0b89664 |
| /tadazz-show/v4/tadazz-brand-logo.png | tadazz-show/v4/tadazz-brand-logo.png | classic-logo |

The example supplies the exact source path, commit, Git blob, SHA-256, bytes,
MIME and matching catalog ref for all five. Those image bytes and Git identities
were checked locally without decoding or running product code. Dimensions in
the example remain attributed to the UI owner's local Pillow inspection, not
new server/browser decode evidence. Each has emissionStatus not-exported-in-d095;
none is falsely presented as a delivered artifact file.

UI owns fixture and loader implementation. Proposed private fixture rules:

1. Copy only approved unchanged bytes into a fresh fixture; verify raw hashes,
   sizes and MIME before/after. Seal that mapping read-only for the test lifetime.
   No production file, existing frozen source fixture or native source is edited.
2. Serve loopback-only inside an authorized network-disabled container, with
   no host port. Match raw request targets exactly against the explicit map;
   deny query strings, encoded aliases, normalization tricks, symlink/traversal,
   redirect, fallback response and every unlisted path. Reject fragment-bearing
   configured URLs before navigation; HTTP does not transmit fragments. Record
   unexpected requests.
3. Bind each allowed GET to the exact verified file/response bytes and MIME.
   Capture request initiator and response evidence. Do not let a preflight hash
   be followed by an unconstrained mutable-path read. Use a fresh browser context
   without stale cache/service-worker state in the separate UI-owned harness.
4. Candidate JS/CSS, loader, fixture page and any genuinely emitted license/font
   resources need their own explicit map entries and byte proofs. This five-image
   table does not silently authorize other requests or complete the mapping.
5. Tampering negatives use a separate explicit negative fixture and recorded
   expected rejection; do not overwrite the immutable baseline to simulate them.

A private loopback server and no-store/cache settings are not production
immutability proof. Preserving rooted URLs in production requires an isolated,
artifact-bound origin and immutable per-origin mapping, or a separately reviewed
verified-byte binding that preserves native behavior. No production origin or
loader strategy is approved here. SRI for actual JS/CSS, the entry export binding,
CSP, no redirects and prevention of TOCTOU remain separate acceptance gates.

## Typography and limits on reproducibility

Classic manifest fontId is goldy-canonical. showThemeStyle uses
Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
native stage/reference CSS has its own Inter/Arial/Segoe UI/system stacks. Those
exact theme/CSS choices stay intact. Do not impose Rubik on the native stage.
Platform entrypoints import @fontsource-variable/rubik/wght.css for governed
platform chrome. Platform font resources belong to the platform graph when used;
they do not become renderer resources merely because they are installed.

No font file/font-face was emitted by d095. Consequently the dependency file
observations have null artifact/request paths and are not valid NativeResource
entries. An actual later font emission needs its own preserved bytes, real
output/request path, license file, CSS references and source record. No font URL,
subset emission or source-controlled path is guessed from the package name.

System/locally installed font selection is an explicit environmental dependency,
not a byte-hashed artifact file. Preserve it and record OS/browser versions,
viewport/device scale, requested computed font-family, available-font evidence,
actual rendered-font/glyph measurements where tooling supports them, and
screenshot provenance. Computed font-family alone reports a stack, not the
actual font used for each glyph. document.fonts.check alone is also insufficient
for Japanese fallback/glyph correctness.

Without controlled font bytes and environment, identical source/artifact hashes
do not imply identical pixels across machines. Label browser snapshots as
specific-environment observations and cross-machine pixel parity unproved;
do not claim a hermetic font closure or invent hashes for system fonts. The
six Rubik subsets have no Japanese subset. All eight locales, including actual
Japanese fallback and missing-glyph behavior, still require authorized browser
evidence. New fonts/downloads or typography changes need a separately reviewed
proposal, not an automatic fallback substitution in this phase.

## Canonical indexes and exact remaining decisions

ced0's raw-file hashing, canonical UTF-8 JSON, strict paths/bounds, byte/mime
agreement and hash-cycle exclusions remain. In the proposed revision 2:

- SourceRecord arrays sort by discriminator, then exact UTF-8 Git path/commit or
  package name/version/packagePath/lockfileSha256. Reject duplicate identities,
  conflicting hashes and ambiguous case-colliding served paths.
- Dependency-provenance.json, if actually delivered, is a metadata ArtifactFile
  and contains no artifact-index/registry/pin digest or self digest. The artifact
  index includes its real bytes/hash. Resource source records resolve to it;
  the provenance record does not import the containing artifact index.
- Actual resource entries require real artifact/request paths and emission proof.
  Unknown-rights inventory and unbound package observations can be parsed only
  as diagnostic inventories; they cannot pass executable acceptance.
- Platform-only fonts and environmental system fonts are represented in separate
  platform/environment receipts, not invented payload dependencies. Actual
  emitted/requested renderer resources must still close fully.

Root review requested before code: approve the tagged source union/revision-2
proposal and trusted rights-review receipt boundary; decide the independent
locked-package-byte attestation process; accept the fixture-only five-image
mapping without granting redistribution. UI then supplies actual resource and
module graph, immutable fixture/loader implementation, byte-bound entry export,
server decode/MIME and browser/style/font/lifecycle/tamper evidence. No active
registry entry is possible until these gates are closed and separately accepted.
The observed mountPreviewCandidate export is a candidate ABI, not an approved
execution binding. Host metadata/producer/digest/catalog exclusion still needs
the actual bundler graph, not a static list of strings.

No schema/validator/runtime/pin/shared source edit, test, build, browser, server
run, install, image pull, download or new heavy allocation occurred here. Static
receipt records the exact evidence inputs, tracked source equality, five image
hash/catalog matches, lock provenance, proposal scope and 26 frozen core hashes.
