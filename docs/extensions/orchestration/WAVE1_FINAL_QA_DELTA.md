# Wave 1 Final QA Delta & Recovery Ledger

**Date:** 2026-10-26  
**Auditor / Agent:** Tomer (Backend / Contracts / Integration — One-Agent Mode)  
**Starting Commit:** `3699ca0a0ffe2e44d0b7bbbb813ef9d674f24127`  
**Target Branch:** `agent/tomer/wave2`  
**Audited Live Processes (Preserved Untouched):**
- Web: Port 3000 (PID 20948)
- Socket: Port 3001 (PID 19640)
- Telephony Gateway: Port 38991 (PID 29508)

---

## 1. Verified Defects & Resolution Matrix

| Defect ID | Title | Root Cause | Implemented Resolution | Verification Evidence | Status |
|---|---|---|---|---|---|
| **UI-01** | Header actions (Save/Exit) clipped at 1024px/1280px | `QuizzEditorHeader.tsx` combined title, 10-item ToggleGroup, Studio navigation tabs, and Save/Exit on a single non-wrapping flex row. | Restructured into two-row layout: Row 1 retains Title (`shrink-0`), original `ToggleGroup` in original slot (`min-w-0 flex-1 overflow-x-auto`), and Save/Exit actions (`shrink-0`). Row 2 hosts the 4 Studio screen tabs. Buttons are fully visible, on-screen, and clickable across all viewports. | Playwright `QA-01` verified bounding box and clickability across 1024, 1280, 1440, and 1920 viewports. Screenshots: `viewport_1024_questions.png`, `viewport_1280_questions.png`, `viewport_1440_questions.png`, `viewport_1920_questions.png`. | **VERIFIED & RESOLVED** |
| **UI-02** | Settings Card narrow 320px column trap | Shared `Card.tsx` has `max-w-80` (320px) by default; `studio-settings-page.tsx` inherited it without overriding. | Added `w-full max-w-none` to `<Card>` inside `studio-settings-page.tsx`, allowing the card to stretch naturally across the `max-w-4xl` container (> 700px on desktop). | Playwright `QA-01` asserts card width is >= 600px (measured at ~896px). Screenshot: `viewport_1280_settings.png`. | **VERIFIED & RESOLVED** |
| **LIVE-01** | Live Leaderboard card displays placeholder/mock | `scene-presenter.tsx` rendered static mock rows without server ranking data. | Added `PublicRankEntry` schema, exposed `currentLeaderboard` on `RoundManager`, projected live ranking via `activeSceneData.leaderboard` in `session.ts`, and updated `ScenePresenter` to render real player names, points, rank badges, and empty-state messaging. | Playwright `QA-04` asserted live 2-player leaderboard displaying "Alice" (1000 pts) and "Bob" (850 pts). Screenshots: `live_leaderboard_real_scores_manager.png`, `live_leaderboard_real_scores_player.png`. | **VERIFIED & RESOLVED** |
| **LIVE-02** | Live Interim Results card displays placeholder | `scene-presenter.tsx` rendered static generic text without actual poll question distribution. | Added `PublicInterimResults` schema, captured `lastCompletedDistribution` upon question reveal in `Game`, projected through `activeSceneData.interimResults` in `session.ts`, and updated `ScenePresenter` to render real question text, answer labels, responder counts, and percentage bars. | Playwright `QA-04` asserted live interim results displaying "Favorite language?" with "TypeScript" (50%, 1 vote) and "Rust" (50%, 1 vote). Screenshots: `live_interim_results_real_poll_manager.png`, `live_interim_results_real_poll_player.png`. | **VERIFIED & RESOLVED** |
| **TEST-01** | Playwright tests only test seeded JSON, not real UI creation & save | `wave1-completion.spec.ts` seeded quizzes via mock data. | Authored `wave1-final-qa.spec.ts` testing complete UI creation: creating a new quiz, toggling question kind between Quiz and Survey via the header ToggleGroup, filling title/question, clicking Save, reloading the page, and asserting persisted state and kind toggle. | Playwright `QA-02` passed in 2.1s. Screenshot: `editor_ui_saved_quizz.png`. | **VERIFIED & RESOLVED** |
| **TEST-02** | Missing viewport boundary & negative launch tests | Viewport boundaries (1024-1920) and launch preflight blockers were unverified. | Added explicit Playwright tests asserting Save/Exit within viewport coordinates (`right <= viewport.width`), plus `QA-03` asserting dirty draft warning and missing media warning with disabled launch button. | Playwright `QA-01` (3.9s) and `QA-03` (1.3s) both passed. Screenshot: `launch_preflight_missing_media_warning.png`. | **VERIFIED & RESOLVED** |
| **I18N-01** | Hardcoded English strings in UI components | Hardcoded strings in `scene-presenter.tsx`, `studio-scene-editor.tsx`, and `studio-settings-page.tsx`. | Added typed `labels` prop to `ScenePresenter`, passed localized strings from `GameWrapper.tsx` using `useTranslation`, localized all form labels and sample badges in `studio-scene-editor.tsx`, and expanded `extensions.json` across all 8 locales (`en`, `de`, `es`, `fr`, `it`, `ja`, `tr`, `vi`). | `extensions/src/locales/locales.test.ts` (9 tests passed), `packages/web/src/locales/locales.test.ts` (25 tests passed). | **VERIFIED & RESOLVED** |
| **DESIGN-01** | New ScenePresenter used non-standard color palettes | Injected `bg-blue-500/20`, `bg-purple-500/20`, etc. violated Razzia theme tokens. | Refactored `ScenePresenter` to strictly use Razzia design system tokens (`bg-card`, `bg-primary`, `bg-secondary`, `bg-accent`, `text-foreground`, `text-muted-foreground`, `border-border/40`). | Verified via Oxlint, Playwright screenshots across manager and player displays. | **VERIFIED & RESOLVED** |
| **PSTN-01** | Running gateway process started prior to audio fix | Gateway process (PID 29508) started before closing-window audio fix. | Verified bit-for-bit SHA256 match on disk for `tada-audio-logic.cjs`, `tada-pilot-gateway.cjs`, and `tada-audio-logic.test.cjs`. Prepared safe zero-downtime restart instructions for operator. Preserved process PID 29508 untouched. Physical call gate marked strictly `PENDING OWNER PSTN TEST`. | Automated audio logic unit test suite passes 16/16 tests. Physical PSTN gate marked `PENDING OWNER PSTN TEST`. | **DOCUMENTED & PENDING OWNER TEST** |

