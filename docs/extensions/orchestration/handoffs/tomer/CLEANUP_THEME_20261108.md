# Upstream cleanup and show themes — isolated execution

Owner request (8 November 2026): refresh the source audit, reduce downstream logic
inside upstream modules first, then execute the supplied Show Theme Engine prompt.
This request authorizes the scoped extraction across server and web in this single
session, superseding historical role restrictions. No other worktree is edited.

Branch: `codex/upstream-cleanup-theme-engine-20261108`.
Worktree: `C:/Users/DAVID/Code/Razzia-worktrees/tadazz-cleanup-theme-20261108`.
Starting commit: `46a1e0049a23816b32d5061592bd373f0e636b9e`.
Original baseline: `5161eb7` (4.0.1). Fetched upstream: `8345663` (4.0.2).
Uncommitted work in the source worktree is excluded and remains untouched.

## Planned protected edits (recorded before implementation)

| Original file / symbols | Extraction and necessity | Alternative / merge risk | Verification |
| --- | --- | --- | --- |
| `packages/socket/src/services/game/index.ts`: roster state, CRUD, presence projection | Move feature-owned roster storage/management/projection to `extensions/src/server/game/roster/`. Keep existing public methods as forwarding seams and game/player operations as injected ports. | Moving the entire Game would hide upstream rather than isolate features. Keep join/auth/score lifecycle here. Medium risk: identity, disconnect and private host data. | Root game/API suites; extension roster, gateway, scoring and reconnect tests; compare baseline results. |
| Same: `getLastCompletedQuestionSummary`, `getAnswerRecapSummary` delegates | Extract read-only show summaries accepting snapshots/ledger access. | No runtime dependency on socket internals in the new modules; preserve result ordering/ties/zero/skip semantics. Low–medium risk. | Existing story/recap tests and focused pure projection tests. |
| `packages/socket/src/services/game/round-manager.ts`: `showResults` reveal distribution | Pure extension projection; RoundManager retains scoring, clock, history and callbacks. | Do not move the round engine or change timer/replay behavior merely to reduce line count. Low risk. | Existing mixed-mode/scoring suites plus distribution edge cases. |
| `packages/web/src/features/game/components/GameWrapper.tsx`: scene/interlude presentation | Move extension scene selection, labels and rendering into a presentation component with explicit props/callbacks. Keep upstream contexts as thin composition. | No duplicate stores, socket clients, timers or UI primitives. Medium risk: render precedence and first paint. | Existing web tests, build/typecheck and isolated real-browser regressions. |
| `packages/web/src/features/quizz/components/QuizzEditorSidebar.tsx`: `TimelineSceneCard` | Move downstream scene-card presentation into `extensions/src/editor`; keep DnD/form orchestration in the host. | Reuse injected existing AlertDialog and icons; preserve DOM/classes. Low risk. | Editor tests and isolated browser editing flow. |

Additional protected edits will be recorded here before being applied. Do not
merge upstream automatically: report overlapping files and conflict rehearsal.

- `QuizzEditorHeader.tsx`: extract the downstream timeline-kind catalogue and
  Studio navigation tabs (same markup/classes), and composite save request
  preparation to extension modules. Host retains form, routing, conflict UI and
  cache integration. Verify editor tests and browser save/reopen. Low–medium risk.
- `QuestionEditor/MediaLibrary/index.tsx`: extract the existing sidecar media
  reconciliation and used-URL projection to pure extension helpers. Keep query,
  authenticated deletion, upload and modal lifecycle in the host. Preserve exact
  current cleanup semantics rather than silently broadening deletion. Verify
  media/editor regressions. Low–medium risk.
- `packages/web/src/index.css`: move only the appended Tada entrance/decoration/
  scene keyframes to an extension stylesheet, loaded by one CSS import. Keep the
  original Razzia rules and shared answer-color token. All selector/keyframe
  names, values and reduced-motion rules remain unchanged. Verify production
  build and browser computed-style/animation regressions. Low risk.
- `packages/web/src/locales/{en,fr,de,es,it,ja,tr,vi}/{errors,quizz}.json`:
  the only downstream changes are two translation keys. Preserve those exact
  translations in extension-owned namespace additions and restore the original
  JSON files byte-for-byte from `5161eb7`. `packages/web/src/i18n.ts` registers
  missing nested keys through one additive helper, retaining any future
  upstream value. This removes 16 unnecessary upstream file modifications and
  avoids eight actual upstream 4.0.2 locale overlaps. Verify all eight languages
  and non-overwriting namespace merge tests. Low risk.
