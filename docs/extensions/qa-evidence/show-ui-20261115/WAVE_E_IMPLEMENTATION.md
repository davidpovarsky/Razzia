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
  browser matrix completed28/40 (Chromium20/20, WebKit8/20). WebKit's eight
  locale cases checked text only and did not establish visibility. Twelve actual
  visibility/transition cases failed; native WebKit is not accepted. Original
  Chromium matrix on the new candidate passed26/26, separate UI follow-up4/4.
  All failed raw evidence is preserved in run7-evidence. Two isolated WebKit
  diagnostics traced hidden bootstrap completion to suspended finite animations.
  Webkit-fix8 finished: TypeScript0, two source files30tests passed, native36/40
  (all Chromium20 plus WebKit16; four visibility/q2 cases still failed). Original
  Chromium matrix on fix8 passed26/26. Its JS SHA256 is
  `3ce86b2753a47b93283ce8d862099f85755260e331d0e0cfab056d49e509df7c`;
  CSS remains `3b220b024863d1e4a58b86b0b14a74e94be7b3da0c07e9921c2fb17430b67064`.
  Do not claim full WebKit acceptance or relabel old builds. Additional uncommitted
  correction removes waiting for decorative finish notifications after explicit
  reduced-motion finishing; real countdown is still awaited. Diagnostics3/4 are
  investigating live WebKit timelines that stayed at0 after10seconds.

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

Uncommitted V1 candidate adopts D's shared current-card frame schema/host producer,
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
committed V2 seam while continuing its independent source and tests. D subsequently
delivered source a8c87655447b6efe21f18c6233b5c686361e27f9 and evidence aae0680;
the next integration uses only that explicit V2 schema/producer contract.
Final core correction5f6d45/bbc83ce supersedes that initial V2 source pin.

The authoring source batch is committed as
`dae8156c5cd7c8fafa6125c3e2e6fb00e6c2d474`; renderer/QA follow-up remains separate.

All E runners were verified terminal/PID0 after fix8 and diagnostic4. Measured
cumulative allocated blocks73,224,192B exceed the64MiB lane allowance by6,115,328B.
The final raw screenshots grew beyond the earlier estimate. No data was deleted;
the ledger records actual usage and a manager reallocation request precedes another
remote runner. The actual floor plus all other remaining budgets and64MiB margin
was2,327,613,440B versus2,566,606,848B free at that checkpoint.

Raw local run directories are preserved separately from curated Git receipts;
`*-local-sha256.json` records their actual bytes. Native output, image copies and
screenshots are excluded from Git by the local evidence `.gitignore`; that is not
deletion, rights approval or an assertion of independent remote rehash.

Actual executable pins remain empty. G's executable Preview prerequisite is unmet.
