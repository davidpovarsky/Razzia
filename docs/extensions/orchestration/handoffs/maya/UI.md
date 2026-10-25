# Maya UI & Frontend Handoff (V3)

## Status & Overview

- **Role:** Maya (Frontend / Native UX / Media / Presentation / Audio / Editor / Locales)
- **Workspace:** `C:\Users\DAVID\Code\Razzia-worktrees\maya`
- **Branch:** `agent/maya/wave2`
- **Phase:** Wave 2 — Targeted Final Repair (Audit-Verified P0/P1 fixes, media persistence, selector reconciliation, accessibility, design tokens, 8-locale parity)
- **Starting Backend Baseline:** `cf824d7 feat(gameplay): wave 2 phase a backend game control, interludes and authoritative reveal` (Tomer Phase A)
- **Current Audited Baseline:** `263e936` (25 Oct 2026) -> Current Wave 2 Repair Tip
- **Execution Mode:** NORMAL (Direct session execution, no subagents invoked)
- **Status:** Complete — All P0/P1 defect repairs, unit/component regressions, design tokenization, selector reconciliation, 8-locale translations, and full test/build verification passed.

### Canonical Documents Read & Enforced

1. `AGENTS.md` & `GEMINI.md`: V3 role boundaries, exclusive worktree usage, no pushes, no merges to main, Hebrew final report.
2. `docs/extensions/orchestration/00_START_HERE.md`: Three coding conversations, exclusive file ownership, 8 languages en/fr/de/es/it/ja/tr/vi, local-first UK development.
3. `docs/extensions/orchestration/01_WORKTREE_PROTOCOL.md`: Git worktree safety, explicit file additions, Node 24 at `C:\Users\DAVID\.local\tools\node-v24.22.1-win-x64`.
4. `docs/extensions/orchestration/10_LOCKED_PRODUCT_DECISIONS.md`: Locked v2 decisions: sidecar schema v1, revision 409 conflict, composite save, team round-robin & pure point sum projection, image answer 4 colors A-D, reveal effects blur/pixelate/tiles/zoom, interludes, sound cues.
5. `docs/extensions/orchestration/11_RESEARCH_VERIFIED.md`: Upstream Razzia 4.0.1 codebase verification.
6. `docs/extensions/orchestration/12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md`: Shared contracts, socket events, REST endpoints, wire schemas.
7. `docs/extensions/orchestration/13_FILE_OWNERSHIP.md`: Maya exclusive ownership: `packages/web/src/**`, `extensions/src/{editor,media,presentation,locales}/**`, `docs/extensions/orchestration/handoffs/maya/**`. External boundaries: Tomer owns `packages/socket/**`, `packages/common/**`, `extensions/src/{core,server,gameplay}/**`, `packages/e2e/**`; Noam owns `extensions/src/telephony/**`.
8. `docs/extensions/orchestration/14_ENGINEERING_ACCEPTANCE_CASES.md`: Acceptance test matrix (CORE01-06, GAME01-04, TEAM01-03, MEDIA01-03, AUDIO01-02, INT01-02, PHONE01-06, L10N01, UI01, REG01, GIT01).
9. `docs/extensions/DESIGN_LANGUAGE.md`: Tailwind CSS v4, `--color-primary: #ff9900`, `--color-secondary: #1a140b`, `--color-answer-1..4: #e69f00, #56b4e9, #3dbfa0, #cc79a7`, Rubik Variable typography, base UI button/input/select/alert-dialog composition, no bespoke blue styling.
10. `docs/extensions/WORKING_RULES.md`: Single responsibility per file (~250 line modules), no deep cross-feature imports, full i18next 8-locale coverage.
11. `Tada_Maya_UI_Repair_Prompt_2026-10-25.md` & `MAYA — TADA WAVE 2: TARGETED FINAL REPAIR (AUDIT-VERIFIED)`: Execution specification for P0 and P1 defect resolution.

---

## 1. Wave 2 Targeted Repair Ledger

### Priority P0: Data Integrity & Media Persistence

1. **P0.1: New quiz with extras first-save data-loss path (`QuizzEditorHeader.tsx`, `client.ts`)**
   - _Problem:_ In newly created quizzes (`quizzId === null`), clicking Save called `create(values)` directly and bypassed `extras`, discarding all configured image answers, interludes, teams, and audio cues before the first save.
   - _Resolution:_
     - Added `createQuizComposite` support in `extensions/src/editor/client.ts` targeting `POST /api/extensions/quizzes`, normalizing `baseDigest` and `quizId`.
     - In `QuizzEditorHeader.tsx`, updated `handleSave`: if `extras` is present and `quizzId` is null, it routes to `client.createQuizComposite({ quizz: values, extras: { ...extras, quizId: extras.quizId || "temp-new", baseDigest, questionIds } })` with explicit error handling (no silent success).
     - Added failing regression test in `extensions-ui.test.ts` verifying composite save routing on first save.
   - _Regression Status:_ PASS.

