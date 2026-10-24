# Maya UI & Frontend Handoff (V3)

## Status & Overview
- **Role:** Maya (Frontend / Native UX / Media / Presentation / Audio / Editor / Locales)
- **Workspace:** `C:\Users\DAVID\Code\Razzia-worktrees\maya`
- **Branch:** `agent/maya/wave1`
- **Starting Baseline Commit:** `1d9361a build(extensions): bootstrap shared contracts for three agents`
- **Maya Deliverable Commit:** `7b004b5 feat(web): implement editor enhancement panel, media, presentation, locales, and web hooks`
- **Execution Mode:** NORMAL (Direct session execution, no subagents invoked)
- **Status:** Complete — All modules implemented, all upstream hooks applied, all tests green (293 passing unit tests + successful Vite build).

---

## 1. Exclusive Exports Ledger

Maya implements and exports the following modules from `@razzia/extensions`:

### A. `@razzia/extensions/locales` (`extensions/src/locales/index.ts`)
- All 8 Razzia languages implemented: `en`, `fr`, `de`, `es`, `it`, `ja`, `tr`, `vi`.
- Strict key-parity across all 8 dictionaries covering tabs, leaderboard, teams, audio, visuals, interludes, conflict 409, bundles, and errors.
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
  - Renders interlude slides between question results and next question.
  - Supports kinds: `title`, `image`, `video`, `countdown`.
  - Auto-advance (when timer reaches 0) vs manual advance.
  - Manager skip button executes **exactly once** (idempotent, prevents double skips) (INT01).
  - Reconnect snapshot resilience: resumes from `serverStartedAt` without resetting or doubling timer (INT02).
- `InterludePreview`:
  - Interactive preview component for authoring.
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
  - `reorderQuestionsInExtras`: reorders stable UUID array while keeping attachments intact (CORE02).
  - `duplicateQuestionInExtras`: mints fresh UUID, clones attachments without collision (CORE03).
  - `removeQuestionFromExtras`: removes target question UUID and cleans up attachments with zero orphans (CORE03).

---

## 2. Upstream Web Hooks Ledger (`packages/web/src/**`)

| File | Touched Symbol | Reason / Change | Disabled / Feature-Off Test |
| --- | --- | --- | --- |
| `packages/web/src/i18n.ts` | `i18n.init` | Injected `getExtensionResources()` for all 8 languages under `extensions` namespace. | Existing 57 web tests pass; missing extension keys fallback gracefully. |
| `packages/web/src/features/game/components/AnswerButton.tsx` | `AnswerButton` | Added optional `visual` prop (`RichAnswerCard` integration). Validates alt text/safe URL and displays image while preserving underlying accessible text. | When `visual` is undefined, button renders identical DOM and classes as original. |
| `packages/web/src/components/QuestionMedia.tsx` | `QuestionMedia` | Added optional `reveal` prop. Renders `RevealMedia` with blur/pixelate/tiles/zoom when effect is configured. | When `reveal` is undefined or effect is 'none', renders original `img` element. |
| `packages/web/src/features/game/components/states/Room.tsx` | `Room` | Listens to `extensions:state` event and renders `LobbyTeamAssignment` when `teams.enabled` is true. Manager can reassign teams before start. | When teams are not enabled or no extension state, original room view renders identically. |
| `packages/web/src/features/game/components/states/Leaderboard.tsx` | `Leaderboard` | Listens to `extensions:state` event and renders `TeamLeaderboardPanel` with Individual/Teams toggle when teams are enabled. | When teams are not enabled, original individual leaderboard renders identically. |
| `packages/web/src/features/game/components/GameWrapper.tsx` | `GameWrapper` | Mounts `AudioCuePlayer` for sound cues, renders `InterludePresenter` when phase is interlude, and displays team badge in player footer bar. | When extension state is absent, original game wrapper and participant bar render identically. |
| `packages/web/src/features/quizz/components/QuizzEditorHeader.tsx` | `QuizzEditorHeader` | Performs composite save to `/api/extensions/quizzes/:id` when extras are present and mounts `ConflictModal` on 409 conflict. | When extras are null, legacy `createQuizz`/`updateQuizz` endpoints are used. |
| `packages/web/src/features/quizz/components/QuestionEditor/index.tsx` | `QuestionEditor` | Mounts `EditorEnhancementPanel` and integrates with authenticated `MediaLibrary` picker. | When collapsed, standard `QuestionEditor` renders identically. |
| `packages/web/src/features/quizz/contexts/quizz-editor-context.tsx` | `QuizzEditorProvider` | Maintains stable question UUID lifecycle during reorder, duplicate, and delete; manages `extras` and `conflict` state. | When no extras, standard form and fieldArray behavior unchanged. |
| `packages/web/src/features/manager/components/configurations/ConfigManageQuizz.tsx` | `handleExport` / `handleImport` | Added Enhanced Export (`.bundle.json`) alongside legacy export (`.json`); automatically detects versioned enhanced bundle on import. | Legacy `.json` export and import continue working unchanged. |

---

## 3. Test Evidence

### A. Extension Tests (`pnpm --filter @razzia/extensions test`)
```
$ vitest run
 RUN  v5.0.3 C:/Users/DAVID/Code/Razzia-worktrees/maya/extensions

 ✓ src/locales/locales.test.ts (9 tests)
 ✓ src/core/core.test.ts (25 tests)
 ✓ src/presentation/presentation.test.ts (12 tests)
 ✓ src/media/media.test.ts (9 tests)
 ✓ src/editor/editor.test.ts (6 tests)
 ✓ src/core/imports.test.ts (3 tests)

 Test Files  6 passed (6)
      Tests  64 passed (64)
   Duration  1.36s
```

