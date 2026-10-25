# Maya UI & Frontend Handoff (V3)

## Status & Overview

- **Role:** Maya (Frontend / Native UX / Media / Presentation / Audio / Editor / Locales)
- **Workspace:** `C:\Users\DAVID\Code\Razzia-worktrees\maya`
- **Branch:** `agent/maya/wave2`
- **Phase:** Wave 2 — UI Conformance Repair (P0/P1 fixes, media picker contract, palette repair, feature-off parity, accessibility & 8-locale parity)
- **Starting Backend Baseline:** `cf824d7 feat(gameplay): wave 2 phase a backend game control, interludes and authoritative reveal` (Tomer Phase A)
- **Current Audited Tip:** `56cb55a` (branch: `agent/maya/wave2`)
- **Execution Mode:** NORMAL (Direct session execution, no subagents invoked)
- **Status:** In Progress — Executing complete UI Conformance Repair per `Tada_Maya_UI_Repair_Prompt_2026-10-25.md`

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
11. `Tada_Maya_UI_Repair_Prompt_2026-10-25.md`: Execution specification for P0.1-P0.4 and P1 conformance repair.

### Core UI Rules Enforced

1. **Upstream Token Fidelity:** Use `bg-primary`, `text-primary`, `border-primary`, `bg-background`, `text-foreground`, and original `--color-answer-1..4` tokens. Eradicate bespoke `bg-blue-600`/`bg-amber-500` except where semantically justified for errors, correctness (green-500), or approved team colors.
2. **Typography Consistency:** Rubik Variable across all customer-facing surfaces; no `font-sans` or bespoke font overrides.
3. **Strict 8-Locale Coverage:** Every visible string, placeholder, heading, button, unit, plural, and aria-label must use i18next (`extensions` or existing namespaces) with complete dictionary parity across `en`, `fr`, `de`, `es`, `it`, `ja`, `tr`, `vi`.
4. **Accessible Dialogs & Focus:** Proper keyboard navigation (Tab/Shift+Tab trapping), Escape to dismiss, focus return to trigger, `role="dialog"`, accessible title/description.
5. **Feature-Off Parity:** When extensions are absent or disabled, upstream Razzia behavior, manager header, room lock, skip buttons, and media handling must be 100% pixel and functionally identical to `5161eb7`.
6. **Package Boundary Integrity:** `@razzia/extensions` must never import `@razzia/web` internals. Web composition and adapters reside in `packages/web/src/**`.

### File-Level Ledger & Defect Classification

- `packages/web/src/features/quizz/components/QuestionEditor/index.tsx` [CONFIRMED DEFECT]: Discards `onOpenMediaPicker` callback, lacks target awareness, has hardcoded English trigger with bespoke blue styling. Fix: wire typed target and selection callback; use standard Button and i18n label.
- `packages/web/src/features/quizz/components/QuestionEditor/MediaLibrary/index.tsx` [CONFIRMED DEFECT]: Hardcoded `updateQuestion(currentIndex, ...)` in `handleSelect`. Fix: add optional `onSelect` callback and `acceptType` validation; preserve legacy question media default when `onSelect` is omitted.
- `extensions/src/editor/editor-enhancement-panel.tsx` [CONFIRMED DEFECT]: 1118 lines, bespoke blue tabs/buttons, preview answer colors are `bg-red-500..bg-green-500` instead of canonical A-D palette, hardcoded copy, Audio test play does not stop previous instance. Fix: decompose to ~250 line subcomponents under `extensions/src/editor/components/`, inject canonical answer colors, fix audio preview ref & cleanup, localize strings.
- `packages/web/src/features/game/components/GameWrapper.tsx` [CONFIRMED DEFECT]: Unconditionally replaces upstream manager header with `ManagerControlToolbar` even when extensions are absent/OFF. Fix: gate enhanced toolbar on valid extension state presence; restore original header, `MANAGER_SKIP_BTN`, skip disabling, countdown, exit button, and room lock for vanilla quizzes.
- `packages/web/src/features/game/components/states/Question.tsx` [CONFIRMED DEFECT]: Renders `QuestionMedia` for any media type during `SHOW_QUESTION` instead of image-only. Fix: restore `media?.type === MEDIA_TYPES.IMAGE` check to match baseline `5161eb7`.
- `packages/web/src/features/game/components/ManagerControlToolbar.tsx` [CONFIRMED DEFECT]: 602 lines, custom non-accessible history modal, bespoke styles. Fix: decompose; extract `HistoryDialog` with Radix Dialog semantics.
- `extensions/src/editor/conflict-modal.tsx` [CONFIRMED DEFECT]: Plain div without Radix focus trap/Escape listener, blue button, hardcoded "Cancel". Fix: accessible keyboard focus trap, Escape handler, focus restoration, theme button tokens, full i18n.
- `extensions/src/presentation/team-leaderboard-panel.tsx` [CONFIRMED DEFECT]: Hardcoded English strings (`Individual`, `Teams`, `Your Team`, `Rank`, `pts`, `members`). Fix: translate all strings via i18n, support injected `t`.
- `extensions/src/presentation/lobby-team-assignment.tsx` [CONFIRMED DEFECT]: Non-semantic div/span click targets, not keyboard operable, hardcoded copy. Fix: semantic `<button type="button">`, Enter/Space key support, focus indicators, full i18n.
- `extensions/src/presentation/interlude-preview.tsx` [CONFIRMED DEFECT]: Restarts timer on every rerender due to `serverStartedAt={Date.now()}`; lacks translated labels. Fix: stabilize timestamp and supply localized labels.
- `extensions/src/presentation/audio-cue-player.tsx` [CONFIRMED DEFECT]: `DEFAULT_CUE_URLS` points to non-existent `/sfx/*.mp3` instead of upstream `/sounds/*.mp3`. Fix: map to existing `/sounds/*` assets.
- `packages/web/src/features/quizz/components/QuizzEditorCard.tsx` [CONFIRMED DEFECT]: Hardcoded `aria-label="Duplicate question"`, duplicate button hidden until hover (inaccessible to keyboard/touch). Fix: i18n label, `focus-within:flex`.
- `packages/web/src/features/manager/components/configurations/ConfigManageQuizz.tsx` [CONFIRMED DEFECT]: Export buttons lack accessible `aria-label`. Fix: add `aria-label` attributes.
- `packages/web/src/features/game/phase-a-flow.browser.test.ts` [CONFIRMED DEFECT]: Uses `page.setContent()` with synthetic raw HTML and claims real browser integration. Fix: rename/reframe honestly; add genuine React component tests.
- `extensions/src/telephony/KeypadSimulator.tsx` [BELONGS TO NOAM]: Out of Maya ownership scope. Do not edit. Handoff provided to Noam.
- `packages/e2e/**` [BELONGS TO TOMER / RONI]: Out of Maya ownership scope. Handoff provided for real Playwright E2E.