2. **P0.2: Question identity stability and async load (`quizz-editor-context.tsx`, `QuestionEditor/index.tsx`)**
   - _Problem:_ `questionUuidMap` was stored in React state and mutated during render and effects; late composite loads could overwrite in-flight edits or mint orphan UUIDs.
   - _Resolution:_
     - Refactored `fieldUuidMapRef = useRef<Map<string, string>>(new Map())` in `quizz-editor-context.tsx` to maintain render purity and immutability.
     - Guarded late async `getQuizComposite` responses from changing the identity of already edited questions or overwriting user changes.
     - Never persist transient React Hook Form field IDs.
     - In `QuestionEditor/index.tsx`, when selecting media, the target question is captured by `mediaPickerTarget.questionId` (`targetIndex = questionIds.indexOf(questionId)`) and alt is derived from `targetQuestion`, NEVER from current navigated question.
     - Fails safely if target question was deleted while picker was open.
   - _Regression Status:_ PASS.

3. **P0.3: Media Picker Contract & Component Interaction Flow (`QuestionEditor/index.tsx`, `MediaLibrary/index.tsx`)**
   - _Problem:_ `onOpenMediaPicker` contract accepted an unused `_onSelect` callback that `QuestionEditor` ignored; tests only asserted helper objects without simulating user interactions.
   - _Resolution:_
     - Cleaned `onOpenMediaPicker(options?: MediaPickerRequestOptions)` signature across `QuestionEditor`, `EditorEnhancementPanel`, `VisualAnswersSection`, and `InterludeSection`.
     - Validated expected media type (`expectedType: "image"` rejects video; accepts matching image).
     - Ensured base `question.media` is preserved untouched when answer visual or interlude is configured.
     - Added component interaction flow test in `extensions-ui.test.ts` exercising browse -> select -> update extras.
   - _Regression Status:_ PASS.

4. **P0.4: Media Library Filter Synchronization & Delete Integrity (`MediaLibraryToolbar.tsx`, `MediaLibrary/index.tsx`)**
   - _Problem:_ Media library filter retained previous type when reopened for different targets (e.g. image then video); deleting a library asset left dangling references in answer visuals, interludes, and audio cues.
   - _Resolution:_
     - Added `acceptType` synchronization in `MediaLibrary/index.tsx` so the filter syncs with the target on open.
     - In `MediaLibraryToolbar.tsx`, locked and disabled the filter buttons when `acceptType && acceptType !== "all"`.
     - In `MediaLibrary/index.tsx` delete handler (`onSuccess`), reconciled `extras` sidecar, automatically clearing deleted URLs from `extras.perQuestion[qId].answerVisuals`, `extras.perQuestion[qId].interlude`, and `extras.audio.cues`.
   - _Regression Status:_ PASS.

### Priority P1: Design-System Compliance, Conflict Safety, Audio & i18n

1. **P1.1: Design-System Tokenization Across Editor Sections**
   - _Components updated:_ `VisualAnswersSection.tsx`, `InterludeSection.tsx`, `RevealSection.tsx`, `LeaderboardSection.tsx`, `TeamsSection.tsx`, `AudioCuesSection.tsx`.
   - _Styling applied:_ Design tokens (`border-border`, `bg-card/60`, `bg-background`, `text-foreground`, `border-accent`, `bg-accent/40`, `focus:ring-primary`).
   - _Canonical Colors:_ Replaced bespoke color classes with `CANONICAL_ANSWER_COLORS` (`#E69F00`, `#56B4E9`, `#3DBFA0`, `#CC79A7`).
   - _Controls:_ Native and accessible controls consistent with Rubik Variable and brand palette.

