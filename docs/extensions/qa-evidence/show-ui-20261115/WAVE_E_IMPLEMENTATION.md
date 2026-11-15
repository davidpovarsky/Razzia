# Lane E implementation and evidence, 15 November 2026

Owned branch `codex/tadazz-hq-show-ui-20261115`, initial HEAD
`315d533d32e01d4997b740ccb825f0170501ce7f`. This checkpoint remains an
implementation batch, not full SB08/SB09/SB10 or release acceptance.

## Implemented authoring surface

Separate authenticated `/studio/themes` entry, with a small navigation link in
Studio and one link beside the existing editor's Theme heading. No existing
editor field, layout, game state, native theme ID or stored v1 schema is replaced.
The Builder uses the existing PlatformScope, Button, Card, Input, Select and
AlertDialog, inherited Rubik/theme tokens and a scoped grid/flex layout.

The editable candidate document wraps D's unchanged CompositionDocument with
an editor name/id and bounded candidate registry. Tree/drag/keyboard reorder,
compatible component insertion/removal, bounded properties/layouts, motion
references, asset references, role/game scope overrides, atomic edits, bounded
undo/redo, create/duplicate/save/revert and unsaved-change guards are implemented.
Native catalog selectors use the real 15 slots and 16 audio events. No additional
audio player or clock exists. Asset IDs are always paired with their SHA-256;
ambiguous IDs across bundled families are not collapsed.

Native and asset catalogs remain metadata. Native assets without a trusted
media grant are shown disabled, not downloaded, exported or marked authorized.
Advanced graphs, media and the full native theme binding are not executable.
Preview, runtime Publish and Rollback remain disabled until the actual producer,
renderer, rights, loader and package acceptance requirements are satisfied.

Eight-language Builder text lives in its own `tadazzThemeBuilder` namespace;
existing locale/branding dictionaries were not edited or reopened.

## Existing installation and authorization boundary

The existing ThemeInstallationStore SQLite owns the new draft tables. D's
CompositionRepository is the sole composition revision/digest protocol. Its
CompositionStorage adapter performs draft CAS and content-version writes in
existing synchronous SQLite transactions. No additional storage engine,
filesystem journal or package installer is introduced. Existing signed theme
review, staging, publication, immutable versions, assets and rollback remain.

`createThemeBuilderRoutes` saves candidate authoring documents beneath
`/api/themes/builder/:tenantId/documents`. The host supplies its actual verified
SessionClaims, themeWorkspacePrincipal, existing installer OFF gate and existing
store. Tenant/grants from JSON are never accepted as authority. Body/identity,
schema and CAS conflicts are checked before writing. Unknown stored refs survive
roundtrip and D's contextual inspector reports their compatibility.

The receipt's `digest` is only the editor-envelope fingerprint used to preserve
unsaved edits during asynchronous save acknowledgment. It is **not an MCP digest**
or executable pin. F owns its existing MCP canonical digest; it must consume the
actual core content and binding through D's producer. Core composition digest
semantics remain D's CompositionRepository/CompositionDocumentDigest semantics.

The exact small backend hook is documented in WAVE_E_HOOKS.md. The independently
owned upstream backend file is not edited here. The real host test mounts that
same route through Hono's public API beneath the unchanged original theme parent,
with real isolated account registration/verification, JWT/session auth, workspace
assignment, HTTP, SQLite, stale CAS and OFF-gate checks. No production account,
database, signing secret, release or credentials are used.

## Executed verification and limits

- Retained dd3/six-image full run: all original23/23 passed in one fixture;
  disposal and CSP passed, font sampling raced painting:25/26 total. The
  corrected focused font follow-up subsequently passed1/1 on that exact retained
  dd3 renderer/fixture. This is not relabeled as a single26/26 run.
- Authoring run5: scoped TypeScript exit0;34/34 focused source tests; real
  Chromium/WebKit component browser30/30, including all eight locales, all
  native controls, saved draft roundtrip, conflict preservation, edits during
  acknowledgment, keyboard focus, RTL/reduced motion and390/1024/1920 layouts.
  Screenshots were inspected; a discovered transparent dark canvas was fixed.
- Run6: TypeScript exit0;20/20 focused tests including the actual original
  authenticated host seam; UI follow-up18/18. Native browser cases were NOT RUN
  after a producer preflight rejected the synthetic survey snapshot's missing
  empty solutionAnswerIds. That failure is retained and the fixture was corrected.
- Run7: TypeScript exit0;20/20 focused tests with the source-preserving public
  Hono host mount; retained dd3 font1/1; actual producer preflight8/8. Native
  browser/lifecycle/CSP/current-candidate cases are still running at this checkpoint.

Earlier provisioning failures and initial timeouts remain in retained receipts.
The installer roundtrip took33.1seconds under the0.25-CPU quota; the original
30second QA timeout failed, and the same assertions passed with the scoped
90second runner budget. This is not a performance acceptance claim. WebKit's
conflict scenario similarly exceeded its former30second fixture budget and
passed with60seconds; no assertion or permission boundary was removed.

Only targeted tests were run. Full original game/editor regression, production
site acceptance, complete asset-delete reference integration, full package
import/export/runtime publication and the release matrix remain OPEN. Physical
iPad/projector and PSTN tests remain NOT RUN. Private six-image QA permission
does not confer customer image rights.

## Current native renderer work and next contract

Future V1 candidate adopts D's shared current-card frame schema/host producer,
keeps only the payload leaf in its bundle, derives seconds from the actual card,
and rejects an inconsistent legacy assertion argument. Read-only diagnostics
observe the actual React imperative ref; no native commands escape. A bounded
initialization guard suppresses Zod's caught Function probe while this payload's
schemas are constructed and restores the host's prior JIT configuration before
mount. The new source/build/graph/physical-cache receipts never replace dd3's
historical hashes or create a ready renderer/pin.

Manager accepted an explicit additive V2 native theme binding on15November.
D owns its core schema/producer and versioned nativePresentation document;
E owns actual renderer/build/loader/UI admission; F owns its existing canonical
MCP digest/tool protocol. The old V1 paths and digests remain unchanged, saved
documents are not silently upgraded, raw definitions/code/URLs are not a frame
input, and unsupported custom graphs/media stay unavailable. E awaits D's exact
committed V2 seam while continuing its independent source and tests.

Actual executable pins remain empty. G's executable Preview prerequisite is unmet.
