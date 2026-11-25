# Actual corrected UI bytes → revision-2 diagnostic data plan

This maps the real dd3 candidate, not the failed d095 artifact or an invented
schema revision. Renderer source is dd3cd1347981ac6fd934f90d870ff57bba82d470;
browser evidence is a2625d3b9e9df3787edad4abf4d9bdb6ad890125; the new output/graph
handoff is 7240e858087008bed1293856c03c8c9a80dadd91. Tested C35's four modules
and all 26 prior accepted files are immutable. This phase changes only new
metadata/evidence/helper paths and runs no project module/schema/runtime/test,
build, SSH/download, resource job or keeper operation.

## Actual files, locations and record mapping

| Actual observation | Bytes | SHA-256 |
| --- | ---: | --- |
| renderer.js | 1,043,685 | 9024a0bef2cfbe3d8868d9fc3c6657269abd84d45c00bee0c95b02934f9763b1 |
| renderer.css | 148,376 | 3b220b024863d1e4a58b86b0b14a74e94be7b3da0c07e9921c2fb17430b67064 |
| provisional two-file index | 422 | 38d36c62b57b0e90c00feebebe9c66256a55b60ab617b65632ae1e75f07d586e |
| actual resolved-module graph | 43,818 | bbca71f4a14564980e5f91504a5eaad706995d9e1b4b64c5da13886427fce072 |

The six images total 2,821,369 bytes. Combined with JS/CSS, the observed eight
files total 4,013,430 bytes. Their individual source identities, catalog IDs,
request paths, bytes, MIME and SHA are recorded without omission in the input
inventory, artifact-files.partial.json and resource-index.diagnostic.json.
The newly discovered teaser is included as the real sixth resource, never a
replacement: /tadazz-show/second-library/teaser-screen-source.jpg,
classic-adapter-7af6b5041525, JPEG 266,631 bytes, SHA
 eaef71e6f2b59595eca49a5fb72df70e45f47a80351ea4d35e03d91f28851c17.

UI reports frozen output at:
/home/ubuntu/tadazz-hq-qa-20261115/evidence/show-ui-dc76-browser-c2/artifact-dd3

UI reports the separate six-image fixture at:
/home/ubuntu/tadazz-hq-qa-20261115/fixtures/show-ui-dc76-browser-six

Only JS/CSS were emitted into the former. Native images are fixture copies in
the latter, alongside matching JS/CSS and QA-only browser.mjs. The eight physical
path bindings are explicit in artifact-files.partial.json. UI reports directories
0555/files0444 after rehash. This is discretionary protection, not a privileged-
writer-proof filesystem. No current remote file was read by Core in this phase;
rehash original output and fixture bytes before/after any later granted check.
The original fixture-before receipt's modes remain historical and unchanged.

Raw JS/CSS bodies are NOT inside the available ZIP. Core verified index and
fixture/request hash records, not those emitted bodies anew. It did independently
hash all six image Git blobs from dd3 and match inventory/catalog/fixture records.
Browser dimensions are attributed to UI's actual createImageBitmap/assertions;
Core did not run a decoder. Four WebPs 1920x1080, logo 1983x793, teaser 2048x1152.

Generated diagnostic DATA:

- resource-index.diagnostic.json is the exact compact sorted-key UTF-8/no-BOM/
  no-LF serialization of NativeResourceIndexV2-shaped data for those six records.
  It is 5,098 bytes, SHA 30b0cc05466fa002232aaa02582cf51bb5f2692cc2d5e258b9913bef0f620ca9.
  It is a new local metadata candidate, not a file already in UI's frozen output.
  It has unknown rights/null receipts and no supplied license-artifact refs for
  each image. Empty refs mean missing evidence, never no legal obligations.
- artifact-files.partial.json records the eight observed ArtifactFile records,
  their actual emission/fixture distinction, and the generated metadata file's
  proposed logical path resource-index.json. It is explicitly NOT a complete
  RendererArtifactIndexV2. No placeholder renderer Ref/version or missing hash
  is supplied merely to make parsing succeed.
