# Native library and composition authoring contract v1

Owner D; E owns rendering/Studio/runtime installer, F owns MCP server and its
authenticated transport. Entry: extensions/src/core/show-library/index.ts.
Existing port3/rule2 preview producer and all native manifests remain unchanged.
No executable Preview contract is declared ready by this authoring contract.

## Native catalog

getNativeShowLibrary() returns an immutable catalog of exact bundled
tadazz-classic@1.0.0 and razzia-original@1.0.0 definitions. Each retains15
visual slots,16 audio events, existing IDs, variant defaults, assets, tokens,
capabilities, localization keys and animation-preset IDs. definitionSha256 is
the canonical validated definition digest, not a raw Git/file-byte claim.
findNativeShowLibraryFamily(ref) performs exact version lookup only. There is
no caller registration or family fallback hidden in that lookup.

Definitions and per-slot/audio data are the current native manifests, rather
than newly invented components. The current native stage remains the renderer;
audio remains owned by the existing player. Motion IDs remain native-template
owned; seek is unproven. Existing asset rights declarations are metadata and
still require the trusted media policy. No catalog object enables a compiled
Preview pin, downloads resources, creates a timer or instantiates customer code.

## Versioned document

compositionDocumentSchema / parseCompositionDocument / compositionDocumentDigest:

```ts
{
  format: "tadazz-show-composition",
  schemaVersion: 1,
  selection: ShowThemeSelection,          // unchanged existing strict v1 shape
  composition: ThemeComposition,         // existing bounded candidate schema
  scopes: Array<{ scopeId: string; selection: ScopedThemeOverrides }>
}
```

The selection and composition.baseTheme identities must match exactly. Scope
IDs are unique. Existing selection IDs/unknown valid IDs, role selections,
per-card scope archives, mute/inherit and composition refs survive roundtrip.
No rewrite of legacy tada-show/motionKit/TadaShowV1 data, JSON/XLSX/.tadazz
formats, native theme definitions or live room pins occurs. Unknown major
versions, code fields, prototypes/accessors/cycles, oversize JSON and mismatched
identities fail. The sidecar has no renderer code and grants no asset rights.

## Storage adapter for E/F

CompositionRepository uses an injected CompositionStorage. It does not add a
second filesystem/journal/storage engine. Trusted authenticated server code
constructs `{tenantId,draftId}`; the key is not itself authentication. Never
accept an arbitrary client tenant key as authority.

- read(key), save(key,expectedRevision|null,document): exact tenant-keyed CAS;
  null means create only. Stale revisions conflict without changing content.
- duplicate(source,target,expectedRevision): same-tenant, new target only,
  preserving internal content IDs; no overwrite of the original or target.
- publish(key,expectedRevision,version): creates an immutable **content version**
  through publishIfRevision, atomically checking current draft revision and
  absence of that version. This is not runtime/asset/executable publication.
- version(key,version): returns the exact stored version after rechecking key,
  format, version, content digest and revision. Later draft saves cannot rewrite
  prior content versions. Returned records are copied/validated and frozen.

Storage implementations must atomically implement compareAndSwapDraft and
publishIfRevision. The latter returns stored/revision-conflict/version-exists;
it may not overwrite a version. The current tests use an isolated in-memory
implementation, demonstrating semantics, not production durability or actual
HTTP authorization. F/E must bind their existing authenticated persistence
owner before exposing a save endpoint. No new server route is mounted here.
Publication records explicitly carry runtimeAcceptance:"not-evaluated".

## Renderer seam and outstanding acceptance

E continues to supply mountPreviewCandidate with its actual isolated-root
renderer, exact frame/role/locale/clock contract and real immutable loader.
F continues to normalizePreviewDraft/resolvePreviewPlan/projectShowBindings
using D port3/rule2. Existing genuine plans are unavailable and pins empty.
No test fixture/caller catalog/content version can change that readiness.

The retained package observation now covers106 module files and10 actual
metadata/license files (see sibling vendor-dd3-membership-20261115). Exact
dd3 build-to-cache binding, module contribution, complete toolchain/argv,
renderer Ref/ABI, image usage rights, font/environment and production loader
acceptance are still required. G must not infer executable readiness from this
catalog, content repository or the earlier53 diagnostics.