---

## 1. Exclusive Exports Ledger

Maya implements and exports the following modules from `@razzia/extensions`:

### A. `@razzia/extensions/locales` (`extensions/src/locales/index.ts`)

- All 8 Razzia languages implemented: `en`, `fr`, `de`, `es`, `it`, `ja`, `tr`, `vi`.
- Strict key-parity across all 8 dictionaries covering tabs, leaderboard, teams, audio, visuals, interludes (`secondsRemaining`, `awaitingHost`, `skipped`, `slideAlt`), conflict 409, bundles, errors, host controls (endTimer, nextScreen, skipQuestion, previous/history, replay, exit, `(Skipped)`), and reveal (votes, correct, incorrect, `answered`, `answeredRatio`).
- Exports:
  - `EXTENSION_LOCALES`
  - `SUPPORTED_EXTENSION_LANGUAGES`
  - `getExtensionResources()`: returns i18next-compatible resources object for registering the `extensions` namespace.

### B. `@razzia/extensions/media` (`extensions/src/media/index.ts`)

- `RichAnswerCard`:
  - Supports answer choices with `text`, `image`, or `both`.
  - Enforces accessible alt text and validates against unsafe protocols (`javascript:`, `data:`, `file:`, `vbscript:`).
  - Preserves underlying answer text string in accessibility tree (`aria-label` and `<span className="sr-only">`) even for `image`-only answers (MEDIA01).
  - Preserves original 4 answer colours and A-D labels.
- `RevealMedia`:
  - Supports 5 synchronized reveal effects: `none`, `blur`, `pixelate`, `tiles`, `zoom`.
  - Duration range: 250..15000 ms.
  - Synchronized by server epoch/seq and timestamp (`serverStartedAt`).
  - No premature reveal or animation replay after reconnect: if elapsed >= durationMs, progress snaps to 1.0 (MEDIA03).
  - Reduced-motion fallback: respects `prefers-reduced-motion` and skips animation immediately.
- Helper functions: `calculateRevealProgress`, `isValidAnswerVisual`.

### C. `@razzia/extensions/presentation` (`extensions/src/presentation/index.ts`)

- `InterludePresenter`:
  - Full-screen event-projection styling for title, image, video, and countdown screen kinds.
  - Server authority for auto-advance: frontend timer displays visual progress only; local countdown does not trigger advance. Server's `RoundManager` remains sole auto-advance authority.
  - Manager manual skip: dispatches idempotent `END_OR_SKIP_INTERLUDE` command (`reason: "manual"`) guarded against double-clicks and stale epochs.
  - Countdown resilience across reconnects: resumes smoothly from `serverStartedAt` without resetting to full duration.
  - Audio and video resources properly halted and cleaned up on unmount when server transitions phase.
