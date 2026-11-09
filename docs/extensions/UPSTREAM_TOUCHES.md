# Upstream touch ledger

Baseline upstream SHA: 5161eb7022144ee26d46a5f94cdbc714ec8b560d.

### Touch 1: `packages/socket/src/index.ts` (Startup Journal Recovery)
- **File and exact insertion point:** `packages/socket/src/index.ts` immediately after `initConfig()` at line 8.
- **Required capability:** Run `recoverStartupJournals(getPath)` at process boot before starting HTTP and WebSocket servers, ensuring incomplete writes and uncommitted media deletions recover deterministically before traffic arrives.
- **Alternatives considered:** Calling inside `initConfig()` in `packages/socket/src/services/config.ts`, but keeping `config.ts` free of `@razzia/extensions` imports preserves cleaner package architecture.
- **Maximum intended diff:** ~4 lines (import `recoverStartupJournals` and invoke with `getPath`).
- **Tests and compatibility evidence:** `extensions/src/server/media-library.test.ts`, `packages/socket/src/index.ts` startup lifecycle tests, all socket suite tests.
- **Merge risk:** Very low. Pure additive call before server startup; no modification of existing routing or handlers.
- **Owner approval:** Approved per P0 Final Targeted Repair specification (Gate A2).

### Touch 2: `packages/socket/src/api/routes/media.ts` (Transactional Media Deletion)
- **File and exact insertion point:** `packages/socket/src/api/routes/media.ts` in `.delete("/:name")` handler.
- **Required capability:** Execute media deletion as an atomic, quarantine-backed transaction (`executeMediaDeleteTransaction`) that protects media binary from partial detachment failure.
- **Alternatives considered:** Calling `deleteMedia` separately after `checkMediaDeleteSafety`, but crash or failure in `deleteMedia` left orphaned reference detachments with no recovery record.
- **Maximum intended diff:** ~10 lines.
- **Tests and compatibility evidence:** `extensions/src/server/media-library.test.ts`, `packages/socket/src/api/api.test.ts`.
- **Merge risk:** Very low. Preserves 409 Conflict contract and 204 No Content success semantics.
- **Owner approval:** Approved per P0 Final Targeted Repair specification (Gate A3).

### Touch 3: `packages/socket/src/services/game/round-manager.ts` & `packages/socket/src/services/game/index.ts` (Skip Duplicate `SHOW_START` When Authored Opening Scene Exists & Cumulative Answer Recap Aggregation)
- **File and exact insertion point:** `packages/socket/src/services/game/round-manager.ts` (`RoundManagerOptions.skipShowStartCountdown` and `RoundManager.start()`) and `packages/socket/src/services/game/index.ts` (`Game.buildActiveSceneData()`, `Game.getAnswerRecapSummary()`, and `RoundManager` options).
- **Required capability:**
  1. When a Studio show defines an authored `opening` scene at timeline index 0, skip the legacy 6-second `SHOW_START` countdown so the audience is not shown two consecutive start screens; when no authored `opening` scene is at step 0, preserve legacy `SHOW_START` countdown unchanged.
  2. Aggregate completed question history (`RoundManager.getHistory()` + `questionLedger`) up to the active `answerRecap` timeline step into a role-safe `PublicAnswerRecap` summary in `ActiveSceneData`.
- **Tests and compatibility evidence:** `extensions/src/server/studio-coordinator.test.ts`, `packages/socket` game tests.
- **Merge risk:** Low. Default-off when `skipShowStartCountdown` returns false or is omitted.

### Touch 4: `packages/web/vite.config.ts` (Serve `.json` Lottie Assets in Dev Media Middleware)
- **File and exact insertion point:** `packages/web/vite.config.ts` (`mediaMimeTypes`).
- **Required capability:** Add `".json": "application/json; charset=utf-8"` so user-uploaded `.json` Lottie files in `media/` are served with proper MIME type during local dev/E2E runs.
- **Tests and compatibility evidence:** `extensions/src/presentation/presentation.test.ts`, Playwright E2E suite.

