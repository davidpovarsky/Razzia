# Concrete renderer bridge plan — review before implementation

15 November 2026. Producer: show_engine, top-level chat
`01a1dd19-5220-70d3-8349-e9e135399b4d`. This document proposes the next bounded
lease; it grants no source, build, runner, presentation seam or release permission.
Accepted source remains `81d5b8f7c0bd3931982c2b0d5a3a13b86e523a8c`, internal
port 3 / identity rule 2, truthful text-only/unavailable API, zero compiled pins.
The accepted 155-test/42-vector evidence is historical evidence of that source,
not a renderer result. Original SB tasks remain open. Raw full ui:check/freeze
still FAIL for 23 leased new paths, with protected mismatches empty; separate
source/freeze audits do not make the historical UI job green.

## 1. Smallest proposed executable milestone

Build one silent, observational native Classic stage adapter for current-card
text questions: single/multi, quiz/survey, 2–5 authored choices, manager and
spectator, question → answerCards → voting → voteLocked → results. Use the
existing stage, director, motion and theme owners. Fixture: actual normalized
five-question show, 20-second voting, explicitly zero synthetic audience/votes.
No fixture is represented as an actual participant or room. A resume/pause/replay
boundary is tested; arbitrary seek stays unavailable.

Player interaction, estimation, authored question/answer images, media scenes,
leaderboards, full-show story/intro/finale/recap, roster generation and audio
are unavailable in this first milestone. This narrow registry must enumerate
its exact phases/roles/types/counts; no overall theme parity claim follows.
The UI must report unsupported phases/roles explicitly rather than substitute
an attractive wrong screen. Remaining capability work is retained in section 9.

This first renderer is `tadazz-classic` using the real V4 adapter. It is not
`razzia-original` / `razzia-native-stage` parity. That native web view currently
expects stateful native content; mounting the live `TadazzShowView` or forging
its contexts would import sockets, game identity, session state and globals.
Requests for an unimplemented renderer retain their requested identity and
unavailable status. Any later explicit fallback must preserve requested/effective
IDs and diagnostics; Classic cannot silently stand in for original Razzia.

## 2. Verified existing reuse and import boundary

The presentation public barrel already exposes the following; no protected
export hook is needed for the proposed silent stage. Runtime artifact entry
uses the existing leaf paths below to keep the dependency/CSS closure bounded.
Host code may use public type exports; it must not import the entire runtime
barrel and assume unrelated CSS/audio side effects disappear.

| Existing source relative to extensions/src | Exact reuse / limit |
| --- | --- |
| presentation/index.ts | Public `StageRendererAdapter` alias of `TadazzV4StageAdapter`, `ShowStage` alias of `TadazzV4Stage`, plus director/audio/theme exports. |
| presentation/tadazz-show/TadazzV4StageAdapter.tsx | Actual forwardRef stage adapter; accepts `TadazzStageHandle`, labels/v4Labels, reducedMotion, fitRevision, interactive, multiSelect, onSelectOption and onCue. |
| presentation/tadazz-show/TadazzStage.tsx | Existing `StageQuestion`, `StageOption`, `StageRevealInput`, `TadazzStageHandle` and controlled stage props. |
| presentation/tadazz-show/show-director.ts | `planTransition`, `runSteps`, `collapseForResume`, `StageSnapshot`, `StageStep`. There is no exported StageDirector class to invent or clone. |
| presentation/tadazz-v4/TadazzV4Stage.tsx; motion.ts | Native React/WAAPI implementation, cue callback, 1920×1080 contain fit, existing pause/resume/stop behavior. |
| presentation/show-themes/context.tsx | `ShowThemeScope`, `showThemeStyle`, fixed product-logo accessor. Use a trusted resolved source-controlled theme; no fake envelope/provider. |
| core/show-themes/index.ts | Existing `resolveShowTheme` and trusted source catalog; candidate definitions are not executable pins. |
| presentation/audio-cue-player.tsx | Later reuse of the SAME `AudioCuePlayer`, `AudioPreferencesScope`, `AudioControlState`; global bus isolation seam is required first (section 5). |
| core/show-library/preview-port.ts | Sole producer API: normalize, genuine bound resolve, digest, role/phase projection, schemas/constants. Accepted 81d5 behavior remains frozen until a bridge phase is assigned. |
| platform-ui/index.ts | Governed TDS controls, scope, portals, dialogs/menus, host controls for surrounding platform chrome. |