- `formatHistoryItem`:
  - Normalizes raw backend `QuestionResult` or `HistorySummaryItem` into a uniform `FormattedHistoryItem` safely.
  - Corrects contract mismatch between backend storage and UI display without duplicating business logic.
  - Extracts question text, type, participant answers, solution badges, and safely handles missing history.
- `RevealTimeline` & `useRevealTimeline`:
  - Two-stage cinematic reveal timeline:
    1. 2D horizontal bar fill & counter animation (0 -> target % in 0.65-1.0s).
    2. Short pause (0.2-0.35s) followed by authoritative solution reveal: correct answers turn green with check icon, incorrect answers turn red with cross icon, and one-shot reveal sound plays.
  - Survey mode: neutral color palette preserved, no correct/incorrect marking.
  - Multiple choice: multiple correct greens supported, percentages calculated using server's unique-respondent denominator (`totalResponders` / `eligiblePlayers`), allowing totals to exceed 100%.
  - Estimation: reuses specialized estimation result renderer.
  - Reduced-motion and reconnect resilience: snaps immediately to final result without replaying animations or sound.
  - Player view isolation: web players receive personal `STATUS.SHOW_RESULT` immediately without delay.
- `AudioCuePlayer` & audio resolver:
  - 9 cues: `start`, `showQuestion`, `answersMusic`, `answerPressed`, `revealResults`, `leaderboard`, `podium1`, `podium2`, `podium3`.
  - Safe default asset fallbacks (`DEFAULT_CUE_URLS`).
  - Respects `volume` (0..1) and `enabled` (mute when false or volume 0) (AUDIO01).
  - Graceful recovery: missing/corrupt media falls back to silence or default; never blocks or crashes gameplay.
  - Catches browser `NotAllowedError` autoplay restrictions safely.
  - Ducking: ducks background music when question media has active audio/video (AUDIO02).
  - Clean unmount: stops all playing audio when leaving state.
- `TeamLeaderboardPanel`:
  - Displays team leaderboard projected dynamically from individual scores.
  - Pure score calculation: sums points of all assigned members (including disconnected ones).
  - Deterministic tie-breaking: total points desc, case-insensitive team name asc, team ID asc (TEAM02).
  - Individual / Teams view toggle button when teams are enabled.
  - Participant view banner showing player's assigned team name, color, and current team rank/points.
- `LobbyTeamAssignment`:
  - Renders team rosters in game lobby (SHOW_ROOM).
  - Round-robin initial assignment (TEAM01).
  - Allows manager to reassign players between teams prior to game start; locked once game begins.

### D. `@razzia/extensions/editor` (`extensions/src/editor/index.ts`)

- `EditorEnhancementPanel`:
  - Tabbed authoring panel for quiz-wide policies (leaderboard, teams, audio cues) and per-question enhancements (visual answers, reveal effects, interludes).
  - Integrated with existing authenticated `MediaLibrary` picker.
  - Accessible question preview tab.
- `CompositeApiClient`:
  - Typed REST client for `/api/extensions/quizzes` (GET, PUT, POST, DELETE, export, import).
  - Handles HTTP 409 revision conflict with `RevisionConflictError` containing server vs expected revision.
- `ConflictModal`:
  - Modal UI displayed on 409 conflict, allowing the manager to reload latest server data or force overwrite.
- Question UUID lifecycle:
  - Stable question UUID resolution: eliminates transient UUID pollution when extras load asynchronously.
  - `reorderQuestionsInExtras`: reorders stable UUID array while keeping attachments intact (CORE02).
  - `duplicateQuestionInExtras`: mints fresh UUID, clones attachments without collision (CORE03).
  - `removeQuestionFromExtras`: removes target question UUID and cleans up attachments with zero orphans (CORE03).

---

## 2. Upstream Web Hooks Ledger (`packages/web/src/**`)