- tracked-sources.candidate.json contains 67 exact GitTrackedSource records, all
  at dd3: 56 graph inputs, six image inputs, two real build recipes, lockfile,
  root package.json and extensions/package.json. The exact recipe is a member
  of this set, satisfying C35's single-revision/membership policy by construction.
- module-source-map.json retains all 162 real graph IDs and edges, mapping 56
  repository modules to their Git records and 106 package files to explicit
  incomplete package-source fields. No virtual or unlisted edge target appeared.
  This is a getModuleIds/getModuleInfo resolved graph, not per-chunk rendered
  contribution proof. The build log says 163 transformed modules; the different
  counters are retained, not forced to agree.

The map uses the actual original graph recipe at dd3: 773 bytes, blob
f5c8b64a6ae702c9c96b70279ba586125f5c4b92, SHA
1d1ad37286afb4b5d8194122bef666c02cec1e707559c91c54b96b8dfb2b008d.
A later type-only recipe correction has different raw bytes and was not used
for this build; it cannot silently replace that source record. The actual base
config is blob 81ca9f0fe7e6772ff113e73fbd3f80daacd9a0b2/SHA adcc3777..., and
lockfile SHA is f2e3f2183bc308e7e113a23f2ae901d98aade9a173c6b16019d014072684b9a0.
All exact values and source references are in the machine data, not guessed paths.

## Source package membership is a separate, presently missing proof

| Locked package key | Actual graph file IDs |
| --- | ---: |
| i18next@26.4.3 | 1 |
| react@19.3.0 | 4 |
| react-dom@19.3.0 | 4 |
| scheduler@0.28.0 | 2 |
| zod@4.6.6 | 95 |

The exact five lock resolution/SRI entries and raw peer-qualified pnpm locators
are recorded. Those resolve package identity only. Actual 106 raw file sizes and
SHA-256, package metadata/license bytes and the verified build's physical cache
mount mapping have not been delivered. Package SourceRecord is therefore null,
with bytes/sha256 explicitly missing; these are not valid partially parsed
SourceRecords. No package hash is inferred from a graph ID, lock archive SRI or
the separately linked Windows cache. Peer locators remain in graph evidence;
the canonical source identity uses the already-approved locked name@version key.

Core/Integrator's next explicitly granted data read would need the exact same
immutable cache/index roots used for the build. Read only the 106 named files and
actual package metadata/license paths identified by that inventory. Record size,
SHA-256/SHA-512/mode, exact lock/SRI/key, original pnpm index row/alias/hash and
same CAFS input hashes; compare independently. Do not install, repair, download
or call this independent tarball extraction/signature proof. A shaped record or
consistent file hash cannot populate the empty trusted host receipt registry.

## Additional core dependency is real and requires review

Among core/show-library, the sole graph module is the accepted Zod-only
stage-metadata-schema.ts. Preview-port/producer/projector/digest/compiled preview
manifest/new compiled-index authority are absent. The map does NOT hide the
DIFFERENT extensions/src/core/packages/protocol.ts and manifest.ts, reached by
NativePreviewStage → show-themes/context → show-themes/index → definition.

Read-only source review: protocol imports packageDigestSchema from the package
manifest, defines sandboxDefinition/runtimePin schemas and RendererMessageGuard.
The package manifest supplies Zod/package path/descriptor schemas; its digest
schema is a 64-hex string format. These are not Show Library's CompiledPreviewPin,
compiled registry or root-reviewed rights/store authority. Their metadata fields
confer no authority. Nevertheless they are additional resolved core dependencies
under ced0 and need explicit root/core review. The current graph does not prove
which exports survive tree shaking or execute. Obtain actual chunk/contribution
metadata before deciding whether an existing bounded dependency is acceptable
or a downstream composition seam is necessary. No defect in C35's schema has
been demonstrated; no tested core/native file is changed by this plan.

## Keep five evidence boundaries distinct