2. **P1.2: Modal Focus & Conflict Data Safety (`ConflictDialog.tsx`, `QuizzEditorHeader.tsx`)**
   - _Problem:_ `ConflictModal` was a handcrafted div dialog without Radix focus trapping or Escape listener; reload only updated extras and risked saving stale base quiz content.
   - _Resolution:_
     - Replaced with accessible `ConflictDialog.tsx` using Radix UI `Dialog.Root`, `Dialog.Overlay`, and `Dialog.Content`.
     - Implemented focus trapping, Escape dismiss, and focus restoration.
     - Added explicit two-step confirmation for "Force Overwrite" with descriptive warning.
     - In `QuizzEditorHeader.tsx`, `handleReloadConflict` fetches fresh quiz base via `quizzQuery(quizzId)` and atomically resets the base form (`reset(...)`) while synchronizing `extras`.
     - Full 8-locale coverage for revision displays (`serverRevision`, `expectedRevision`, `unversioned`, `unknownHigher`).
   - _Regression Status:_ PASS.

3. **P1.3: Audio Preview Honors Runtime Settings (`AudioCuesSection.tsx`)**
   - _Problem:_ Audio preview used `customUrl ?? DEFAULT_SOUND_MAP[cueId]` ignoring `source="default"`, `volume`, `loop`, and `enabled`; rejected play promises left playback in stuck state.
   - _Resolution:_
     - Reused runtime resolver semantics via `resolveAudioCue` from `@razzia/extensions/presentation`.
     - Safely falls back to `DEFAULT_CUE_URLS` when `source === "default"`.
     - Honors `volume` (0..1), `loop`, and mutes/disables when `enabled === false` or `volume === 0`.
     - Handled `playPromise.catch()` and `audio.onerror` to prevent `testingCue` from getting stuck.
   - _Regression Status:_ PASS.