### Touch 5: `packages/web/src/components/ToggleGroup.tsx`, `packages/web/src/features/quizz/components/QuizzEditorHeader.tsx`, `QuizzEditorSidebar.tsx`, `studio-editor-context.tsx`, `studio-scene-editor.tsx`, `QuestionEntranceConfig.tsx`, `studio-settings-page.tsx`, `MediaLibrary.tsx` (Studio Editor Grouping, Audio/Cinema Scenes, Motion Presets, Lottie Picker, Answer Recap)
- **File and exact insertion point:** Studio editor components under `packages/web/src/features/quizz/components/**` and optional `group` divider support in `ToggleGroup.tsx`.
- **Required capability:** Grouped contextual card-kind chooser in `QuizzEditorHeader.tsx` (preserving exact placement and `data-testid="toggle-kind-<kind>"`), `answerRecap` timeline support, audio/video/cinema scene authoring, 5 new stage motion presets + global inheritance + decorative question underline, and user-supplied Lottie upload/selection.
- **Tests and compatibility evidence:** `extensions/src/editor/editor.test.ts`, Playwright E2E suite.

### Touch 6: `packages/web/src/index.css`, `QuestionEntrance.tsx`, `AnswerButton.tsx`, `PhotoCardGrid.tsx`, `Question.tsx`, `GameWrapper.tsx` (Stage Motion Keyframes, Decorative Question Underline, Audio Ducking, Global Stage Animation Inheritance)
- **File and exact insertion point:** Stage presentation components under `packages/web/src/features/game/components/**` and CSS keyframes in `packages/web/src/index.css`.
- **Required capability:** Render the 5 new motion presets (`pop-bounce`, `wobble-settle`, `cascade`, `fan-flip`, `wipe-ripple`), inherit global stage animation defaults when card slot is `undefined`, render optional decorative question underline below the question title without affecting the authoritative cooldown/round timer, and suppress background loop audio when `media`/`opening`/`closing` scenes play foreground `video` or `audio`.
- **Tests and compatibility evidence:** `extensions/src/presentation/presentation.test.ts`, Playwright 8-viewport matrix.

### Touch 7: `pnpm-lock.yaml` (Official `@lottiefiles/dotlottie-react` Dependency in `@razzia/extensions`)
- **File and exact insertion point:** Root `pnpm-lock.yaml` lockfile entries for `@razzia/extensions` dependency `@lottiefiles/dotlottie-react@0.17.1` (and its transitive `@lottiefiles/dotlottie-web@0.52.2`, MIT license). Zero protected source files under `packages/**` are modified for the Cinematic Video + Multi-Lottie Overlays implementation (`studio-scene-editor.tsx` and `studio-editor-context.tsx` are downstream additions not present at `5161eb7022144ee26d46a5f94cdbc714ec8b560d`).
- **Required capability:** Official MIT-licensed Lottie/dotLottie runtime with self-hosted WASM (`dotlottie-player.wasm`) behind `extensions/src/presentation/lottie-player.tsx` to render complex Bodymovin `.json` and `.lottie` assets (masks, bezier paths, nested shapes, mattes, gradients, precomps, embedded raster images) offline without external CDN requests.
- **Alternatives considered:** Keeping the hand-written SVG subset renderer in `lottie-player.tsx`, which lacks support for complex masks, bezier morphs, mattes, precomps, and `.lottie` containers.
- **Maximum intended diff:** Lockfile resolution entries only (`pnpm-lock.yaml`) plus `extensions/package.json` (downstream).
- **Default-off compatibility:** Scenes without `lottieUrl` or `overlayAnimations` do not instantiate `LottiePlayer` or load the WASM runtime.
- **Tests and compatibility evidence:** `extensions/src/presentation/presentation.test.ts`, `extensions/src/core/lottie.test.ts`, `packages/e2e/tests/cinematic-video-overlays.spec.ts`.
- **Merge risk:** Very low. Scoped to `@razzia/extensions` workspace package.
- **Owner approval:** Explicitly mandated in `TADA_CINEMATIC_MULTI_LOTTIE_OVERLAYS_AGENT_PROMPT_2026-11-03.md` Section 2 ("Add one tested, pinned exact `@lottiefiles/dotlottie-react` version to the extension package (`extensions/package.json`) and update the minimum necessary `pnpm-lock.yaml` entries; document MIT license and the exact selected installed version").

