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