Planned payload imports are explicit existing leaf imports, for example
`TadazzV4StageAdapter as StageRendererAdapter` from
`../tadazz-show/TadazzV4StageAdapter`, director functions from
`../tadazz-show/show-director`, and theme scope/style from
`../show-themes/context`. Stage types use type-only imports. Audio is absent
from the first payload. No copy of a stage, director, timer, scoring algorithm,
renderer source, source-rewrite transform or global alias is proposed.

`ThemeSandboxHost` was considered: its current protocol requires room identity,
a different origin, and parent-document CSP mutation. It cannot carry this
no-room demo by supplying a fake room. Its existing protocol remains unchanged.

## 3. Controlled props and current-card projection

Trusted host/controller retains the genuine normalized draft, its bound plan,
revision, role, phase and clock. It calls only `projectShowBindings` to obtain
role/phase visual data. Drafts, all questions, solutions, tenant data, manifest
write authority and callbacks capable of arbitrary resource resolution never
become component props. Role is a demo selector, not authenticated authority.
Changing role, draft/revision, theme, card or replay epoch invalidates the old
binding and stage generation; a role change is normalized/resolved anew.

One proposed additive producer companion, `derivePreviewStageMetadata`, supplies
only the bound current question ID, actual one-based question ordinal and actual
total question count. Existing `StageQuestion.number` is required; hardcoding 1
is incorrect. This companion must validate the same genuine draft/plan/current
card and return a frozen/opaque association, never a list of future questions.
It is a proposed API, not part of accepted 81d5. Its reviewed schema must not
add hidden MCP fields or mutate the accepted projection/wire contract.

| Native value | Sole permitted source |
| --- | --- |
| StageQuestion.key/question | Current projected question ID/text. Presentation key is a string; no native storage UUID is fabricated. |
| number / totalQuestions | Bound producer stage metadata, derived from actual validated authored question order. |
| options | Projected ordered choices only after answerCards; labels only in first milestone. During question entrance, options is empty. |
| questionImage / option.image / note | Omitted initially. No URL from snapshot/draft flows through. Later image grants follow section 6; private notes/solutions are not copied. |
| interactive / onSelectOption | false / absent initially. Later both require genuine current localSelection capability and canAnswer; indices map to current projected choice IDs and validated local intent. |
| multiSelect | Current projected questionType === multi; never inferred from saved native UUIDs or a different card. |
| reducedMotion / fitRevision / labels | Validated demo preference, explicit container resize revision, and all eight localized native label sets. |
| ShowScene.voting seconds/remaining/deadline | Sole trusted demo-clock snapshot, converted at the adapter boundary as below. |
| totalPlayers / answers | Actual role-filtered projected progress and permitted own selection. First fixture explicitly has zero eligible/responding audience and no selection; do not invent 5 players to fill UI. |
| reveal counts/percentages/mode/solutions | Results-phase projection only, aligned by current ordered choice IDs. Solutions derive only from revealed correct flags, never private draft correctAnswers. Empty results are explicitly zero synthetic responses. |

Map question/voting/results to real `ShowScene` variants and call
`planTransition(prev, next, stageSnapshot, wallNow)` then `runSteps`. There is
no answerCards/voteLocked ShowScene variant: these two narrow adapter mappings
use `runSteps` with the existing `presentOptions` / `lockVoting` operations.
Do not forge a voting scene for answerCards: it would open voting/countdown too
early. Unsupported scene kinds fail unavailable, with no second planner.
Transitions run on semantic phase/card changes, not on every elapsed-time tick.