### APPROVED & IMPLEMENTED — Tadazz branded stage motion hooks (2026-11-04)
- **Scope:** The owner explicitly approved all proposed integration and protected source edits in this conversation on 2026-11-04 ("מאשר הכל!!! יאללה בצע!!!"). The four listed web UI files were edited in isolated worktree `agent/tadazz-validated-20261104`; no scoring, telephony, timer, or socket sources changed.
- **Exact baseline:** Razzia v4.0.1 `5161eb7022144ee26d46a5f94cdbc714ec8b560d`, current target `7dd6519`. Baseline-to-current diff via `git diff --numstat 5161eb7 HEAD`: `GameWrapper.tsx` +619/-66, `states/Answers.tsx` +240/-63, `states/Responses.tsx` +335/-63. These files already contain substantial previous changes, so proposed changes increase upstream merge risk. `studio-settings-page.tsx` did not exist at baseline but still needs to preserve source Razzia controls and opt-in.
- **Hook A: `packages/web/src/features/game/components/GameWrapper.tsx`.** Symbols: `GameWrapper` `extensionState`, `effectiveBackground`, `showCustomCardBackground`, active `ScenePresenter` and main stage background layer around `<GameBackground />`. Required: use `resolveTadazzStageBackground` and `TadazzAnimatedBackdrop` only for `extras.defaults.tadazzBackground.mode='animated'` with per-card/background/media precedence; source `TADAZZ_IMAGE_URL` from bundler. If cinema video stage or card background active, pause/unmount the canvas. Target <20 additive lines; if more, stop for architecture review. No timers/controls touched. Alternatives considered: extension-only layer and CSS global injection cannot access correct authoritative GameWrapper stage epoch/role/scene or precedence; iframe/standalone HTML explicitly rejected by owner. Expected compatibility: legacy default unchanged; host/player/read-only /display share stage.
- **Hook B: `packages/web/src/features/game/components/states/Answers.tsx` (or a narrow compositional hook in existing player answer adapter).** Symbols: `AnswerComponent`, `currentVisuals`, `canSubmit`, `animationEpochKey`. Required: for opted-in **survey with 2–5 image options**, reuse existing answer IDs, `handleSubmit` and authoritative stage animations while visually displaying `TadazzSurveyCards`; otherwise render existing `AnswerComponent` unchanged. Likely 12–22 additional/modified lines: >20 **review trigger** if exceeded. Do not replace the player screen, answer registry or DTMF/scoring paths. Alternatives: renderer-only addition under extensions cannot mount until a minimal game-stage hook; changing `PhotoCardGrid` directly would modify protected baseline legacy visuals for all.
- **Hook C: `packages/web/src/features/game/components/states/Responses.tsx`.** Symbols: existing `PhotoCardGrid` branch, `isSurvey`, `revealDistribution.revealStartedAt`, `stageAnimations`, `animationEpochKey`. Required: render `TadazzSurveyCards` only with explicit Tadazz opt-in and 2–5 image answers; use server vote totals/percentages/start time; preserve original `PhotoCardGrid` otherwise. 12–20 additive lines anticipated; show all 5 images in original order while percentages rise; zero votes and ties supported. No delay in personal SHOW_RESULT; no new scoring. Alternatives: only extension React display cannot replace current protected branch without a hook. Keep single responder-specific React component instance per epoch.
- **Hook D: Studio Settings native editor.** Existing downstream `packages/web/src/features/quizz/components/studio/studio-settings-page.tsx` (not present in baseline but part of the source UI). Required: render only original Razzia Button/Select/Input and i18next 8 locales; opt-in to `defaults.tadazzBackground` Original / Tadazz Animated / Static Image, bounded intensity, paused/static and preview, existing media picker safe URLs. Possible as extension-owned editor panel mounted by tiny composition hook; no duplicate editor. Estimate TBD only after testing extension-first composition. **Requires exact review before touching UI**.
- **Scene leaderboard improvement:** all new `TadazzLeaderboard` is in `extensions/presentation`; it must be opted in, not replace legacy leaderboard automatically. New scene-presenter extension may consume it once show appearance is available via an approved narrow prop or provider.
- **Review and acceptance:** `git status --short`, `git diff --name-status 5161eb7 HEAD`, `git diff --numstat 5161eb7 HEAD` before any protected edit and again before commit. Browser 1920x1080 / 1366x768 / 800x600 / 390x844 / 320x568, 5 real images, normal vote/tie/zero vote/Previous/Skip/reconnect, full-screen MP4 overrides, per-card custom, reduced-motion, Razzia legacy extension-off, eight existing locales, XLSX/JSON/bundle/clone reload; no flicker/scroll/clipping, stable epoch, no incorrect reveal before countdown. No push/merge/deploy.
- **Owner approval:** **GRANTED on 2026-11-04**, in direct response to the above requested protected-file hooks. Implemented in isolated worktree only; peer review/merge/deployment remain separate. Build: Web+Socket succeeded; 19 focused tests and 2 Excel/JSON round-trip tests passed; Playwright rendered UI validated at 1920x1080, 1366x768, 800x600, 390x844, 320x568 (5/5) with square art, no overflow, authoritative example percentages/leader. Tests used a dedicated visualization harness, not full multiplayer/telephony E2E. Baseline extension TypeScript still has 97 pre-existing errors.

