# Tomer Single-Agent Implementation Handoff — Tada Studio Media, Appearance, Motion & Zero-Scroll Stage (2026-11-01)

## 1. Execution Scope & Baseline Audit (Gate A)

- **Agent:** Tomer (Single-Agent Execution Override per `TADA_ONE_AGENT_TOMER_COMPLETE_IMPLEMENTATION_2026-11-01.md`)
- **Worktree:** `C:/Users/DAVID/Code/Razzia-worktrees/tomer`
- **Branch:** `agent/tomer/wave2`
- **Starting HEAD:** `8c97687` (`feat(display): reuse exact player screen implementation for spectator route`)
- **Working Tree Status:** Clean (`git status --short` empty, `git diff --check` clean)
- **Active Ports:** None colliding prior to test execution

---

## 2. Minimal Upstream Hook Inventory (Recorded Before Editing `packages/**`)

All new domain schemas, media reference collectors, catalog resolvers, card appearance/audio/animation components, and runtime overlays reside in `extensions/src/**`. Only the following minimal upstream integration hooks in `packages/**` are authorized and documented below:

| # | Upstream File | Symbol / Function Touched | Exact Rationale | Default-Off / Backward-Compatibility Guarantee | Regression Test |
| :- | :------------ | :------------------------ | :-------------- | :--------------------------------------------- | :-------------- |
| 1 | `packages/socket/src/api/routes/media.ts` | `DELETE /:name` route handler | Invoke extension reference guard (`checkMediaReferencesBeforeDelete`) before `deleteMedia(name)` so files referenced across any show/card are protected against accidental unlinking (`409 Conflict` with reference summary), while supporting optional controlled detach. | Unreferenced media files delete identically with `200 OK`. | `extensions/src/server/media-library.test.ts`, `packages/socket/src/api/api.test.ts` |
| 2 | `packages/web/src/features/quizz/components/QuestionEditor/MediaLibrary/MediaLibraryToolbar.tsx` | `MediaLibraryToolbar` (`acceptType` prop, `<input accept>`, `handleDrop`) | Enforce `acceptType` (`image` / `audio` / `video`) on file input and drag-and-drop, rejecting mismatched MIME/extension uploads with localized toast feedback. | When `acceptType` is omitted, accepts all supported media types (`image/*,video/*,audio/*`) as before. | `packages/e2e/tests/media-appearance-stage-acceptance.spec.ts` |
| 3 | `packages/web/src/features/quizz/components/QuestionEditor/MediaLibrary/index.tsx` | `MediaLibrary` (`acceptType`, catalog tabs, safe delete handling, show association) | Filter visible items by `acceptType`, provide `All Uploaded` / `Used in This Show` / `Built-in Sounds` (for audio) tabs, associate uploads with the active show catalog, and handle `409 Conflict` reference-safe deletion responses cleanly without silently breaking other cards/shows. | Existing `MediaLibrary` usage without `acceptType` or show context works identically. | `packages/e2e/tests/media-appearance-stage-acceptance.spec.ts` |
| 4 | `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorAnswers.tsx` | `QuestionEditorAnswers` | Integrate per-answer visual controls (`text` / `image` / `both` mode, `MediaLibrary` image picker, thumbnail preview, remove from answer, `alt` text) directly into the primary answer editor cards for 2–5 options while preserving non-empty `answers[i]` strings and `solutions`. | Standard text-only answers behave identically with zero extra required fields. | `packages/web/src/features/quizz/extensions-ui.test.ts`, `packages/e2e/tests/media-appearance-stage-acceptance.spec.ts` |
| 5 | `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorConfig/BaseConfig.tsx` | `BaseConfig` | Mount `CardBackgroundSection` and `CardAudioSection` inside the primary question configuration panel so Quiz/Survey cards can configure per-card background and audio cues alongside existing config sections. | Defaults to "Use Game Background" and "Inherit Game Audio", preserving default Razzia behavior when untouched. | `packages/e2e/tests/media-appearance-stage-acceptance.spec.ts` |
| 6 | `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorConfig/QuestionEntranceConfig.tsx` | `QuestionEntranceConfig` | Extend entrance animation configuration to support independent staged animations (`questionEntrance`, `answerEntrance`, `answerBadgeEntrance`, `resultsRevealEntrance`), timing mode (`simultaneous` / `sequential`), duration (250–2500ms), and live preview. | Defaults to `preset: "none"` for all slots, preserving existing static presentation when unconfigured. | `packages/e2e/tests/media-appearance-stage-acceptance.spec.ts` |
| 7 | `packages/web/src/features/quizz/components/studio/studio-scene-editor.tsx` | `StudioSceneEditor` | Mount `CardBackgroundSection`, `CardAudioSection`, and `StagedAnimationSection` on scene cards (keeping content `mediaUrl` distinct from `background`), and make the scene editor layout responsive (`grid-cols-1 lg:grid-cols-12`, `min-w-0`) at narrow widths. | Scene cards without background/audio/animation overrides render with game defaults. | `packages/e2e/tests/media-appearance-stage-acceptance.spec.ts` |
| 8 | `packages/web/src/features/quizz/components/studio/studio-editor-context.tsx` & `QuizzEditorHeader.tsx` | `selectActiveCardKind`, conversion dialog, responsive header | Implement smart `Convert Question to Scene?`: convert blank/new questions immediately without confirmation; prompt accurate confirmation only when question has authored content; clean up `perQuestion[questionId]` on confirm; preserve state on cancel. | Populated questions remain protected against accidental loss; last-question guard preserved. | `packages/e2e/tests/media-appearance-stage-acceptance.spec.ts` |
| 9 | `packages/web/src/features/quizz/components/studio/studio-shell.tsx`, `QuizzEditorSidebar.tsx`, `QuestionEditor/index.tsx`, `QuestionEditorConfig/index.tsx` | Responsive studio shell & editor layout | Eliminate horizontal overflow (`scrollWidth <= clientWidth + 1`) across `1280, 1024, 844, 768, 390, 320` widths by collapsing/stacking sidebars on narrow viewports while keeping `studio-card-type-bar` in its exact top bar position. | Desktop (`>= 1280px`) 3-column layout and all existing `data-testid` hooks remain unchanged. | `packages/e2e/tests/media-appearance-stage-acceptance.spec.ts` |
| 10 | `packages/web/src/features/game/components/GameWrapper.tsx` | `GameWrapper` | Render `CardBackgroundOverlay` above `GameBackground`, pass active card audio overrides and phase cue resolution to `AudioCuePlayer`, and enforce zero-scroll stage container (`h-dvh max-h-dvh overflow-hidden`, `min-h-0` stage body). | When no card background or audio override exists, `GameBackground` and default audio behave identically. | `packages/e2e/tests/media-appearance-stage-acceptance.spec.ts`, `packages/e2e/tests/tzila-exact-player-screen.spec.ts` |
| 11 | `packages/web/src/features/game/components/QuestionEntrance.tsx`, `PhotoCardGrid.tsx`, `AnswerButton.tsx`, `states/Question.tsx`, `states/Answers.tsx`, `states/Responses.tsx`, `states/Leaderboard.tsx`, `states/Podium.tsx` | Stage presentation, staged animations, audio deduplication, zero-scroll fit | Apply `questionEntrance` on `SHOW_QUESTION` (`Question.tsx`), `answerEntrance` & `answerBadgeEntrance` on `SELECT_ANSWER` (`Answers.tsx` / `PhotoCardGrid.tsx` / `AnswerButton.tsx`), `resultsRevealEntrance` on `SHOW_RESPONSES` (`Responses.tsx`), prevent duplicate `useSound` playback when `AudioCuePlayer` owns the cue, and bound all stage elements to fit `100dvh` with zero scroll (`scrollHeight <= clientHeight + 1`). | Legacy quizzes without sidecars play original `useSound` SFX and render standard Razzia visuals without scroll overflow. | `packages/e2e/tests/media-appearance-stage-acceptance.spec.ts`, `packages/e2e/tests/tzila-public-stage-and-toolbar.spec.ts` |