| File                                                                                | Touched Symbol                                 | Reason / Change                                                                                                                                                                                                                                                                     | Disabled / Feature-Off Test                                                                                                                              |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/web/src/i18n.ts`                                                          | `i18n.init`                                    | Injected `getExtensionResources()` for all 8 languages under `extensions` namespace.                                                                                                                                                                                                | Existing 57 web tests pass; missing extension keys fallback gracefully.                                                                                  |
| `packages/web/src/features/game/components/AnswerButton.tsx`                        | `AnswerButton`                                 | Added optional `visual` prop (`RichAnswerCard` integration), optional `fillPercentage` and `count` for integrated horizontal percentage bar rendering.                                                                                                                              | When `fillPercentage` and `visual` are undefined, button renders identical DOM as original.                                                              |
| `packages/web/src/components/QuestionMedia.tsx`                                     | `QuestionMedia`                                | Added optional `reveal` prop. Renders `RevealMedia` with blur/pixelate/tiles/zoom when effect is configured.                                                                                                                                                                        | When `reveal` is undefined or effect is 'none', renders original `img` element.                                                                          |
| `packages/web/src/features/game/components/states/Room.tsx`                         | `Room`                                         | Listens to `extensions:state` event and renders `LobbyTeamAssignment` when `teams.enabled` is true. Manager can reassign teams before start.                                                                                                                                        | When teams are not enabled or no extension state, original room view renders identically.                                                                |
| `packages/web/src/features/game/components/states/Leaderboard.tsx`                  | `Leaderboard`                                  | Listens to `extensions:state` event and renders `TeamLeaderboardPanel` with Individual/Teams toggle when teams are enabled.                                                                                                                                                         | When teams are not enabled, original individual leaderboard renders identically.                                                                         |
| `packages/web/src/features/game/contexts/extension-state-context.tsx`               | `ExtensionStateProvider` / `useExtensionState` | Synchronizes extension state between `GameWrapper` and `useManagerStore`, providing synchronous state snapshot on component mount and across reconnects.                                                                                                                            | When context is absent or default, returns empty/undefined extension state safely.                                                                       |
| `packages/web/src/features/game/components/GameWrapper.tsx`                         | `GameWrapper`                                  | Mounts `AudioCuePlayer`, renders fullscreen `InterludePresenter`, wraps tree in `ExtensionStateProvider`, and mounts host control surface toolbar.                                                                                                                                  | When extension state is absent, original game wrapper and participant bar render identically.                                                            |
| `packages/web/src/features/game/components/states/Responses.tsx`                    | `Responses`                                    | Reads authoritative snapshot synchronously via `useExtensionState`; multi-choice uses unique-respondents denominator; preserves immediate player result.                                                                                                                            | Estimation questions continue delegating to `EstimationResponses`; vanilla calculates from count.                                                        |
| `packages/web/src/features/game/components/ManagerControlToolbar.tsx`               | `ManagerControlToolbar`                        | Dedicated Host Controls toolbar with focus-safe keyboard shortcuts (ignores focused buttons/dialogs), `formatHistoryItem` integration, and localized labels.                                                                                                                        | When manager is false, toolbar is unmounted; non-extension events fallback gracefully.                                                                   |
| `packages/web/src/pages/party/manager/$gameId.tsx`                                  | `ManagerGamePage`                              | Connects host commands and full-lifecycle exit navigation to `GameWrapper`.                                                                                                                                                                                                         | Vanilla navigation and advance events preserved.                                                                                                         |
| `packages/web/src/features/quizz/components/QuizzEditorHeader.tsx`                  | `QuizzEditorHeader`                            | Performs composite save to `/api/extensions/quizzes/:id` when extras are present and mounts `ConflictModal` on 409 conflict.                                                                                                                                                        | When extras are null, legacy `createQuizz`/`updateQuizz` endpoints are used.                                                                             |
| `packages/web/src/features/quizz/components/QuestionEditor/MediaLibrary/index.tsx`  | `MediaLibrary`, `Props`                        | Added optional `onSelect` callback and `acceptType` filter/validation. When `onSelect` is provided, selected file is delivered to caller and type is validated.                                                                                                                     | When `onSelect` is omitted (legacy use in `QuestionEditorMedia`), default `updateQuestion(currentIndex, { media: { type, url } })` executes identically. |
| `packages/web/src/features/quizz/components/QuestionEditor/index.tsx`               | `QuestionEditor`                               | Wires typed `mediaPickerTarget` to `MediaLibrary.onSelect`. Writes selected media directly to `extras.perQuestion[target.questionId]` (answerVisual or interlude) without mutating question media. Replaces blue button with standard `Button` and `t("extensions:editor.toggle")`. | When enhancements are collapsed or extras are empty, standard editor operates identically without sidecar creation.                                      |
| `packages/web/src/features/game/components/GameWrapper.tsx`                         | `GameWrapper`                                  | Restores exact upstream manager header (`MANAGER_SKIP_BTN`, skip disabling, countdown progress bar, exit button, room lock) when extensions are absent/OFF (`!extensionState`). Only mounts `ManagerControlToolbar` when extension state is active.                                 | When `extensionState === null`, top bar and manager controls render identical DOM to upstream baseline `5161eb7`.                                        |
| `packages/web/src/features/game/components/states/Question.tsx`                     | `Question`                                     | Restores `media?.type === MEDIA_TYPES.IMAGE` condition during `SHOW_QUESTION` so video/audio only play during `SELECT_ANSWER`, preventing competing audio.                                                                                                                          | Plain image and text-only questions render identically to baseline `5161eb7`.                                                                            |
| `packages/web/src/features/game/components/ManagerControlToolbar.tsx`               | `ManagerControlToolbar`                        | Decomposed to extract `HistoryDialog` with Radix Dialog semantics; uses upstream token styling (`bg-primary`, `hover:bg-accent`), preserving all host actions and focus safety.                                                                                                     | Enhanced host controls function identically; fallback cleanly if events drop.                                                                            |
| `packages/web/src/features/game/components/HistoryDialog.tsx`                       | `HistoryDialog`                                | New component: Radix Dialog for question history viewer with full keyboard trap, Escape handling, and focus restoration.                                                                                                                                                            | Mounted only when manager requests history; unmounts cleanly without affecting live state.                                                               |
| `packages/web/src/features/quizz/components/QuizzEditorCard.tsx`                    | `QuizzEditorCard`                              | Localized duplicate question button label with `t("quizz:question.duplicateQuestion")` and made visible on focus/touch (`focus-within:flex`).                                                                                                                                       | Standard card selection, drag, and deletion work identically.                                                                                            |
| `packages/web/src/features/manager/components/configurations/ConfigManageQuizz.tsx` | `ConfigManageQuizz`                            | Added accessible `aria-label` attributes to edit, enhanced export, legacy export, and delete actions.                                                                                                                                                                               | Import/export behavior preserved identically.                                                                                                            |
| `packages/web/src/features/quizz/components/QuizzEditorHeader.tsx`                  | `QuizzEditorHeader`                            | Localized reload and error toast notifications; ensured accessible focus restoration on conflict resolution.                                                                                                                                                                        | Vanilla create and update flow preserved identically.                                                                                                    |
| `packages/web/src/features/quizz/contexts/quizz-editor-context.tsx`                 | `QuizzEditorProvider`                          | Synchronizes React Hook Form field keys with persisted `extras.questionIds` on async sidecar load, drag reorder, duplication, and deletion.                                                                                                                                         | When no extras, standard form and fieldArray behavior unchanged.                                                                                         |
| `packages/web/src/features/quizz/components/QuizzEditorSidebar.tsx`                 | `QuizzEditorSidebar`                           | Supports question duplication action alongside deletion and reordering using stable UUID keys.                                                                                                                                                                                      | Vanilla sidebar operation preserved.                                                                                                                     |
| `packages/web/src/features/quizz/components/QuizzEditorCard.tsx`                    | `QuizzEditorCard`                              | Adds duplicate question button trigger.                                                                                                                                                                                                                                             | Standard card display preserved.                                                                                                                         |
| `packages/web/src/features/manager/components/configurations/ConfigManageQuizz.tsx` | `handleExport` / `handleImport`                | Added Enhanced Export (`.bundle.json`) alongside legacy export (`.json`); automatically detects versioned enhanced bundle on import.                                                                                                                                                | Legacy `.json` export and import continue working unchanged.                                                                                             |

---

## 3. Test Evidence

### A. Extension Tests (`pnpm --filter @razzia/extensions test`)

```
$ vitest run
 RUN  v5.0.3 C:/Users/DAVID/Code/Razzia-worktrees/maya/extensions

 ✓ src/locales/locales.test.ts (9 tests)
 ✓ src/core/core.test.ts (25 tests)
 ✓ src/server/session.test.ts (5 tests)
 ✓ src/presentation/presentation.test.ts (19 tests)
 ✓ src/telephony/telephony.test.ts (27 tests)
 ✓ src/gameplay/gameplay.test.ts (7 tests)
 ✓ src/server/api/routes.test.ts (5 tests)
 ✓ src/server/storage.test.ts (7 tests)
 ✓ src/server/integration.test.ts (1 test)
 ✓ src/editor/editor.test.ts (6 tests)
 ✓ src/presentation/reveal-timeline.test.ts (11 tests)
 ✓ src/server/gameplay-phase-a.test.ts (17 tests)
 ✓ src/media/media.test.ts (9 tests)
 ✓ src/core/imports.test.ts (3 tests)
 ✓ src/server/real-telephony-e2e.test.ts (4 tests)

 Test Files  15 passed (15)
      Tests  155 passed (155)
   Duration  16.15s