### B. Web Tests (`pnpm test -- --project web`)
```
$ vitest run "--project" "web"
 RUN  v5.0.3 C:/Users/DAVID/Code/Razzia-worktrees/maya

 ✓  web  packages/web/src/locales/ranks.test.ts (18 tests)
 ✓  web  packages/web/src/features/questions/questions.test.ts (9 tests)
 ✓  web  packages/web/src/lib/session.test.ts (5 tests)
 ✓  web  packages/web/src/locales/locales.test.ts (25 tests)
 ✓  web  packages/web/src/features/quizz/extensions-ui.test.ts (12 tests)

 Test Files  5 passed (5)
      Tests  69 passed (69)
   Duration  1.22s
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
 ✓  socket  packages/socket/src/utils/utils.test.ts (9 tests)
 ✓  web  packages/web/src/locales/locales.test.ts (25 tests)
 ✓  socket  packages/socket/src/services/game/game.test.ts (32 tests)
 ✓  web  packages/web/src/lib/session.test.ts (5 tests)
 ✓  web  packages/web/src/locales/ranks.test.ts (18 tests)
 ✓  web  packages/web/src/features/questions/questions.test.ts (9 tests)
 ✓  socket  packages/socket/src/api/api.test.ts (23 tests)
 ✓  web  packages/web/src/features/quizz/extensions-ui.test.ts (12 tests)
 ✓  socket  packages/socket/src/handlers/game.test.ts (24 tests)

 Test Files  18 passed (18)
      Tests  229 passed (229)
   Duration  3.00s
```

**Total Vitest test count:** 229 (workspace) + 64 (extensions) = **293 passed**.

### D. Web Production Build (`pnpm --filter @razzia/web build`)
```
$ vite build
vite v8.3.4 building client environment for production...
transforming...
✓ 2974 modules transformed.
rendering chunks...
dist/index.html                                                0.58 kB
dist/assets/index-G8gx8-dO.css                                56.92 kB
dist/assets/index-B1N7aVcA.js                              1,267.65 kB
✓ built in 1.13s
```

---

## 4. Acceptance Criteria Verification

| ID | Case | Observable Verification | Status |
| --- | --- | --- | --- |
| MEDIA01 | Image-only answer with alt and picture | Underlying accessible answer string preserved via `aria-label` and `sr-only` span; alt validated. | PASS (`media.test.ts`, `extensions-ui.test.ts`) |
| MEDIA02 | Image answer missing alt or URL with `javascript:` | Rejected by schema validator; image not rendered. | PASS (`media.test.ts`, `extensions-ui.test.ts`) |
| MEDIA03 | Reveal blur/tiles/pixelate/zoom after manager trigger | Synchronized stage calculation; no premature display; snap to 1.0 after duration elapsed on reconnect. | PASS (`media.test.ts`, `extensions-ui.test.ts`) |
| AUDIO01 | Custom cue mute/volume=0 and default fallback | Muted/zero-volume audio produces disabled cue; missing asset falls back safely without freezing. | PASS (`presentation.test.ts`, `extensions-ui.test.ts`) |
| AUDIO02 | Question audio/video and looped game music | Background music ducks when competing question media has active sound. | PASS (`presentation.test.ts`, `extensions-ui.test.ts`) |
| INT01 | Interlude title/image/video/countdown with auto/manual | Exact position after results; skip occurs exactly once. | PASS (`presentation.test.ts`, `extensions-ui.test.ts`) |
| INT02 | Disconnect/reconnect mid-interlude | Snapshot resilience: resumes from server `startedAt` without resetting or doubling timer. | PASS (`presentation.test.ts`, `extensions-ui.test.ts`) |
| TEAM01 | 3 teams, 8 players auto round-robin | Counts 3/3/2 by deterministic order. | PASS (`presentation.test.ts`) |
| TEAM02 | Two teams 50 points tie; reconnect changes socket ID | Stable team membership by clientId; tie broken by name then ID; no double count. | PASS (`presentation.test.ts`) |
| TEAM03 | Disconnected and kicked members | Disconnected keeps earned score; kicked removed before next projection. | PASS (`presentation.test.ts`) |
| CORE02 | Reorder questions in enriched quiz | Stable question UUIDs and perQuestion attachments follow questions without swap or loss. | PASS (`editor.test.ts`, `extensions-ui.test.ts`) |
| CORE03 | Duplicate and remove questions | Fresh unique UUID minted on duplicate; attachments cleaned up on remove with zero orphans. | PASS (`editor.test.ts`, `extensions-ui.test.ts`) |
| CORE04 | Revision conflict 409 handling | `RevisionConflictError` caught; `ConflictModal` presented with reload and overwrite choices. | PASS (`editor.test.ts`, `extensions-ui.test.ts`) |
| L10N01 | 8 locales x extension namespaces | 100% key parity across all 8 dictionaries; registered in web i18next. | PASS (`locales.test.ts`) |
| REG01 | Extensions disabled / old Razzia | Default upstream UI and props rendered identically; all 217 baseline tests + new tests pass. | PASS (`extensions-ui.test.ts`, `pnpm test`) |
| GIT01 | Maya commit touches only owned paths | Only `packages/web/src/**`, `extensions/src/{editor,media,presentation,locales}/**`, and handoff modified. | PASS (`git status`) |