Preview IDs stay within this presentation boundary. The actual authored/native
bundle/timeline schema in `core/studio-timeline-schema.ts` requires `z.uuid()`.
Never pass preview-card/question/scene hashes to that schema, edit its validator,
cast away its checks, persist fake UUIDs, or manufacture gameId/room/PIN/socket
state. MCP 0.1, UI metadata 1, authored version 1 and identity rule 2 are retained.

## 4. One lifecycle, clock and explicit style boundary

Proposed host: an explicitly owned ShadowRoot stage surface, with an independent
compiled renderer React root mounted inside it. The renderer payload owns its
React runtime/root; host React nodes/contexts are not passed across roots.
Only bounded plain view data and local callbacks cross the mount API. This
avoids duplicate-React hook contexts when loading a separately hashed artifact.
Native styles are extracted as build artifacts and installed only in this
owned root, without textual CSS/source rewrites or document-global style
injection. TDS chrome remains outside it in the governed platform scope.

Feasibility is a gate, not an assumed result: verify native CSS/fonts, focus,
resize observers and scoped root queries in the ShadowRoot. The motion code
uses its stage-root queries; document.createElement nodes are appended to that
root. Test actual computed styles, geometry and teardown. Preserve frozen
editor style/provider/routing behavior before/after mounting. If composition
fails, stop with the exact failure and propose the smallest isolated-document
or export seam for approval; do not inject global CSS, mutate hidden DOM or
rewrite protected sources to make it pass.

The native stage fits min(viewportWidth/1920, viewportHeight/1080), letterboxed.
Test 16:9, 4:3 and narrow host containers and reduced motion. A 390px screenshot
of a scaled desktop stage is not proof of usable player controls. Narrow player
acceptance is a later explicit gate, with no editor/native-tablet migration.

Demo elapsed/deadline values are relative to the trusted run clock; native
openVoting and V4 countdown use Date.now/WAAPI. At a semantic voting/resume
boundary compute remaining = max(0, deadlineMs - elapsedMs), then pass a fresh
wall deadline wallNow + remaining. Do not pass relative 20000 as Unix time,
patch Date.now globally, create a second UI setInterval countdown, or replay
entrances on every tick. Pause/resume uses existing handle methods and a
consistent clock re-anchor. Seek stays unavailable until silent reconstruction
is separately proved. Replay creates a new run epoch and remounts the stage.

Keep a captured instance/generation token per transition. `runSteps` checks
isCurrent before each operation; its awaited hold timeout is not abortable,
and its wipe-covered callback can fire later. A forwarding handle must check
generation before each method AND inside covered callbacks, and never address
a newly mounted stage through an old promise. Unmount/invalidate on identity,
role, revision or replay reset; guard onCue and pending completions. Existing
finishAnimations can emit old cues, so invalidate first. No universal immediate
cancel/seek guarantee is claimed. Do not call native full-show defaults that
seed example contestants/rosters or start long story holds in this milestone.

## 5. Audio reuse and the only currently identified existing-file seam

First bridge is silent: no AudioCuePlayer is mounted and no stage cue is
forwarded to window. Native stage onCue/local non-bubbling tadazz:cue may be
recorded for diagnostics only. autoPlay=false alone is insufficient: current
AudioCuePlayer's global SFX handler can play independently of music autoplay.

The later audio phase must reuse AudioCuePlayer's existing music/SFX policy,
master mute/volume/pause, dedupe and cleanup. No second Audio()/Howler/timer/audio
engine in Theme Builder or MCP widget. All stage/music/audio controls use one
owner per preview instance, shared by its layout variants.

Exact proposed seam requiring a separate existing-file lease/approval:
`extensions/src/presentation/audio-cue-player.tsx` only:

- AudioCuePlayerProps: optional eventTarget?: EventTarget, defaulting to window
  at the browser boundary. Use it for ALL tadazz:sfx, tadazz:timer-stop and
  tadazz:audio-unlock listen/remove/dispatch paths, and effect dependencies.
  No behavior change for omitted prop, no document/global provider change.
- AudioPreferencesScope: optional initialMuted?: boolean with legacy default
  false; use only for initial state. Preview passes true in its own scope.
  Do not mutate a mounted live room's preference state or share its provider.

A per-instance EventTarget plus user gesture unlock prevents cross-preview/live
cues. Use renderControls(AudioControlState) for TDS chrome and existing localized
labels; do not edit protected web controls. Pass real preview continuity/current
card/epoch identity through supported props without fake gameId. Ignore obsolete
cue generations; countdown-ended is visual completion, not authority to reveal
or advance. Audio reveal only follows the current authorized results transition;
no catch-up burst after pause/replay/seek. Verify two previews plus a live-default
owner for isolation, initial silence, opt-in play, mute/pause/volume, dedupe,
resume and disposal before enabling audio capability.

No other protected presentation/export seam is currently justified. An additive
import path already exists for stage/director/theme/audio. Any later necessity
must provide exact file/symbol/pre-edit ledger, failed downstream alternative,
owner approval and regression evidence before editing. packages/**, editor,
live game routes/providers and old manifests are outside these proposed leases.

## 6. Trusted authored-slot resource bridge — strict gate stays until proved

The accepted 81d5 projector and output schema reject every question.image and
choice.asset. Adding a renderer pin or allowing a declared asset list must NOT
remove this gate. First stage omits caller media. Even its intrinsic logo,
backdrops, native CSS resources and Rubik must be included in the verified
source-controlled compiled asset closure before the stage is called available.

Proposed later core-owned asset grant pipeline, before any caller resource is
resolved or passed to visual props:

1. Reuse the genuine normalized draft/bound plan/context/current question and
   rule-2 identity map. Derive each allowed slot from that current authored
   question or one-based answer index; never trust snapshot slot membership.
   Bind grant to draft/revision, plan/pin, current question/choice, role, phase
   and run generation. Future-card/other-answer refs do not qualify.
2. Match the derived authored URL to an exact ID/hash/kind in the verified
   immutable compiled asset manifest AND declared authorized source content.
   Reuse producer schemas and checkAssetReference metadata policy, plus a
   trusted server/storage authorization receipt for physical rights/tenant
   ownership. Metadata alone is not that receipt. Existing source-controlled
   repository assets need their preserved license/provenance proof; private
   tenant assets require actual authenticated authorization, not demo role.
3. Verify MIME/kind, rights/license/export policy, byte length/SHA256 and decode
   budgets. Initial authored-media extension may support only png/jpeg/webp
   images <=10 MiB and <=16,777,216 decoded pixels, subject to explicit phase
   approval and measured source fixtures. Audio/video/Lottie stay unavailable
   until their own budgets, rights and native render paths are proved. Measure
   the intrinsic stage closure too; do not assume all catalog assets fit.
4. Resolve/fetch only a matched, immutable permitted resource location through
   the one approved asset loader. No global catalog fallback, snapshot URL,
   future/private lookup, file/data/javascript URL, arbitrary redirect, or
   unchecked path. A failed hash/decode/rights/budget check yields unavailable.
5. Issue an opaque/frozen current-slot grant; only the approved presentation
   boundary converts it to native questionImage/option.image URLs. Components
   receive the minimum resolved current slot, no resolver callback with broad
   ID access, draft, storage token, raw manifest or other-card resources.

Only after this full path and independent forged/current/future/rights/kind/
budget tests pass may the owner propose lifting the exact strict projector/
output-schema gate for that grant. Preserve denial for raw refs even with a
genuine bound plan. A companion capability API may be additive; any real shape
break needs an explicit contract/version proposal, not a hidden port change.
No accepted compiled grants/rights-backed media fixtures exist today.

## 7. Actual executable pin provenance without a hash cycle

Use a new downstream renderer artifact entry, independent of the host bootstrap
and accepted compiled-manifest module. Bundle the existing native source, React
runtime and renderer dependency closure into a standalone executable artifact;
extract CSS and include exact font/asset dependencies. It exposes only bounded
mount/update/dispose ports for the owned root. The host loads an immutable
allowlisted artifact with browser-supported integrity enforcement; no source
code from candidate JSON or a custom URL is imported. The loader's runtime
integrity/CSP behavior itself requires proof before activation, not a trust
assumption based on a document hash.

The payload uses type-only preview-port imports and necessary pure schema leaf
imports. It must NOT runtime-import getCompiledPreviewManifest, the host loader,
or a barrel that pulls the generated pin back into the payload. Build dependency
metadata must prove this exclusion. This is a build-boundary design, not textual
source rewrites, package aliases or a fake hash of research documents.

Build order is concrete:

A. Freeze source commit/closure, lockfile and exact toolchain/build inputs. Build
   payload JS/CSS/vendor/font/assets without its eventual pin/manifest present.
B. Hash actual emitted payload bytes and every executable/resource dependency.
   Create a sorted canonical artifact index (relative path, bytes, SHA256, MIME,
   provenance); exclude the index itself, external pin/registry manifest and
   outer loader. rendererBuildSha256 hashes these canonical index bytes. All
   listed files must be actual exported artifacts, not just source assertions.
C. Generate canonical executable registry bytes mapping actual compiled entry,
   supported phases/roles/types/cardinality and verified asset manifest/index.
   Hash those as registrySha256, then create the existing exact registry/renderer
   ID@version pin. Candidate registry availability remains candidate; a new
   executable catalog entry requires real implementation and evidence.
D. Emit the external immutable accepted manifest/catalog and loader bootstrap.
   Their own bytes/hashes are recorded separately; they are outside the payload
   index. The payload contains no hash of this manifest, so there is no cycle.
   The trusted host accepts only this source-controlled exact pin; supplied JSON
   cannot register code. Browser execution must match the indexed bytes.
E. Validate exported artifacts independently, then activate the owner-controlled
   manifest entry. Same ID@version + same bytes is idempotent; different bytes
   require a new version. M3/another consumer must load the exact artifact or
   produce a new co-built index/pin/QA evidence if it rebundles/changes bytes.
   Never reuse an old prebundle digest for a changed executable closure.

The host/Theme Builder app and its loader have separate build evidence, so a
changed outer UI is not falsely asserted to have the renderer's hash. Runtime
CSS/resource requests must correspond to the verified closure. Failure of SRI,
CSP, artifact lookup, registry digest or closure checks returns unavailable.
Zero-pin accepted 81d5 remains the default until all of this is implemented and
reviewed. No build, deployment or pin activation is performed by this plan.

## 8. Proposed ownership and review sequence

All paths below are proposals requiring explicit phase assignment; no new
source lease or additional existing presentation-file permission is inferred.

| Owner | Exact proposed files / responsibility |
| --- | --- |
| show_engine, exclusive pure core | New core/show-library/stage-metadata.ts, asset-bindings.ts and executable-preview-registry.ts if accepted; owned existing preview-schemas.ts, preview-resolve.ts, manifest.ts, projection.ts/projection-schema.ts, preview-port.ts and focused tests only when that actual phase is assigned. Genuine bindings, public metadata/slot grants, capability/pin validation. No React/DOM/audio/scoring. |
| New independently visible Terra/high Show UI writer | New presentation/show-library-preview/NativePreviewStage.tsx, PreviewStageHost.tsx, stage-scene-adapter.ts, preview-transition-owner.ts, renderer-entry.tsx, i18n.ts; new components/theme-builder/{ThemeBuilderShell,PreviewPanel,PreviewControls}.tsx plus scoped i18n/resources. Controlled native composition, explicit isolated root/lifecycle, TDS chrome. No edits to core/show-library/** or existing presentation files. Names may be finalized before ASSIGN, not expanded silently. |
| Same assigned UI writer, later audio seam only if explicitly leased | Existing presentation/audio-cue-player.tsx exact eventTarget/initialMuted symbols from section 5, separate commit/evidence/default-live regression review. Nothing else protected is granted. |
| Build/QA owner explicitly assigned by manager | New qa/build-show-preview.mjs and artifact/integrity harness; immutable source/artifact export, scoped server run, five-phase/layout/lifecycle/locale/CSS freeze evidence. No CI/provider/global install or deployment implied. |
| M2/MCP owner | Existing authenticated controller/wire/revision/digest ownership and embedding the exact same accepted preview host/artifact. Consume the producer API; no second normalization/identity/projector, stage/audio engine, fake room or separate preview fallback. |
| Manager/integrator and independent QA | Exact leases, seam approvals, compiled pin and artifact acceptance, historical TDS guard scope resolution, cross-consumer regression/integration decisions. Original tasks stay open until their complete acceptance. |

B0: Approve this concrete plan and confirm disjoint filenames/ownership. UI
thread may preflight against 81d5 now; no UI implementation/existing-file lease
until approval. No active server allocation belongs to show_engine currently.

B1: Assign a bounded source-only silent adapter/artifact feasibility phase.
Verify current-card/role mapping, ordered 2–5 choices, five phases, honest zero
fixture data, missing/forged binding denial, timer/pause/replay/generation and
ShadowRoot/editor-style isolation. Candidate pins stay unavailable.

B2: Authorize measured artifact build/scoped server QA, independent byte/rights/
closure review, and only then core executable registry/pin activation. Prove
actual unsupported-role/phase/type/cardinality failures and retained strict
caller-asset/action denial. Record raw ui:check outcome honestly and maintain
all protected freeze evidence; no full CI/release claim from focused checks.

B3: Separately assign audio isolation/default-live regression, safe player local
intent/cardinality/narrow ergonomics, and authenticated current-slot media
pipeline, with per-capability evidence before enabling each. Request exact
server cap/window only when an actual run is authorized; no speculative runner.

## 9. Full Theme Builder backlog and preservation

The minimum bridge is not closure of SB-05/06/07 or full Theme Builder. Preserve
independent asset/audio/template/motion sections, per-role/card/theme overrides
and reset/precedence, component/animation libraries, complete screen variants,
full show choreography, narrow accessible player controls and estimation.

Keep import/export as real validated versioned compositions with stable saved
IDs, provenance, licenses, eight locales and safe unknown/prototype handling.
Export needs actual rights/tenant/dependency closure; import cannot register
executable code or confer ownership. Persistence, revisions/CAS, recovery,
version history, publishing/installability and customer-data migration belong
to their separately assigned backend/storage/integration work. No local JSON
save/export or demo state is represented as those completed features.

Platform UI uses the live TDS catalog/import guide, Rubik and eight existing
locales en/fr/de/es/it/ja/tr/vi through scoped i18next resources. Native label
interfaces and audio renderControls are fully localized, not English fallback
acceptance. Show palette/choreography belong to the selected theme, not platform
TDS token overrides. Preserve product logos, existing license assets, editor
freeze and all upstream behavior. No packages/**, frozen editor typography/CSS/
provider/routing, public deployment, billing/provider or customer migration
changes are authorized here.

## 10. Validation of this plan

This checkpoint is documentation only. The companion static receipt checks
all 23 accepted module hashes unchanged, exact existing symbol anchors and
leased documentation scope. No tests, typecheck, build, ui:check, browser,
server runner, install or new source/pin change was run for this document.
The existing 155-test evidence and raw UI guard FAIL are retained without being
relabelled as new renderer validation. Next deliverable is manager plan review.