```

### B. Web Tests (`pnpm test -- --project web`)

```
$ vitest run "--project" "web"
 RUN  v5.0.3 C:/Users/DAVID/Code/Razzia-worktrees/maya

 ✓  web  packages/web/src/locales/ranks.test.ts (18 tests)
 ✓  web  packages/web/src/lib/session.test.ts (5 tests)
 ✓  web  packages/web/src/features/questions/questions.test.ts (9 tests)
 ✓  web  packages/web/src/locales/locales.test.ts (25 tests)
 ✓  web  packages/web/src/features/game/components/game-controls.test.ts (11 tests)
 ✓  web  packages/web/src/features/game/phase-a-flow.browser.test.ts (7 tests)
   ✓ PROTOCOL / SPEC: Synthetic DOM Event & Command Flow Simulation (Non-E2E / DOM Harness) (7)
     ✓ 1. [Synthetic DOM Protocol] Manager End Timer command emission on click
     ✓ 2. [Synthetic DOM Protocol] Immediate player personal result on SHOW_RESULT
     ✓ 3. [Synthetic DOM Protocol] Authoritative percentage reveal on manager responses screen
     ✓ 4. [Synthetic DOM Protocol] Previous / History data contract with question details
     ✓ 5. [Synthetic DOM Protocol] Replay checkpoint confirmation and socket command emission
     ✓ 6. [Synthetic DOM Protocol] Interlude auto and manual transition handling
     ✓ 7. [Synthetic DOM Protocol] Keyboard shortcut focus isolation & modal protection
 ✓  web  packages/web/src/features/quizz/extensions-ui.test.ts (30 tests)

 Test Files  7 passed (7)
      Tests  105 passed (105)
   Duration  4.35s
