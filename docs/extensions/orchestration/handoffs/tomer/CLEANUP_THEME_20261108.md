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