- `packages/web/src/locales/locales.test.ts`: its raw-file-only key scan cannot
  see runtime namespace additions. Apply the same production registration
  helper before flattening keys, keeping the existing completeness/plural tests
  intact. This is required regression coverage, not a removed assertion.

## Baseline evidence

- Fresh dependency install: `pnpm install --frozen-lockfile`, exit 0.
- Fresh root Vitest at the starting commit: 348/348 tests, exit 0.
- Extension suite, typing, lint and builds: pending; not inferred from old reports.

## Phase ordering

Complete and commit the behavior-preserving cleanup before theme implementation.
The old theme prompt's obsolete worktree/commit instructions are replaced by the
owner's current request for isolation and synchronization. Its requirements for
Classic fidelity, data continuity, honest QA and no deployment remain binding.
The AI Creator handoff ZIP must be located; do not invent its contents or claim a
production installer from a static manifest validator.

## Phase 1 checkpoint and synchronization

Cleanup commit: `7c0c4bd`. Root 348/348; isolated Chromium/WebKit 4/4;
all three project typechecks and production build exit 0. New-module lint exit 0.
The extension suite retains exactly the original 15 failures (no new failures).
Additional boundary/locale checks: 18/18. Latest audio commit `69cbf80` was
reviewed and merged locally after the checkpoint; no other worktree was changed.
An object-only `git merge-tree --write-tree HEAD upstream/main` rehearsal found
one actual conflict: `pnpm-lock.yaml`. No upstream merge was applied.

## Theme integration ledger (before implementation)

- `packages/web/src/features/game/components/GameWrapper.tsx`: replace only the
  Classic early-return element with an injected typed theme renderer/provider.
  Keep identical view props, event subscriptions, legacy rollback and media gate.
  No new game engine, transport or timer. Test all roles and first paint.
- Existing downstream `packages/web/src/features/game/components/tadazz-show/`:
  consume resolved theme assets/tokens/audio from the provider; retain current
  v4/Goldy animation adapters, choreography and authoritative milestones.
- Existing downstream Studio settings/scene editor and CardBackgroundConfig,
  CardAudioConfig, QuestionEntranceConfig: use the active manifest capabilities
  and variant lists. Archive old picker implementations behind explicit legacy
  rollback. Reuse original controls; no new editor or global styling.
- `packages/web/src/features/quizz/components/QuestionEditor/MediaLibrary/index.tsx`:
  optional finite URL whitelist for a theme-owned picker, so old sounds cannot
  leak into Classic choices. Existing general library remains reusable.
- No theme-specific edit to `packages/socket/**` or `packages/common/**` is
  planned. The current extension state already carries authoritative defaults.
  Extension schemas/serializer/import/export must carry additional safe metadata.

The requested theme work now follows the current owner's explicit execution
request, rather than the older prompt's wait-for-event instruction. No publish,
production change or external message is authorized by that interpretation.

### Necessary observational server seam for audio correctness

The existing extension envelope has no authoritative vote-completion reason.
A client deadline comparison cannot distinguish delayed manual/all-answered
completion from real timer expiry. Before editing: add a read-only completion
reason (`elapsed`, `manual`, `allAnswered`) in `RoundManager`, clear it at a new
question, annotate the existing manual/all-answered paths, and expose it through
one session delegate in `Game`. `Game.abortCooldown` annotates only an open vote.
No timeout, abort, score, accepted-answer or state-transition behavior changes.
Only the versioned extension envelope carries the field; common/base protocol
stays unchanged. Expected protected diff: under 25 lines across Game/RoundManager.
Validate natural/manual/all-answered, pause, skip, restart, history and reconnect
with contract tests and browser audio spies. This is essential to Gate 4, not a
theme implementation inside the game engine.

## Final delivery — 8 November 2026

Code checkpoints: `7c0c4bd` (cleanup), `d4b3159` (themes), `15b2fda`
(boundary/canonical corrections), `2db7e03` (dedicated expiry sound only on
natural expiry). Reviewed and locally merged `69cbf80` and `9d63b56` from the
concurrent branch. No uncommitted source work from another worktree was copied.
The only merge conflict preserved both theme resolution and the newer quiet
story-reading policy. The baseline-only QA worktree at detached `3823be9`
contains cleanup plus the same synchronized commit, without the theme engine.

Final actual checks: 351/351 root tests; 555/570 extension tests with exactly the
same 15 baseline failures; 12/12 isolated Chromium/WebKit browser tests; 53/53
focused theme/authoring/native-scene tests, including the normal Tailwind
formatter roundtrip. Effective app/socket/extension/e2e typechecks and production
build passed. Full lint remains failing; normalized per-file/rule comparison and
focused clean checks are recorded with raw compressed outputs. The final native
class helper preserves exact tokens and prevents formatter whitespace loss.

