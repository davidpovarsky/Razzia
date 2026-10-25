# Maya UI & Frontend Handoff (V3)

## Status & Overview

- **Role:** Maya (Frontend / Native UX / Media / Presentation / Audio / Editor / Locales)
- **Workspace:** `C:\Users\DAVID\Code\Razzia-worktrees\maya`
- **Branch:** `agent/maya/wave2`
- **Phase:** Wave 2 — Phase A: Editor IDs, Host Controls, Interlude Presenter, and Cinematic Response Reveal
- **Starting Backend Baseline:** `cf824d7 feat(gameplay): wave 2 phase a backend game control, interludes and authoritative reveal` (Tomer Phase A)
- **Execution Mode:** NORMAL (Direct session execution, no subagents invoked)
- **Status:** Complete — Wave 2 Phase A UI, Host Controls, Interlude Presenter, and Cinematic Reveal implemented, tested, and verified.

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

| File                                                                                | Touched Symbol                                 | Reason / Change                                                                                                                                              | Disabled / Feature-Off Test                                                                       |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `packages/web/src/i18n.ts`                                                          | `i18n.init`                                    | Injected `getExtensionResources()` for all 8 languages under `extensions` namespace.                                                                         | Existing 57 web tests pass; missing extension keys fallback gracefully.                           |
| `packages/web/src/features/game/components/AnswerButton.tsx`                        | `AnswerButton`                                 | Added optional `visual` prop (`RichAnswerCard` integration), optional `fillPercentage` and `count` for integrated horizontal percentage bar rendering.       | When `fillPercentage` and `visual` are undefined, button renders identical DOM as original.       |
| `packages/web/src/components/QuestionMedia.tsx`                                     | `QuestionMedia`                                | Added optional `reveal` prop. Renders `RevealMedia` with blur/pixelate/tiles/zoom when effect is configured.                                                 | When `reveal` is undefined or effect is 'none', renders original `img` element.                   |
| `packages/web/src/features/game/components/states/Room.tsx`                         | `Room`                                         | Listens to `extensions:state` event and renders `LobbyTeamAssignment` when `teams.enabled` is true. Manager can reassign teams before start.                 | When teams are not enabled or no extension state, original room view renders identically.         |
| `packages/web/src/features/game/components/states/Leaderboard.tsx`                  | `Leaderboard`                                  | Listens to `extensions:state` event and renders `TeamLeaderboardPanel` with Individual/Teams toggle when teams are enabled.                                  | When teams are not enabled, original individual leaderboard renders identically.                  |
| `packages/web/src/features/game/contexts/extension-state-context.tsx`               | `ExtensionStateProvider` / `useExtensionState` | Synchronizes extension state between `GameWrapper` and `useManagerStore`, providing synchronous state snapshot on component mount and across reconnects.     | When context is absent or default, returns empty/undefined extension state safely.                |
| `packages/web/src/features/game/components/GameWrapper.tsx`                         | `GameWrapper`                                  | Mounts `AudioCuePlayer`, renders fullscreen `InterludePresenter`, wraps tree in `ExtensionStateProvider`, and mounts host control surface toolbar.           | When extension state is absent, original game wrapper and participant bar render identically.     |
| `packages/web/src/features/game/components/states/Responses.tsx`                    | `Responses`                                    | Reads authoritative snapshot synchronously via `useExtensionState`; multi-choice uses unique-respondents denominator; preserves immediate player result.     | Estimation questions continue delegating to `EstimationResponses`; vanilla calculates from count. |
| `packages/web/src/features/game/components/ManagerControlToolbar.tsx`               | `ManagerControlToolbar`                        | Dedicated Host Controls toolbar with focus-safe keyboard shortcuts (ignores focused buttons/dialogs), `formatHistoryItem` integration, and localized labels. | When manager is false, toolbar is unmounted; non-extension events fallback gracefully.            |
| `packages/web/src/pages/party/manager/$gameId.tsx`                                  | `ManagerGamePage`                              | Connects host commands and full-lifecycle exit navigation to `GameWrapper`.                                                                                  | Vanilla navigation and advance events preserved.                                                  |
| `packages/web/src/features/quizz/components/QuizzEditorHeader.tsx`                  | `QuizzEditorHeader`                            | Performs composite save to `/api/extensions/quizzes/:id` when extras are present and mounts `ConflictModal` on 409 conflict.                                 | When extras are null, legacy `createQuizz`/`updateQuizz` endpoints are used.                      |
| `packages/web/src/features/quizz/components/QuestionEditor/index.tsx`               | `QuestionEditor`                               | Mounts `EditorEnhancementPanel` and integrates with authenticated `MediaLibrary` picker.                                                                     | When collapsed, standard `QuestionEditor` renders identically.                                    |
| `packages/web/src/features/quizz/contexts/quizz-editor-context.tsx`                 | `QuizzEditorProvider`                          | Synchronizes React Hook Form field keys with persisted `extras.questionIds` on async sidecar load, drag reorder, duplication, and deletion.                  | When no extras, standard form and fieldArray behavior unchanged.                                  |
| `packages/web/src/features/quizz/components/QuizzEditorSidebar.tsx`                 | `QuizzEditorSidebar`                           | Supports question duplication action alongside deletion and reordering using stable UUID keys.                                                               | Vanilla sidebar operation preserved.                                                              |
| `packages/web/src/features/quizz/components/QuizzEditorCard.tsx`                    | `QuizzEditorCard`                              | Adds duplicate question button trigger.                                                                                                                      | Standard card display preserved.                                                                  |
| `packages/web/src/features/manager/components/configurations/ConfigManageQuizz.tsx` | `handleExport` / `handleImport`                | Added Enhanced Export (`.bundle.json`) alongside legacy export (`.json`); automatically detects versioned enhanced bundle on import.                         | Legacy `.json` export and import continue working unchanged.                                      |

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
 ✓  web  packages/web/src/features/questions/questions.test.ts (9 tests)
 ✓  web  packages/web/src/lib/session.test.ts (5 tests)
 ✓  web  packages/web/src/locales/locales.test.ts (25 tests)
 ✓  web  packages/web/src/features/quizz/extensions-ui.test.ts (16 tests)
 ✓  web  packages/web/src/features/game/components/game-controls.test.ts (11 tests)
 ✓  web  packages/web/src/features/game/phase-a-flow.browser.test.ts (7 tests)
   ✓ GATE 3 / Phase A: Real Playwright Browser Integration Acceptance (7)
     ✓ 1. Manager End Timer during active question answering (browser click & command emission)
     ✓ 2. Immediate individual player result display (no blocking by reveal)
     ✓ 3. Authoritative percentage reveal on initial mount / reconnect
     ✓ 4. Previous / History data modal displaying actual historical questions & counts
     ✓ 5. Replay from checkpoint confirmation dialog and action
     ✓ 6. Interlude auto and manual transitions (server authority & manager skip)
     ✓ 7. Keyboard shortcut interaction and focus exclusion

 Test Files  7 passed (7)
      Tests  91 passed (91)
   Duration  3.97s
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
 ✓  web  packages/web/src/features/quizz/extensions-ui.test.ts (16 tests)
 ✓  socket  packages/socket/src/api/api.test.ts (23 tests)
 ✓  socket  packages/socket/src/handlers/game.test.ts (24 tests)
 ✓  web  packages/web/src/features/game/components/game-controls.test.ts (11 tests)
 ✓  web  packages/web/src/features/game/phase-a-flow.browser.test.ts (7 tests)

 Test Files  20 passed (20)
      Tests  251 passed (251)
   Duration  6.09s