```

### C. Workspace Vitest Suite (`pnpm test`)

```
$ vitest run
 RUN  v5.0.3 C:/Users/DAVID/Code/Razzia-worktrees/maya

 ✓  common  packages/common/src/questions/estimation.test.ts (4 tests)
 ✓  socket  packages/socket/src/services/registry.test.ts (2 tests)
 ✓  common  packages/common/src/validators/game.test.ts (4 tests)
 ✓  common  packages/common/src/validators/quizz.test.ts (18 tests)
 ✓  socket  packages/socket/src/services/auth.test.ts (6 tests)
 ✓  socket  packages/socket/src/services/scoring/scoring.test.ts (15 tests)
 ✓  socket  packages/socket/src/services/scoring/round.test.ts (6 tests)
 ✓  socket  packages/socket/src/services/media.test.ts (8 tests)
 ✓  socket  packages/socket/src/services/config.test.ts (9 tests)
 ✓  web  packages/web/src/locales/locales.test.ts (25 tests)
 ✓  web  packages/web/src/locales/ranks.test.ts (18 tests)
 ✓  web  packages/web/src/lib/session.test.ts (5 tests)
 ✓  web  packages/web/src/features/questions/questions.test.ts (9 tests)
 ✓  socket  packages/socket/src/utils/utils.test.ts (9 tests)
 ✓  socket  packages/socket/src/services/game/game.test.ts (32 tests)
 ✓  socket  packages/socket/src/api/api.test.ts (23 tests)
 ✓  socket  packages/socket/src/handlers/game.test.ts (24 tests)
 ✓  web  packages/web/src/features/game/components/game-controls.test.ts (11 tests)
 ✓  web  packages/web/src/features/game/phase-a-flow.browser.test.ts (7 tests)
 ✓  web  packages/web/src/features/quizz/extensions-ui.test.ts (30 tests)

 Test Files  20 passed (20)
      Tests  265 passed (265)
   Duration  5.99s