The manual-vote-lock sound is separate from the timer-expiry asset. Browser
spies assert zero expiry-file plays on manual completion and exactly one on a
natural expiry, as well as track identity/restart, pause/replay/skip, role output,
autoplay recovery and refresh. Thirty-two real-app screenshots cover the focused
matrix; screenshots wait for visible card/question content after entrance.

Read `docs/extensions/SHOW_THEME_ENGINE_QA_2026-11-08.md` and
`docs/extensions/qa-evidence/theme-engine-20261108/summary.json` for evidence and
PARTIAL/NOT TESTED gates. In particular: no physical iPad, manual listening,
complete historical pixel parity, long memory profiling or production theme
installer was claimed. No push, main merge, deployment, credential change,
telephony purchase or Asana write was performed.

## Continuation requested 8 November — exhaustive original-file review

The owner explicitly requires a semantic review of all 96 original files, further
safe extractions before finishing the complete theme-authoring/install/runtime
path, in this isolated branch. The prior quantitative ledger is not treated as
proof that the extraction is exhaustive. No delegation, production deployment,
main merge or push is requested.

Synchronization reviewed and merged `0079e45`: explicit synchronized opening,
fullscreen tie choice and host guide. Integration fixes before proceeding:
`TadazzV4Data.onResolveTie` must declare the callback already supplied by the new
native adapter; `PresentationLaunch` uses an explicit field instead of a TS
parameter property so the web app's erasableSyntaxOnly typecheck remains valid.
The TDZ in the opening music state was resolved while composing the merge.

First inspected original files: Dockerfile, docker/nginx.conf, common constants,
auth/game/socket/status types, auth/game/quizz/socket validators. Retain shared
wire/types/validation; extract `resolveQuestionPlayMode` implementation from
common/types into extensions/core and update its actual callers. The validator's
mixed-mode solution requirement stays at the common wire-validation boundary.
Docker workspace/WASM integration is necessary; assess restoring unrelated build
command/cache changes with an actual local build. Move downstream nginx host,
cache and protected-media configuration to an included extension fragment, keeping
the protected media route and existing proxy behavior identical. Record parser
validation and verify no tenant file alias becomes public.

### Next extraction ledger (before the following edits)

| Original path/symbol | Planned integration retained | Verification |
| --- | --- | --- |
| `QuizzEditorHeader.tsx` / save, conflict, Studio tabs | Original title/save/exit shell; owned composite-save hook and Studio controls | Actual app typecheck, import/export/save browser cases |
| `QuizzEditorSidebar.tsx` / timeline mapping and scene rows | Original question sorting shell; owned timeline items/add controls | App typecheck, timeline reorder/duplicate browser cases |
| `quizz-editor-context.tsx` / extras loading and stable IDs | Original form/field-array authority; owned extras hook and mutation helpers | App typecheck, mixed-mode and clone/persistence tests |
| `QuestionEditorAnswers.tsx` / per-answer visuals | Original answer form/controller and solution picker; owned visual editing hook/controls | App typecheck, picture answer browser cases |
| `QuestionEditor/index.tsx` / stage-fit warning/background | Original editor field ordering; owned warning/preview components | App typecheck, editor/browser rendering |
| `Answers.tsx`, `Question.tsx`, `Responses.tsx` / decoration/reveal/view adapters | Original transport/answer authority; owned lifecycle/presentation helpers | App typecheck, browser role/answer/reveal matrix |
| `GameWrapper.tsx` / legacy audio/background, host presence | Original shell and role boundaries; owned presenters | Browser parity and audio lifecycle checks |
| `GameSettingsModal/index.tsx` / extension switches | Original form and save transport; owned settings fields | App typecheck, live settings checks |
| `(auth)/manager/index.tsx` / account mode and session check | Route registration; owned account page and preloader | Account/session and browser login tests |
| `services/config.ts` / root discovery | Single tenant-aware getPath hook | Root/account/storage suites |
| `docker/nginx.conf`, `Dockerfile` | One protected extension server include and required workspace/WASM copies | Build, isolated nginx syntax check if installed runtime is available |

The JSON review is a work-in-progress ledger: `reviewed` means semantically
inspected, not that every listed extraction and verification is already closed.

## Owner-directed remote QA continuation