### APPROVED & IMPLEMENTED — TADAZZ full-show native stage hooks (2026-11-05)
- **Task:** `docs/extensions/orchestration/prompts/TADAZZ_FULL_SHOW_AGENT_PROMPT_2026-11-05.md` + binding owner instruction for 100% native React + TypeScript/TSX + CSS port (zero `iframe` / zero runtime HTML). Canonical HTML SHA-256 `1eea4698bc97080c7fc82f5c0376a6ac8c6efb25a8223a178062628fa14a8669`. Worktree `tadazz-full-show`, branch `agent/tadazz-full-show-20261105`, base `57db9e7`.
- **New, unprotected downstream modules:** `extensions/src/presentation/tadazz-show/**` (1:1 React + TypeScript + Web Animations API port of `TadazzMotion` + CSS, `TadazzStage`, `TadazzOpening` MP4+Lottie compositor, `presentation-scene`, `show-director`, unit tests), `packages/web/src/features/game/components/tadazz-show/**` (`TadazzShowView`, `TadazzScreens`, `TadazzAnswerPad`, `useTadazzLabels`, `raw-status-context`), `packages/web/public/tadazz-show/**` (MP4, Lottie, extracted backdrop/logo). Legacy `Room.tsx`, `Answers.tsx`, `Responses.tsx`, `Leaderboard.tsx`, `Podium.tsx`, `GameBackground.tsx` are NOT edited and remain on disk for rollback.
- **Hook T1 — `packages/web/src/features/game/components/GameWrapper.tsx`, symbol `GameWrapper` (just before final `return (`).** Baseline-to-current: +786/-65. Patch: 1 import + 1 early return `if (isTadazzShowActive(extensionState)) return <TadazzShowView ... />` (+17 added lines, 0 changed existing lines). Effect: in a TADAZZ show `<GameBackground />`, legacy stage children, and legacy overlays are never mounted (eliminates first-frame Razzia flash at the root across manager/player/display).
- **Hook T2 — `packages/web/index.html` (unmodified since baseline `5161eb7`).** Patch: +1 inline `<script>` line setting `document.documentElement.style.background='#08011a'` on `/^\/(party|display)(\/|$)/` before CSS/JS/branding hydration. Editor and other routes are untouched.
- **Activation / rollback:** Active by default for all games via `isTadazzShowActive()`; per-show rollback via `defaults.motionKit = "legacy"`.
- **Tests:** 39/39 extension unit test files (438 tests), 24/24 root unit test files (321 tests), 28/28 core live game E2E tests, and 6/6 full-show parity E2E tests (`tadazz-full-show-parity.spec.ts` across Chromium and WebKit iPad).
- **Owner approval:** **GRANTED 2026-11-05 14:52** in Antigravity conversation `c4229ed5` (T1 and T2 hooks, default activation with `motionKit="legacy"` rollback, git push + safe production deploy to `https://tadazz.com` after backup + Asana update).

## 2026-11-08 — isolated source cleanup and Show Theme Engine

Current worktree: `tadazz-cleanup-theme-20261108`, branch
`codex/upstream-cleanup-theme-engine-20261108`. Owner explicitly requested source
cleanup followed by the supplied theme-engine prompt in a separate worktree.
The pre-edit plan and necessary server observation were recorded in
`orchestration/handoffs/tomer/CLEANUP_THEME_20261108.md`.

| Original file / symbols | Necessary change and alternative | Verification / scope |
| --- | --- | --- |
| socket `services/game/index.ts`: roster operations, interim/recap projections | Delegate downstream identity/projections to extensions; keep authorization and player mutation in Game. Moving the entire game was rejected. | Root regression, new roster/projection boundary tests. Phase 1 reduction captured in the source ledger. |
| socket `services/game/round-manager.ts`: reveal distribution | Extract pure downstream projection only; preserve authoritative round/scoring. | Root + distribution tests. |
| socket Game `getVoteCompletionReason`, `abortCooldown`; RoundManager `newQuestion`, `advance`, `endTimer`, `checkAllAnswered` | Read-only annotation of existing completion paths; client deadlines cannot distinguish a delayed manual completion. No scheduler/score/abort ordering change. | 3 real Game tests + browser manual/natural/skip/restart audio traces; phase-2 addition about 20 lines combined. |
| web `GameWrapper.tsx`: modern early return | Inject typed ShowThemeRenderer and the existing view props. No new transport or game state owner. Hardcoded family conditionals rejected. | Role parity, refresh, first-paint RAF probes, isolated legacy rollback; approximately +26/-19 before formatting. |
| web `QuizzEditorSidebar.tsx`: TimelineSceneCard | Downstream scene card extraction with injected original AlertDialog and translation wrapper. Remove only imports made unused by the extraction. | Editor browser save, actual app typecheck. |
| web `QuestionEditor/MediaLibrary/index.tsx`: built-in audio list | Optional event-owned URL whitelist and manifest assets, retain user uploads. A combined legacy/global preset gallery was rejected. | Studio/audio browser checks; no original media API change. |
| web `QuestionEditorConfig/{CardBackgroundConfig,CardAudioConfig,QuestionEntranceConfig}.tsx`: exported wrappers | Active-theme controls in extensions/downstream Studio; retain original implementations for explicit legacy rollback. | Classic/legacy browser tests, strict save/reopen, localized choice tests. |
| web `index.css`, editor media helper callers, `i18n.ts`, original locale JSONs | Move downstream keyframes/helpers/translation additions out; restore upstream translation files byte-for-byte. | 8-locale merge/idempotence checks and root locale suite. |