---

## 3. Test Evidence & Gate Verification Summary

All verification gates were executed locally with real builds and genuine browser automation:

### A. Unit & Contract Verification (`pnpm test` & `pnpm --filter @razzia/extensions test`)
- **Workspace Unit Tests:** 22 test files passed, 312 tests passed (100% green).
- **Extensions Tests:** 29 test files passed, 288 tests passed (100% green).
- **Audio Catalog Verification:** `extensions/src/core/audio-catalog.test.ts` (3/3 passed) asserting all 9 cues map to actual files in `packages/web/public/sounds` (>1000 bytes) with zero drift.
- **Fail-Closed & Recoverable Deletion Tests:** `extensions/src/server/media-library.test.ts` (8/8 passed) verifying fail-closed behavior on corrupted sidecars or unreadable JSON, two-phase journaled file rollback on write errors, catalog-only reference safety, and crash recovery.
- **StageFit Presentation Primitive:** `extensions/src/presentation/stage-fit.test.ts` (3/3 passed) validating dynamic fit mode and responsive max-photo-h bounds.
- **Core Appearance Contracts:** `extensions/src/core/card-appearance.test.ts` (7/7 passed), `show-workbook.test.ts` (18/18 passed), `show-authoring.test.ts` (22/22 passed), `show-import-preflight.test.ts` (6/6 passed).
- **Telephony & Real Transport E2E:** `extensions/src/telephony/telephony.test.ts` (28/28 passed), `extensions/src/server/real-telephony-e2e.test.ts` (4/4 passed including 100-participant concurrent real server load test), `extensions/src/server/p0-telephony-roster.test.ts` (2/2 passed).
- **Localization Consistency:** `extensions/src/locales/locales.test.ts` (9/9 passed) and `packages/web/src/locales/locales.test.ts` (25/25 passed) across all 8 supported languages (`en`, `fr`, `de`, `es`, `it`, `ja`, `tr`, `vi`).