The owner stopped local browser/game QA because it interfered with simultaneous
manual work, then explicitly requested continued tests on the real server in an
isolated test environment. Local Playwright and its servers were stopped. All
subsequent game/browser checks run headlessly on Oracle, in the new disposable
`/home/ubuntu/tadazz-cleanup-theme-20261108-ae0692a` workspace/container, with no
published ports, no production volume, no real provider credentials or customer
fixture, and CPU/memory limits. Production identity/start time is recorded before
and after. SSH uses the existing authorized key; no credentials are changed.

First remote exact snapshot: root tests and all four effective typechecks passed.
Extensions: 571/572; the existing chmod-based I/O failure test is not portable to
Linux atomic rename/root. Replace only its failure injection with a one-shot EIO
at rename commit, then verify both files roll back. No production transaction
behavior changes. pnpm 12 rejects the existing extensions devDependency -> socket
-> extensions cycle. All socket imports from extensions are integration tests,
resolved by existing Vitest/TypeScript aliases. Remove that unnecessary owned
package devDependency and its lockfile link; preserve original recursive build,
then validate frozen install/build/tests on the server. Browser tests were not
started after the failed build; do not count the interrupted local matrix as a
complete pass. Remote image includes Chromium and WebKit installed on ARM64.

Origin's current next-branch pointer 5ea0f47 is an ancestor of the already merged
0079e45; history verification confirms the stale-shell/audio fix is included.
No production restart, Caddy reload, provider call, public tunnel, push or Asana
write is part of this continuation.

### Theme installation continuation — implementation boundary

After completing source review/extractions, finish the previously explicitly
incomplete installer through an owned durable service and authenticated socket
HTTP adapter. Keep it OFF by default; the user authorizes isolated remote staging
and tests, not production activation. Tenant identity and assigned review/publish
grants come exclusively from verified manager claims and server policy. Preserve
independent human review, immutable versions, actual asset-byte validation,
private media, audit, signing and rollback. Uploaded code/archives/SVG remain
rejected. Code-backed registration requires a matching source-controlled trusted
build record, never a caller-supplied hash alone. Production catalog continues to
contain Classic only; independent synthetic themes exist only in test fixtures.

Necessary original hooks before editing: api/index.ts mounts the owned theme
router using existing auth; Game initialization attaches an approved theme from
the tenant store once, and its existing media-reference seam includes that
immutable definition. All runtime/catalog/install code stays in owned modules.
Session snapshot and native ShowThemeRenderer are downstream-owned and can carry
and resolve the approved definition without a second transport or game engine.
No score/timer/telephony mutation is part of theme installation. Verification:
real HTTP two-tenant denial, reviewer assignment and approval, byte/mime/path
attacks, persisted restart, publish/rollback/signature, code-build rejection,
Studio/catalog/native runtime and audio browser cases on the remote server.

### Remote verification and final lifecycle refinements

R2 on Oracle: root352/352, extensions572/572, four effective typechecks and
recursive build passed; browser26/28 (two harness timing/focus failures recorded).
R4 fixed the Chromium join/start race, browser27/28. R6 reran the remaining
WebKit host/player/display case with a separate audience browser: PASS, with
actual pause/resume controls. No source assertion was weakened or forced click
used. The remote-only browser configurations reject accidental local runs.

R7: build and five typechecks passed, extensions passed, skill validator/wrapper
and generated schema passed. The new real-HTTP adversarial case exposed a
connection-reuse problem after an early oversized/unread POST rejection. Signal
Connection: close only on owned theme-router error responses; do not change the
production HTTP server or unrelated upstream routes. Preserve failed logs.

Finish the authoring lifecycle with editable private drafts (CAS revision),
rejection/return from review, and approval bound to the exact inspected revision
and manifest digest. Published/staged artifacts remain immutable. Track all draft
contributors so none can self-approve. This belongs entirely to owned theme
modules. Extend real HTTP and durable tests before claiming completion.

Additional minimal upstream extraction before final closure: games.ts join
identity/name/phone/roster policy moves into owned api/extensions/join-policy.ts.
Retain the original registry lookup, manager exclusion, media authorization and
signed join-ticket issuance in the original REST boundary. Verify duplicate-before-
lock priority, invite-only rejection, roster bypass, generated names and source
metadata. This is pure downstream policy, not a second game authority.

Private-media QA must use the same authentication boundary as nginx. The original
Vite config-directory middleware currently intercepts /media before proxying and
cannot serve tenant/SQLite theme assets. Add an owned private-media proxy policy;
retain original static media serving when accounts are OFF, and use authenticated
backend media routes when accounts are ON. Minimal upstream Vite hooks only;
verify private preview/room assets in real remote browser and preserve legacy QA.