1. Structural consistency: future use of the existing frozen C35 parser checks
   strict fields, canonical bytes, source commit/recipe, file trees and hashes.
   This phase serialized metadata but did NOT execute those project validators.
2. Environment/fonts: no font or Rubik module/file is listed in the renderer
   graph/output. Native Inter/system typography stays intact; installed platform
   Rubik is not a renderer resource. Computed/rendered glyph evidence, exact
   environment and Japanese fallback remain missing/non-hermetic. No synthetic
   font hash, font file, download or platform-font receipt is inserted.
3. Package membership: actual bytes and independently reviewed CAFS receipts are
   distinct from the five lock identities. All remain missing/untrusted today.
4. Immutable loader binding: verified private in-memory fixture buffers and
   observed script/style SRI checks do not establish production immutable origin,
   exact export binding, redirects/cache/service-worker/TOCTOU or full CSP proof.
5. Reviewed executable authority: six image rights remain unknown; private QA
   permission does not clear redistribution or executable use. License files and
   obligations require real review. Root receipt registries/pins remain empty,
   output unavailable/false, customer export and public distribution denied.

## Actual browser scope, not a manufactured complete matrix

D095 remains FAILED history. DD3's five-image fixture had 22/23 passes, one denied
teaser case. The six-image followup ran the affected phase/closure case plus two
integrity/path cases: 3/3 passed. The other 20 prior passes were not repeated in
that fixture. These are split observations, not 23/23 in one complete same-fixture
matrix. English synthetic single-choice quiz/five options plus eight UI label
locales is not all localized content, survey/2–5 cardinality or glyph proof.
Console/CSP attachment bodies were not persisted; DOM node continuity is not
private native-handle identity or complete race/disposal coverage. The 34-request
six-fixture log has successful six native assets and three intentional non-200
negative requests. These exact records are preserved, not summarized as no errors.
Earlier 12/12 source unit results belong to d095 before the config correction;
they were not rerun for dd3. No browser/test/build result was produced here.

## Exact remaining inputs before a complete artifact index

UI's 7240 handoff has now supplied reported physical output/fixture paths. Remaining:

- root-reviewed preview renderer Ref/version and ABI identity; native theme
  tadazz-classic@1.0.0 / rendererId tadazz-classic-stage alone supplies no preview
  build version and must not be substituted automatically;
- raw byte rehash/read of those exact frozen paths under a separate grant;
- actual106 package-file byte inventory, metadata/license paths, exact retained
  cache mount mapping and later independently reviewed store membership;
- complete build invocation/overrides and toolchain receipt: Node 24.22.2/Vite 8.3.4/
  ARM64 are reported, while exact pnpm/process-platform/image identity and argv
  are not retained in the available packet; the output directory differs from
  the base config default and must not be inferred;
- actual chunk/module contribution and license closure, plus the additional
  core/packages dependency review. QA browser.mjs/host/decoys/frames and the
  diagnostic Vite manifest are not payload dependencies merely because present.

Only after the required DATA fields are real can a new owned helper assemble
artifact-index.json: resource/license bytes → canonical resource index → artifact
index listing it, never itself/registry/outer pin → index SHA. Separate host
registry/pin/loader stays outside the payload and is not generated here. A later
exact source/plan/resource grant may run the frozen C35 validators against the
actual bytes and retain honest unavailable diagnostics. It does not need to
rerun the old 53/26 or UI/browser matrices to map data. No allocation, output
mutation, source hook or schema revision is authorized by this document.

The known67 Git records +106 package module rows would yield173 source inputs
before actual package metadata/license files. No increase to C35's256-ref bound
is proposed. PACKAGE_READ_ALLOWLIST.json enumerates the exact106 build-namespace
file paths for a later Core/Integrator inventory; it does not claim a physical
cache root or authorize a read. UI/Integrator must pin that mapping and actual
metadata/license index paths first. Root owns the candidate renderer identity
and additional-dependency scope; UI/QA owns remaining execution/font/loader proof.
Raw selected log members are preserved as base64 with original member SHA beside
normalized display logs. Other selected ZIP/Git evidence is byte-identical.