### B. End-to-End Playwright Acceptance (`packages/e2e/playwright.p0-acceptance.config.ts`)
- **New Studio Acceptance Suite (`tests/media-appearance-stage-acceptance.spec.ts`):** 2/2 tests passed (1.9m):
  1. `1. Studio Editor: Responsive Zero-Overflow (1280..320), Smart Convert Question->Scene, Per-Answer Visuals, Shared Media Library & Reference-Safe Delete`: Verified zero horizontal overflow across 1280, 1024, 844, 768, 390, 320 widths, immediate conversion for blank questions, dialog-protected conversion for populated questions, upload & immediate reuse in Answer Visuals and Card Background without duplicate uploads, built-in sound preview and selection, and non-destructive removal from card.
  2. `2. Live Runtime & Zero-Scroll Stage Matrix (STAGE-P0) across 8 Viewports + Card Background + Single Audio + Staged Motion`: Verified Opening scene custom background + audio + zero scroll, 5-option Question 1 custom background + audio cue + 4-slot staged animations (`fade`, `zoom-soft`, `spotlight`) + zero scroll + full visual containment (no ancestor clipping, no vertical overlap) across all 8 viewports (`1920x1080`, `1366x768`, `1280x800`, `1024x768`, `800x600 4:3`, `768x1024`, `390x844`, `320x568`), Single Reveal Interim Results scene zero scroll and visual containment across all 8 viewports, and Question 2 default game background fallback + muted cue zero scroll.
- **Regression Suite 1 (`tests/tzila-exact-player-screen.spec.ts`):** 3/3 tests passed (2.3m).
- **Regression Suite 2 (`tests/tzila-public-stage-and-toolbar.spec.ts`):** 3/3 tests passed (3.2m).

---

## 4. Screenshot Evidence Artifacts

Generated and saved under `packages/e2e/test-results/screenshots/`:

| Screenshot File | Resolution / Mode | Verified Requirement |
| :-------------- | :---------------- | :------------------- |
| `media-appearance-stage/01_editor_narrow_320px.png` | 320×800 (Mobile narrow) | Studio Editor zero horizontal overflow at 320px width |
| `media-appearance-stage/02_editor_card_appearance_configured.png` | 1280×900 (Desktop) | Question Editor with Answer 0 visual, custom background, and staged animation slots configured |
| `media-appearance-stage/03_opening_scene_custom_bg_1080p.png` | 1920×1080 (16:9 Stage) | Live Opening scene with custom background override and audio cue |
| `media-appearance-stage/04_q1_voting_1920x1080.png` | 1920×1080 (16:9 Stage) | Question 1 with 5 image+text options, custom background, and entrance animations |
| `media-appearance-stage/04_q1_voting_800x600_4_3.png` | 800×600 (4:3 Stage) | Question 1 zero-scroll fit on 4:3 projector display |
| `media-appearance-stage/04_q1_voting_390x844.png` | 390×844 (Mobile portrait) | Question 1 zero-scroll fit and visual containment on mobile portrait spectator |
| `media-appearance-stage/04_q1_voting_320x568.png` | 320×568 (Compact mobile) | Question 1 zero-scroll fit and visual containment on compact mobile spectator |
| `media-appearance-stage/05_q1_reveal_1920x1080.png` | 1920×1080 (16:9 Stage) | Interim Results scene reveal with dominant hero and ranked runners-up |
| `media-appearance-stage/05_q1_reveal_800x600_4_3.png` | 800×600 (4:3 Stage) | Interim Results scene zero-scroll fit on 4:3 projector display |
| `media-appearance-stage/05_q1_reveal_320x568.png` | 320×568 (Compact mobile) | Interim Results scene zero-scroll fit on compact mobile spectator |