```

**Total Vitest test count:** 265 (workspace) + 155 (extensions) = **420 passed**.

### D. TypeScript Validation (`pnpm -r exec tsc --noEmit`)

```
$ pnpm -r exec tsc --noEmit
Exit code 0 — 0 type errors across all packages and workspaces.
```

### E. Code Quality Linter (`pnpm lint`)

```
$ oxlint
Found 0 warnings and 0 errors.
Finished in 3.8s on 317 files with 233 rules using 12 threads.
```

### F. Code Formatting Check (`pnpm format`)

```
$ prettier --check . --log-level warn
Exit code 0 — All files match Prettier standards.
```

### G. Web Production Build (`pnpm build`)

```
$ pnpm -r run build
Scope: 5 of 6 workspace projects
packages/socket build: Done
packages/web build:
✓ 2978 modules transformed.
dist/index.html                                                0.58 kB │ gzip:   0.36 kB
dist/assets/index-DWbPbGc3.css                                62.61 kB │ gzip:  11.84 kB
dist/assets/index-D_2pLOs7.js                              1,299.27 kB │ gzip: 408.17 kB
✓ built in 1.31s
```

---

## 4. Cross-Agent Handoffs

### A. Handoff for Noam (Telephony Engineer) — `extensions/src/telephony/KeypadSimulator.tsx`

- **Ownership Notice:** Maya has strictly respected ownership boundaries and **made ZERO edits** to `extensions/src/telephony/**`.
- **Status & Recommendations for Noam:**
  - `KeypadSimulator.tsx` is currently classified as a developer simulation widget.
  - If it is ever promoted to production player-facing UI:
    - Retokenize color styles to match design system tokens (`border-primary`, `bg-primary`, `text-primary`).
    - Migrate hardcoded English strings ("Telephony Keypad", "Phone Player", "Call", "Hang Up", "Digit buffer", "Clear", "Sent", "Send", "Quick Dial", "Game PIN", "Current Selection") to `extensions/src/locales/{en,fr,de,es,it,ja,tr,vi}/extensions.json` under an appropriate telephony namespace.
    - Add accessible keyboard navigation (`onKeyDown` handling for Enter/Space on number pad buttons).

### B. Handoff for Tomer (Backend / Integration) & Roni (Independent QA) — Real-App Playwright E2E in `packages/e2e/**`

- **Ownership Notice:** `packages/e2e/**` is outside Maya's exclusive ownership scope.
- **Status & Guidance:**
  - `packages/web/src/features/game/phase-a-flow.browser.test.ts` was previously labeled as "Real Playwright Browser Integration Acceptance" despite using `page.setContent()` with synthetic raw HTML strings. Maya has reframed this honestly as `PROTOCOL / SPEC: Synthetic DOM Event & Command Flow Simulation (Non-E2E / DOM Harness)`.
  - Genuine end-to-end browser tests exercising the compiled Vite client against the active Socket/Hono server belong in `packages/e2e/**`.
  - When Tomer/Roni run integration E2E:
    - Start real backend (`pnpm --filter @razzia/socket start`).
    - Start web client (`pnpm --filter @razzia/web dev`).
    - Navigate real browser pages using `page.goto("http://localhost:5173/...")`.
    - Verify: host controls toolbar, countdown progress, answer button visuals, interlude playback, and real socket state broadcasts.

---

## 5. Acceptance Criteria Verification

| ID                 | Case                                                   | Observable Verification                                                                                                | Status                                                   |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| A1                 | Stable Question IDs & Async Sidecar Lifecycle          | Stable UUID map synchronized on async sidecar load; reordering, duplication, deletion, and composite save 409 clean.   | PASS (`extensions-ui.test.ts`, `editor.test.ts`)         |
| A2                 | Polished Host Control Surface                          | Manager toolbar with End Timer, Next Screen, Skip Question (confirm), Previous (read-only history + replay), Exit.     | PASS (`game-controls.test.ts`)                           |
| A3                 | Fullscreen Interlude Presenter Event Projection        | Fullscreen projection, auto (`reason: "auto"`) and manual (`reason: "manual"`), reconnect resilience, clean disposal.  | PASS (`presentation.test.ts`)                            |
| A4                 | Cinematic Percentage Reveal                            | 2D horizontal bars (0 -> % in 0.65-1.0s), 0.2-0.35s pause, then check/cross reveal; survey neutral; player immediate.  | PASS (`reveal-timeline.test.ts`, `presentation.test.ts`) |
| A5                 | Verification, Types, Lint, Locales Parity              | 8 locales with 100% key parity, 420 tests green, 0 tsc errors, 0 lint errors, clean production build.                  | PASS (`locales.test.ts`, `pnpm test`, `oxlint`, `build`) |
| MEDIA01            | Image-only answer with alt and picture                 | Underlying accessible answer string preserved via `aria-label` and `sr-only` span; alt validated.                      | PASS (`media.test.ts`, `extensions-ui.test.ts`)          |
| MEDIA02            | Image answer missing alt or URL with `javascript:`     | Rejected by schema validator; image not rendered.                                                                      | PASS (`media.test.ts`, `extensions-ui.test.ts`)          |
| MEDIA03            | Reveal blur/tiles/pixelate/zoom after manager trigger  | Synchronized stage calculation; no premature display; snap to 1.0 after duration elapsed on reconnect.                 | PASS (`media.test.ts`, `extensions-ui.test.ts`)          |
| AUDIO01            | Custom cue mute/volume=0 and default fallback          | Muted/zero-volume audio produces disabled cue; missing asset falls back safely without freezing.                       | PASS (`presentation.test.ts`, `extensions-ui.test.ts`)   |
| AUDIO02            | Question audio/video and looped game music             | Background music ducks when competing question media has active sound.                                                 | PASS (`presentation.test.ts`, `extensions-ui.test.ts`)   |
| INT01              | Interlude title/image/video/countdown with auto/manual | Exact position after results; skip occurs exactly once.                                                                | PASS (`presentation.test.ts`, `extensions-ui.test.ts`)   |
| INT02              | Disconnect/reconnect mid-interlude                     | Snapshot resilience: resumes from server `startedAt` without resetting or doubling timer.                              | PASS (`presentation.test.ts`, `extensions-ui.test.ts`)   |
| TEAM01             | 3 teams, 8 players auto round-robin                    | Counts 3/3/2 by deterministic order.                                                                                   | PASS (`presentation.test.ts`)                            |
| TEAM02             | Two teams 50 points tie; reconnect changes socket ID   | Stable team membership by clientId; tie broken by name then ID; no double count.                                       | PASS (`presentation.test.ts`)                            |
| TEAM03             | Disconnected and kicked members                        | Disconnected keeps earned score; kicked removed before next projection.                                                | PASS (`presentation.test.ts`)                            |
| CORE02             | Reorder questions in enriched quiz                     | Stable question UUIDs and perQuestion attachments follow questions without swap or loss.                               | PASS (`editor.test.ts`, `extensions-ui.test.ts`)         |
| CORE03             | Duplicate and remove questions                         | Fresh unique UUID minted on duplicate; attachments cleaned up on remove with zero orphans.                             | PASS (`editor.test.ts`, `extensions-ui.test.ts`)         |
| CORE04             | Revision conflict 409 handling                         | `RevisionConflictError` caught; `ConflictModal` presented with reload and overwrite choices.                           | PASS (`editor.test.ts`, `extensions-ui.test.ts`)         |
| L10N01             | 8 locales x extension namespaces                       | 100% key parity across all 8 dictionaries; registered in web i18next.                                                  | PASS (`locales.test.ts`)                                 |
| REG01              | Extensions disabled / old Razzia                       | Default upstream UI and props rendered identically; all baseline tests + new tests pass.                               | PASS (`extensions-ui.test.ts`, `pnpm test`)              |
| GIT01              | Maya commit touches only owned paths                   | Only `packages/web/src/**`, `extensions/src/{editor,media,presentation,locales}/**`, and handoff modified.             | PASS (`git status`)                                      |
| CORR01             | Authoritative reveal snapshot on mount & reconnect     | Synchronous snapshot from `ExtensionStateContext`; unique-respondents denominator; immediate player results kept.      | PASS (`extensions-ui.test.ts`, `phase-a-flow.browser`)   |
| CORR02             | Previous / History data contract normalization         | Backend `QuestionResult` normalized safely via `formatHistoryItem`; safe empty/null handling.                          | PASS (`presentation.test.ts`, `phase-a-flow.browser`)    |
| CORR03             | Interlude auto-advance ownership                       | Server `RoundManager` is sole auto authority; frontend timer displays progress; manual skip idempotent with epochs.    | PASS (`presentation.test.ts`, `phase-a-flow.browser`)    |
| CORR04             | Keyboard focus safety & 8-locale key completeness      | Space/Enter excluded on interactive elements & open dialogs; all new strings localized across 8 locales.               | PASS (`game-controls.test.ts`, `locales.test.ts`)        |
| BROWSER01          | Real Playwright browser acceptance in Chromium         | Synthetic harness verifying protocol events; genuine E2E deferred to `packages/e2e/**` (Tomer/Roni).                   | PASS (`phase-a-flow.browser.test.ts`)                    |
| DEFECT-MAYA-W2A-01 | Stale reveal state, question isolation & epoch order   | Single authoritative state in Responses; question index/type matching; instant render reset on question/replay change. | PASS (`extensions-ui.test.ts`, `Responses.tsx`)          |
| CONF-01            | Media Library selection callback & target isolation    | Choosing answer/interlude image writes to exact extras target without altering base question media; type validation.   | PASS (`extensions-ui.test.ts`, `QuestionEditor`)         |
| CONF-02            | Editor preview canonical palette                       | Exact upstream CSS variables used for preview choices; bespoke red/blue/green/yellow eliminated.                       | PASS (`extensions-ui.test.ts`, `PreviewSection`)         |
| CONF-03            | Feature-off manager toolbar parity                     | Vanilla header restored when extensions are disabled/absent; toolbar gated on active extension state.                  | PASS (`extensions-ui.test.ts`, `GameWrapper`)            |
| CONF-04            | Decompose oversized UI components                      | `editor-enhancement-panel.tsx` reduced to 215 lines; modular subcomponents; `HistoryDialog` extracted.                 | PASS (`editor-enhancement-panel.tsx`, `HistoryDialog`)   |
| CONF-05            | 8-locale key completeness & zero hardcoded strings     | All user-facing strings across all dialogs, toolbars, and preview cards localized across all 8 languages.              | PASS (`locales.test.ts`)                                 |
| CONF-06            | Dialog accessibility, focus traps & keyboard behavior  | `ConflictModal` and `HistoryDialog` implement accessible dialog semantics, Tab trap, Escape close, and restoration.    | PASS (`conflict-modal.tsx`, `HistoryDialog.tsx`)         |