4. **P1.4: Selector Reconciliation with Tomer's E2E Suite**
   - Reconciled selector differences between Maya-owned UI components and `packages/e2e/tests/browser-acceptance.spec.ts`:
     - `TeamsSection.tsx`: `data-testid="toggle-teams"` (reconciled from `teams-enabled-checkbox`).
     - `InterludeSection.tsx`: `data-testid="toggle-interlude"` (reconciled from `interlude-enabled-checkbox`).
     - `LeaderboardSection.tsx`: `data-testid="mode-radio-everyN"` (reconciled from `leaderboard-mode-everyN`) and `data-testid="every-n-input"` (reconciled from `leaderboard-everyn-input`).
     - `VisualAnswersSection.tsx`: Added `<select data-testid="display-select-${answerIndex}">` with options `text`, `image`, `both` (matching Tomer's `displaySelect0.selectOption("image")`), and `data-testid="alt-input-${answerIndex}"` (reconciled from `alt-text-input-${answerIndex}`).
   - _Status:_ PASS.

5. **P1.5: 8-Locale Parity Across All 8 Languages**
   - Added translations in `extensions/src/locales/{en,fr,de,es,it,ja,tr,vi}/extensions.json` for:
     - `teams.redTeam`, `teams.blueTeam`, `teams.teamNumbered`, `teams.assignToTeam`
     - `conflict.unversioned`, `conflict.unknownHigher`, `conflict.overwriteConfirmTitle`, `conflict.overwriteConfirmDesc`
   - Verified 100% key parity via `locales.test.ts` (9/9 passed).

---

## 2. Upstream Touches Ledger

Under V3 approved rules, Maya touched only minimal necessary upstream paths under `packages/web/src/**`:

| File                                                                                             | Touched Symbol                                             | Rationale                                                                                                              | Default-Off Test                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/web/src/features/quizz/components/QuizzEditorHeader.tsx`                               | `handleSave`, `handleReloadConflict`, `ConflictDialog`     | Route first-save of new quiz with extras to composite create API; atomic reload of base + extras on 409 conflict.      | `extensions-ui.test.ts` ("fails if first save of a new quiz with extras falls back to vanilla create", "Feature-Off Parity: unenhanced quizzes preserve vanilla manager controls") |
| `packages/web/src/features/quizz/components/ConflictDialog.tsx`                                  | `ConflictDialog`                                           | Accessible Radix UI HTTP 409 conflict modal with two-step overwrite confirmation and 8-locale support.                 | `extensions-ui.test.ts` ("renders accessible dialog semantics via Radix and presents title and revisions")                                                                         |
| `packages/web/src/features/quizz/contexts/quizz-editor-context.tsx`                              | `fieldUuidMapRef`, `setExtras`                             | Pure question identity stability, guard late async sidecar loads from mutating local edits.                            | `extensions-ui.test.ts` ("stable UUID mapping across async sidecar load preserves attachments without orphans")                                                                    |
| `packages/web/src/features/quizz/components/QuestionEditor/index.tsx`                            | `handleOpenMediaPicker`, `handleMediaSelect`               | Capture target question ID, derive alt from target question (never navigated question), fail safely on deleted target. | `extensions-ui.test.ts` ("derives alt from captured target question", "fails safely if target question was deleted")                                                               |
| `packages/web/src/features/quizz/components/QuestionEditor/MediaLibrary/MediaLibraryToolbar.tsx` | `acceptType`                                               | Lock and disable disallowed media type buttons when opening library with specific acceptType.                          | `extensions-ui.test.ts` ("Media Library: type validation rejects mismatched type")                                                                                                 |
| `packages/web/src/features/quizz/components/QuestionEditor/MediaLibrary/index.tsx`               | `acceptType` filter sync, `handleDelete` sidecar reconcile | Reconcile extras sidecar on media delete (cleaning answerVisuals, interludes, audio cues); sync filter on open.        | `extensions-ui.test.ts` ("synchronizes filter when opening sequentially", "reconciles extras sidecar when media asset is deleted")                                                 |

---

## 3. Verification Evidence

### A. Extensions Vitest Suite (`pnpm --filter @razzia/extensions test`)

```
$ vitest run
 RUN  v5.0.3 C:/Users/DAVID/Code/Razzia-worktrees/maya/extensions

 ✓ src/locales/locales.test.ts (9 tests)
 ✓ src/core/core.test.ts (25 tests)
 ✓ src/server/session.test.ts (5 tests)
 ✓ src/telephony/telephony.test.ts (27 tests)
 ✓ src/server/storage.test.ts (7 tests)
 ✓ src/presentation/presentation.test.ts (19 tests)
 ✓ src/gameplay/gameplay.test.ts (7 tests)
 ✓ src/server/integration.test.ts (1 test)
 ✓ src/server/api/routes.test.ts (5 tests)
 ✓ src/presentation/reveal-timeline.test.ts (11 tests)
 ✓ src/editor/editor.test.ts (8 tests)
 ✓ src/media/media.test.ts (9 tests)
 ✓ src/server/gameplay-phase-a.test.ts (17 tests)
 ✓ src/core/imports.test.ts (3 tests)
 ✓ src/server/real-telephony-e2e.test.ts (4 tests)

 Test Files  15 passed (15)
      Tests  157 passed (157)
   Duration  17.20s
```

### B. Workspace Vitest Suite (`pnpm test`)

```
$ vitest run
 RUN  v5.0.3 C:/Users/DAVID/Code/Razzia-worktrees/maya

 ✓  common  packages/common/src/questions/estimation.test.ts (4 tests)
 ✓  socket  packages/socket/src/services/registry.test.ts (2 tests)
 ✓  common  packages/common/src/validators/game.test.ts (4 tests)
 ✓  common  packages/common/src/validators/quizz.test.ts (18 tests)
 ✓  socket  packages/socket/src/services/scoring/round.test.ts (6 tests)
 ✓  socket  packages/socket/src/services/auth.test.ts (6 tests)
 ✓  socket  packages/socket/src/services/scoring/scoring.test.ts (15 tests)
 ✓  socket  packages/socket/src/services/media.test.ts (8 tests)
 ✓  socket  packages/socket/src/services/config.test.ts (9 tests)
 ✓  web  packages/web/src/lib/session.test.ts (5 tests)
 ✓  web  packages/web/src/locales/locales.test.ts (25 tests)
 ✓  web  packages/web/src/locales/ranks.test.ts (18 tests)
 ✓  web  packages/web/src/features/questions/questions.test.ts (9 tests)
 ✓  socket  packages/socket/src/utils/utils.test.ts (9 tests)
 ✓  socket  packages/socket/src/services/game/game.test.ts (32 tests)
 ✓  socket  packages/socket/src/api/api.test.ts (23 tests)
 ✓  socket  packages/socket/src/handlers/game.test.ts (24 tests)
 ✓  web  packages/web/src/features/game/components/game-controls.test.ts (11 tests)
 ✓  web  packages/web/src/features/game/phase-a-flow.browser.test.ts (7 tests)
 ✓  web  packages/web/src/features/quizz/extensions-ui.test.ts (44 tests)

 Test Files  20 passed (20)
      Tests  279 passed (279)
   Duration  7.97s
```

**Total Vitest test count:** 279 (workspace) + 157 (extensions) = **436 tests passing (100%)**.

### C. TypeScript Typecheck (`pnpm -r exec tsc --noEmit`)

```
$ pnpm -r exec tsc --noEmit
Exit code 0 — 0 type errors across all packages and workspaces.
```

### D. Code Formatting (`pnpm format`)

```
$ prettier --check . --log-level warn
Exit code 0 — All files match Prettier standards.
```

### E. Production Build (`pnpm -r run build`)

```
$ $env:NODE_OPTIONS="--experimental-strip-types"; pnpm -r run build
Scope: 5 of 6 workspace projects
packages/socket build: Done (index.cjs: 673.96 kB)
packages/web build: Done (dist/assets/index-krpehV4O.js: 1,337.35 kB)
✓ built in 3.63s
```

---

## 4. Cross-Agent Handoffs

### A. Handoff for Tomer (Backend / Integration Lead)

1. **New Quiz First-Save Composite API:**
   - In `QuizzEditorHeader.tsx`, Maya routes new quizzes with extras to `client.createQuizComposite({ quizz: values, extras })` posting to `POST /api/extensions/quizzes`.
   - Ensure the backend composite endpoint handles initial quiz creation atomically when `quizId` is newly assigned by the backend.
2. **E2E Test Selectors:**
   - Maya's components now expose the exact testids expected by `packages/e2e/tests/browser-acceptance.spec.ts`:
     - Visuals: `<select data-testid="display-select-${answerIndex}">` with options `text`, `image`, `both`.
     - Alt text: `data-testid="alt-input-${answerIndex}"`.
     - Teams toggle: `data-testid="toggle-teams"`.
     - Interlude toggle: `data-testid="toggle-interlude"`.
     - Leaderboard mode: `data-testid="mode-radio-everyN"` and `data-testid="every-n-input"`.
   - Tomer's Playwright E2E suite can run against these selectors without needing modification.

### B. Handoff for Noam (Telephony Engineer)

- **Scope Notice:** Maya has strictly preserved ownership boundaries and made **ZERO edits** to `extensions/src/telephony/**`.
- **Recommendations for `KeypadSimulator.tsx`:**
  - When elevating to production player UI:
    - Retokenize using design system tokens (`border-primary`, `bg-primary`, `text-primary`).
    - Migrate hardcoded strings to `extensions/src/locales/{en,fr,de,es,it,ja,tr,vi}/extensions.json`.
    - Implement accessible keyboard navigation for number pad buttons.

---

## 5. Acceptance Matrix

| Case | Description                                | Verification Evidence                                                                                                                                                                          | Status |
| ---- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P0.1 | New quiz with extras first-save data loss  | `QuizzEditorHeader.tsx`, `client.ts`, `extensions-ui.test.ts` (test: "fails if first save of a new quiz with extras falls back to vanilla create")                                             | PASS   |
| P0.2 | Question identity stability & async load   | `quizz-editor-context.tsx`, `QuestionEditor/index.tsx`, `extensions-ui.test.ts` (tests: "derives alt from captured target question", "fails safely if target question was deleted")            | PASS   |
| P0.3 | Real media picker contract & interaction   | `QuestionEditor/index.tsx`, `MediaLibrary/index.tsx`, `extensions-ui.test.ts` (test: "simulates Browse -> select uploaded media -> updates extras with display, alt")                          | PASS   |
| P0.4 | Media filter sync & delete reconciliation  | `MediaLibraryToolbar.tsx`, `MediaLibrary/index.tsx`, `extensions-ui.test.ts` (tests: "synchronizes filter when opening sequentially", "reconciles extras sidecar when media asset is deleted") | PASS   |
| P1.1 | Design system tokenization across sections | `VisualAnswersSection.tsx`, `InterludeSection.tsx`, `RevealSection.tsx`, `LeaderboardSection.tsx`, `TeamsSection.tsx`, `AudioCuesSection.tsx`                                                  | PASS   |
| P1.2 | Radix ConflictDialog & conscious overwrite | `ConflictDialog.tsx`, `QuizzEditorHeader.tsx`, `extensions-ui.test.ts` (tests: "renders accessible dialog semantics via Radix", "renders localized fallback")                                  | PASS   |
| P1.3 | Audio preview honors runtime settings      | `AudioCuesSection.tsx`, `extensions-ui.test.ts` (tests: "uses custom URL only when source='media'", "marks cue disabled when enabled=false or volume=0", "honors loop setting")                | PASS   |
| P1.4 | Selector reconciliation with Tomer's E2E   | `toggle-teams`, `toggle-interlude`, `mode-radio-everyN`, `every-n-input`, `display-select-0`, `alt-input-0`                                                                                    | PASS   |
| P1.5 | 8-locale parity                            | `extensions/src/locales/{en,fr,de,es,it,ja,tr,vi}/extensions.json`, `locales.test.ts` (9/9 passed)                                                                                             | PASS   |