For **every original file still modified**, exact baseline/current line totals,
hunk anchors and upstream-overlap risk are listed in the generated
`qa-evidence/upstream-cleanup-20261108/SOURCE_LEDGER.md` (and its JSON). The ledger
also documents the intentionally retained modifications: wholesale rollback of
prior product work is not this cleanup. Current upstream v4.0.2 merge rehearsal
conflicts at `pnpm-lock.yaml`; upstream was not merged into the product branch.

The new Studio, theme adapter and extension files were absent from original
Razzia `5161eb7`; they are downstream additions, not additional modified original
files. Original motion keyframe/timing files remain unchanged by this task.


### 2026-11-08 continuation — exhaustive review and durable installation

The owner requested review of every historical original and remote-only game/
browser verification. The authoritative union is now the 113 per-file records
in `UPSTREAM_REVIEW_COMPLETE_2026-11-08.json`: all historical 96, the updated
96, and the synchronized billing configuration hook. Twenty reviewed originals
are byte-exact to baseline; 93 retain documented seams. The generated current
ledger is `qa-evidence/remote-cleanup-theme-20261108/source-review/`.

New essential protected seams: socket API mounts `/themes`; Game captures one
approved account-scoped definition and includes its media references in existing
room authorization; Vite delegates accounts-mode media to the authenticated
backend through an owned policy. Alternatives of global registry mutation,
public private-media aliases, uploaded code execution and duplicating the game
engine were rejected. Implementations live in owned theme/install/preview modules.

Latest committed billing work was merged into this isolated branch. Its phone
admission/metering is injected into the already extracted phone controller;
roster identity is shared between billing admission and the recorded join. The
extracted Game implementations were not reintroduced during conflict resolution.
Billing remains OFF in theme/legacy QA; its own synthetic suite verifies ON mode.

Current upstream 4.0.2 merge rehearsal now reports Dockerfile AND pnpm-lock.yaml
conflicts, superseding the earlier one-conflict observation above. The actual
candidate Dockerfile, frozen install, nginx syntax, isolated startup/private-route
checks and source regression are recorded in the current QA evidence. No main
merge, push, production activation or Asana write is part of this continuation.


## Portable package runtime — 2026-11-09

Authorized by the supplied Universal Package Runtime development plan. Pre-edit
file/symbol/rationale/test decisions are recorded in
`PACKAGE_RUNTIME_ADR_2026-11-09.md`; this is the final ledger index.

- Socket `api/index.ts`: mount the default-OFF authenticated package lane.
- Socket `theme-routes.ts`, `services/theme-installation.ts`: compose private
  catalog/version pins and media; recognize only signed, expiring package-preview
  capabilities for decoded staging media. Existing theme publication stays intact.
- Socket `media-read.ts` and theme media response: m4a/lottie MIME support without
  changing account/room authorization.
- Web `ConfigManageQuizz`, `configurations/index.tsx`, installed-theme catalog:
  native package panel, explicit authenticated preview link and catalog refresh.
- Web show adapters, `TadazzShowView`, `GameWrapper`: one generic sandbox adapter
  and optional stage surface, public snapshots using the existing clock, original
  answer/audio handlers and original-stage fallback. No uploaded renderer import.
- Verification: package browser suite in both engines, current native UI and
  upstream editor/flow/manager suites, root/extension units and five TS projects;
  exact results and baseline failures in `PACKAGE_RUNTIME_ACCEPTANCE_2026-11-09.md`.

No changes to scoring, server clock, game transport, telephony or common wire.
No production enablement/deployment. All executable verification stays in private
Oracle QA.
