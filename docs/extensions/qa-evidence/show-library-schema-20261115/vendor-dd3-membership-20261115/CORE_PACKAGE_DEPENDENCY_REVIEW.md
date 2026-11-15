# D review: dd3's additional package-schema source dependencies

Source-only review, no schema/runtime/source edits and no execution grant.
The actual graph reaches NativePreviewStage → show-themes/context →
show-themes/index → definition → packages/protocol → packages/manifest →
packages/paths. It also reaches Zod and show-themes/selection. These are
distinct from Show Library's compiled-preview manifest and host authority.

At dd3cd1347981ac6fd934f90d870ff57bba82d470:

| Source | Actual Git blob | Relevant behavior |
| --- | --- | --- |
| extensions/src/core/packages/protocol.ts | 2318a6e797c34299363ce344871a7120135a0048 | RUNTIME_PHASES, sandboxDefinitionSchema, runtimePinSchema; snapshot/message Zod schemas and an explicitly instantiated RendererMessageGuard class |
| extensions/src/core/packages/manifest.ts | 14c0ad865349abb6e3be48c07410a42b6675cf5d | packageDigestSchema and portable package metadata/descriptor/file schemas |
| extensions/src/core/packages/paths.ts | 4e8618d4fccdbbd547e63da20bbc4f0b0c8654e7 | Pure string normalization/portable-path checks; no filesystem IO |

All three current local Git blobs and independently observed mounted source
SHA256 values match those dd3 records. Show-theme definition actually imports
sandboxDefinitionSchema/runtimePinSchema. Protocol imports packageDigestSchema.
Top-level behavior constructs bounded Zod shapes/constants and declares pure
helpers/classes. These three files contain no loader/network/filesystem import,
eval/customer code, authority-registry insertion, media fetch, new timer/audio
owner or root-reviewed receipt setter. The message guard performs instance-local
replay/flood checks when explicitly called; importing it is not authenticating
a session or opening a channel. A hex digest/schema field is not an execution
capability or a safe host pin by itself.

D scope disposition: these exact three source dependencies are acceptable as
bounded schema/path dependencies for this existing dd3 candidate. They must
remain in the source closure. No reason was found to rewrite the native context
or duplicate the schemas. The resolved graph does not prove export-level
tree-shaking or emitted contribution, so that field stays unknown pending E's
actual bundler receipt. This static source judgment does not clear image rights,
package/store authority, renderer ABI/pin, immutable loader or full product
acceptance, and does not enable any runtime. No historical test result is
relabelled as a new test of this review.
