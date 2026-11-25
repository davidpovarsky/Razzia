# Tadazz motion integration handoff — 2026-11-04

## Location and invariants

- Isolated worktree: `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-validated`
- Branch: `agent/tadazz-validated-20261104`; base `7dd6519` (no cherry-pick/merge/push/deploy).
- No existing Razzia `packages/**` source edited. All implemented code is under `extensions/**`.
- Existing branded show defaults stay `original`; all Tadazz visuals **opt in** per show.
- Source image and animation demo are exact originals supplied by the user; stored in `extensions/assets` for future reference (never mount HTML/iframe inside Razzia).

## Implemented extension modules

1. `core/tadazz-appearance.ts`: typed `tadazzShowBackgroundSchema`, show-level original/animated/static; safe URL for custom image; intensity/pause/cover/contain; resolver prioritizes fullscreen video and per-card overrides over the general branded background; reduced-motion static image.
2. `core/studio-timeline-schema.ts`: optional `defaults.tadazzBackground` (additive to V2).
3. `presentation/tadazz-backdrop.tsx` + scoped CSS: 1920x1080 origin-accurate image and ambient effects: four beams, edge glows, glints, floor/bulb shimmer and 34 deterministic canvas ellipse particles. Same artboard scaled to fit/crop; 30 fps budget, reduced motion, visibility pause, ResizeObserver cleanup; standalone React, no iframe/demo UI.
4. `presentation/tadazz-answer-cards.tsx` + scoped CSS: 2–5 reusable cards, five across on wide screens, image aspect-square with object-contain, label with card, responsive alternatives, stable epoch keys, separate slot animation with stagger; percentages animate on stable cards using existing Razzia reveal timeline, leader/tie/zero-vote support, no quiz correctness treatment in a survey.
5. `presentation/tadazz-leaderboard.tsx`: opt-in enhanced stage leaderboard using installed motion/react (reordering/spring score) and server-projected ranks (no client scoring).

## Integration still requires exact scoped owner approval

Per `docs/extensions/WORKING_RULES.md`, the broad feature request alone is **not** authorization to change protected upstream files. Before implementing each hook, append exact baseline diff/line estimates to `docs/extensions/UPSTREAM_TOUCHES.md`, get owner sign-off for specific paths, and keep each hook tiny/default-off.

Suggested hooks, only if no downstream composition/registry replacement exists:

- `packages/web/src/features/game/components/GameWrapper.tsx`: stage-background layer between original `GameBackground` and stage content using `TadazzAnimatedBackdrop`, with full-screen-video, card-background, and per-show defaults already available in authoritative extension envelope. Expected ~10–18 additive hook lines, review if larger; no change to scene or timer logic. Verify role parity and 16:9/4:3.
- `packages/web/src/features/game/components/states/Answers.tsx` or existing `SingleAnswers` extension point: one conditional opt-in use of `TadazzSurveyCards` only for 2–5 image answers; otherwise leave original `AnswerComponent` untouched. Pass authoritative epoch and selection handler. Expected ~10–18 hook lines.
- `packages/web/src/features/game/components/states/Responses.tsx`: one conditional opt-in `TadazzSurveyCards` for survey image responses; pass authoritative `revealDistribution.revealStartedAt`, voting totals, current epoch; otherwise original `PhotoCardGrid`. Expected ~10–18 hook lines. Never delay player results.
- Studio settings currently need a native Razzia form for `defaults.tadazzBackground` (original/animated/static, intensity, pause, preview) with zero global override. Prefer downstream `extensions/editor` and only a small approved mounting hook in the native editor. Verify XLSX/friendly JSON/bundle are lossless (schema change alone is not proof).
- Branded ZZ logo Lottie is customer-supplied; do **not** fabricate assets. Reuse existing `CinematicLayerStack` and Lottie media library; run owner-art QA after receiving actual logo layers.

## Required acceptance before event

- Browser host/player/spectator true game with 5 images, single winner, tie, zero votes, Previous revote and Skip, no re-entry on websocket vote counts.
- Sizes 1920x1080, 1366x768, 800x600, 390x844, 320x568; no stage scroll/clipping or distorted images.
- Explicit per-card background and full-screen MP4 suppress/stop the general animations. Restore branded background on next card without frame flash; tolerate missing image and reconnect.
- 8 locales; no new raw hard-coded gameplay strings; reduced motion and low power; game timer and phone DTMF unchanged.
- JSON/XLSX/enhanced bundle import/export/clone/reload, no changes to legacy Razzia shows, browser screenshots/traces.
- Do not mark Asana/QA as complete until independent browser and owner approval.

## Integration approval and implementation update

Owner approved the proposed protected-file hooks in the current conversation on 2026-11-04. Hooks are implemented on branch `agent/tadazz-validated-20261104` in `GameWrapper.tsx`, `states/Answers.tsx`, `states/Responses.tsx`, `studio-settings-page.tsx`, and extension `scene-presenter.tsx`; no scoring or telephony code changed. See `TADAZZ_QA_RESULTS_2026-11-04.md` for verification, uncovered legacy issues and remaining live-multiplayer QA. The earlier 'still requires approval' text above is historical and no longer the gate; merge/deployment approval and end-to-end acceptance are separate.