---

## 2. Gate Status Summary (F01–F17)

- **F01 (Header 1024px Reachability):** **PASSED** (Save & Exit on-screen, clickable, no overflow).
- **F02 (Header 1280px Reachability):** **PASSED** (Save & Exit on-screen, clickable).
- **F03 (Header 1440px Reachability):** **PASSED** (Save & Exit on-screen, clickable).
- **F04 (Header 1920px Reachability):** **PASSED** (Save & Exit on-screen, clickable).
- **F05 (ToggleGroup Original Slot):** **PASSED** (ToggleGroup retained in Row 1 between Title and Save/Exit).
- **F06 (Settings Card Width):** **PASSED** (Card width >= 600px inside `max-w-4xl`, measured ~896px).
- **F07 (Editor UI Workflow):** **PASSED** (Card kind toggle Quiz/Survey, Save button click, reload persistence).
- **F08 (Launch Preflight Dirty Draft Blocker):** **PASSED** (Warning displayed, launch button disabled until saved).
- **F09 (Launch Preflight Missing Media Blocker):** **PASSED** (Warning displayed, launch button disabled when media URL empty).
- **F10 (Live Leaderboard Data):** **PASSED** (Real scores, player names, rank badges, zero-player empty state).
- **F11 (Live Interim Results Data):** **PASSED** (Real question text, response counts, percentages from reveal).
- **F12 (ScenePresenter Design Tokens):** **PASSED** (Razzia theme tokens, contrast compliance).
- **F13 (i18n Parity Across 8 Locales):** **PASSED** (100% key parity in `en`, `de`, `es`, `fr`, `it`, `ja`, `tr`, `vi`).
- **F14 (TypeScript Typecheck):** **PASSED** (`tsc --noEmit` exited 0 across web, socket, and extensions).
- **F15 (Oxlint Linter):** **PASSED** (0 errors across 343 files).
- **F16 (Automated Vitest Suites):** **PASSED** (Monorepo 287/287 passed, Extensions 191/191 passed).
- **F17 (Physical PSTN Phone Gate):** **PENDING OWNER PSTN TEST** (Causal audio logic 16/16 passed, PID 29508 preserved, physical call pending owner test).

---

## 3. Generated Visual Evidence Artifacts

The following visual artifacts were generated during automated acceptance runs and are preserved locally:

| File Path | Description |
|---|---|
| `packages/e2e/test-results/wave1-final-qa/viewport_1024_questions.png` | Quizz editor at 1024x768 viewport demonstrating Save and Exit buttons on-screen and clickable. |
| `packages/e2e/test-results/wave1-final-qa/viewport_1280_questions.png` | Quizz editor at 1280x800 viewport showing balanced two-row header and ToggleGroup. |
| `packages/e2e/test-results/wave1-final-qa/viewport_1280_settings.png` | Studio Settings page at 1280x800 showing Settings Card stretching full width (>800px) inside `max-w-4xl`. |
| `packages/e2e/test-results/wave1-final-qa/viewport_1440_questions.png` | Quizz editor at 1440x900 viewport. |
| `packages/e2e/test-results/wave1-final-qa/viewport_1920_questions.png` | Quizz editor at 1920x1080 viewport. |
| `packages/e2e/test-results/wave1-final-qa/editor_ui_saved_quizz.png` | Editor after creating question, toggling Survey kind, saving via button, and reloading from storage. |
| `packages/e2e/test-results/wave1-final-qa/launch_preflight_missing_media_warning.png` | Launch tab showing preflight blocker when a media scene has empty mediaUrl, disabling launch. |
| `packages/e2e/test-results/wave1-final-qa/live_leaderboard_real_scores_manager.png` | Manager screen on live Leaderboard scene showing Alice (1000 pts) and Bob (850 pts). |
| `packages/e2e/test-results/wave1-final-qa/live_leaderboard_real_scores_player.png` | Player screen (Alice) on live Leaderboard scene showing identical authoritative rankings. |
| `packages/e2e/test-results/wave1-final-qa/live_interim_results_real_poll_manager.png` | Manager screen on live Interim Results scene displaying real poll distribution (50% TypeScript, 50% Rust). |
| `packages/e2e/test-results/wave1-final-qa/live_interim_results_real_poll_player.png` | Player screen (Alice) on live Interim Results scene displaying real poll distribution. |
| `packages/e2e/test-results/wave1-final-qa/live_finish_podium.png` | Final game podium displaying real player scores after mixed quiz/survey session. |