```

**Total Vitest test count:** 251 (workspace) + 155 (extensions) = **406 passed**.

### D. TypeScript Validation (`pnpm -r exec tsc --noEmit`)

```
$ pnpm -r exec tsc --noEmit
Exit code 0 — 0 type errors across all packages and workspaces.
```

### E. Code Quality Linter (`$env:NODE_OPTIONS="--experimental-strip-types"; pnpm lint`)

```
$ oxlint
Found 0 warnings and 0 errors.
Finished in 5.1s on 308 files with 233 rules using 12 threads.
```

### F. Web Production Build (`$env:NODE_OPTIONS="--experimental-strip-types"; pnpm build`)

```
$ pnpm -r run build
Scope: 5 of 6 workspace projects
packages/socket build: Done
packages/web build:
✓ 2978 modules transformed.
dist/index.html                                                0.58 kB │ gzip:   0.36 kB
dist/assets/index-DWbPbGc3.css                                62.61 kB │ gzip:  11.84 kB
dist/assets/index-CwObojJV.js                              1,298.25 kB │ gzip: 407.80 kB
✓ built in 1.75s
```

---

## 4. Acceptance Criteria Verification

| ID        | Case                                                   | Observable Verification                                                                                               | Status                                                   |
| --------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| A1        | Stable Question IDs & Async Sidecar Lifecycle          | Stable UUID map synchronized on async sidecar load; reordering, duplication, deletion, and composite save 409 clean.  | PASS (`extensions-ui.test.ts`, `editor.test.ts`)         |
| A2        | Polished Host Control Surface                          | Manager toolbar with End Timer, Next Screen, Skip Question (confirm), Previous (read-only history + replay), Exit.    | PASS (`game-controls.test.ts`)                           |
| A3        | Fullscreen Interlude Presenter Event Projection        | Fullscreen projection, auto (`reason: "auto"`) and manual (`reason: "manual"`), reconnect resilience, clean disposal. | PASS (`presentation.test.ts`)                            |
| A4        | Cinematic Percentage Reveal                            | 2D horizontal bars (0 -> % in 0.65-1.0s), 0.2-0.35s pause, then check/cross reveal; survey neutral; player immediate. | PASS (`reveal-timeline.test.ts`, `presentation.test.ts`) |
| A5        | Verification, Types, Lint, Locales Parity              | 8 locales with 100% key parity, 406 tests green, 0 tsc errors, 0 lint errors, clean production build.                 | PASS (`locales.test.ts`, `pnpm test`, `oxlint`, `build`) |
| MEDIA01   | Image-only answer with alt and picture                 | Underlying accessible answer string preserved via `aria-label` and `sr-only` span; alt validated.                     | PASS (`media.test.ts`, `extensions-ui.test.ts`)          |
| MEDIA02   | Image answer missing alt or URL with `javascript:`     | Rejected by schema validator; image not rendered.                                                                     | PASS (`media.test.ts`, `extensions-ui.test.ts`)          |
| MEDIA03   | Reveal blur/tiles/pixelate/zoom after manager trigger  | Synchronized stage calculation; no premature display; snap to 1.0 after duration elapsed on reconnect.                | PASS (`media.test.ts`, `extensions-ui.test.ts`)          |
| AUDIO01   | Custom cue mute/volume=0 and default fallback          | Muted/zero-volume audio produces disabled cue; missing asset falls back safely without freezing.                      | PASS (`presentation.test.ts`, `extensions-ui.test.ts`)   |
| AUDIO02   | Question audio/video and looped game music             | Background music ducks when competing question media has active sound.                                                | PASS (`presentation.test.ts`, `extensions-ui.test.ts`)   |
| INT01     | Interlude title/image/video/countdown with auto/manual | Exact position after results; skip occurs exactly once.                                                               | PASS (`presentation.test.ts`, `extensions-ui.test.ts`)   |
| INT02     | Disconnect/reconnect mid-interlude                     | Snapshot resilience: resumes from server `startedAt` without resetting or doubling timer.                             | PASS (`presentation.test.ts`, `extensions-ui.test.ts`)   |
| TEAM01    | 3 teams, 8 players auto round-robin                    | Counts 3/3/2 by deterministic order.                                                                                  | PASS (`presentation.test.ts`)                            |
| TEAM02    | Two teams 50 points tie; reconnect changes socket ID   | Stable team membership by clientId; tie broken by name then ID; no double count.                                      | PASS (`presentation.test.ts`)                            |
| TEAM03    | Disconnected and kicked members                        | Disconnected keeps earned score; kicked removed before next projection.                                               | PASS (`presentation.test.ts`)                            |
| CORE02    | Reorder questions in enriched quiz                     | Stable question UUIDs and perQuestion attachments follow questions without swap or loss.                              | PASS (`editor.test.ts`, `extensions-ui.test.ts`)         |
| CORE03    | Duplicate and remove questions                         | Fresh unique UUID minted on duplicate; attachments cleaned up on remove with zero orphans.                            | PASS (`editor.test.ts`, `extensions-ui.test.ts`)         |
| CORE04    | Revision conflict 409 handling                         | `RevisionConflictError` caught; `ConflictModal` presented with reload and overwrite choices.                          | PASS (`editor.test.ts`, `extensions-ui.test.ts`)         |
| L10N01    | 8 locales x extension namespaces                       | 100% key parity across all 8 dictionaries; registered in web i18next.                                                 | PASS (`locales.test.ts`)                                 |
| REG01     | Extensions disabled / old Razzia                       | Default upstream UI and props rendered identically; all baseline tests + new tests pass.                              | PASS (`extensions-ui.test.ts`, `pnpm test`)              |
| GIT01     | Maya commit touches only owned paths                   | Only `packages/web/src/**`, `extensions/src/{editor,media,presentation,locales}/**`, and handoff modified.            | PASS (`git status`)                                      |
| CORR01    | Authoritative reveal snapshot on mount & reconnect     | Synchronous snapshot from `ExtensionStateContext`; unique-respondents denominator; immediate player results kept.     | PASS (`extensions-ui.test.ts`, `phase-a-flow.browser`)   |
| CORR02    | Previous / History data contract normalization         | Backend `QuestionResult` normalized safely via `formatHistoryItem`; safe empty/null handling.                         | PASS (`presentation.test.ts`, `phase-a-flow.browser`)    |
| CORR03    | Interlude auto-advance ownership                       | Server `RoundManager` is sole auto authority; frontend timer displays progress; manual skip idempotent with epochs.   | PASS (`presentation.test.ts`, `phase-a-flow.browser`)    |
| CORR04    | Keyboard focus safety & 8-locale key completeness      | Space/Enter excluded on interactive elements & open dialogs; all new strings localized across 8 locales.              | PASS (`game-controls.test.ts`, `locales.test.ts`)        |
| BROWSER01 | Real Playwright browser acceptance in Chromium         | Real browser exercising End Timer, immediate result, reveal, history modal, replay, interlude, and keyboard safety.   | PASS (`phase-a-flow.browser.test.ts`)                    |
