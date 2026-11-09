> Historical branch handoff recovered during synchronization. The evolved implementation
> is already integrated; current theme/legacy rules and the 8 November QA report supersede
> the historical status and pending integration requests below. Do not reactivate old presets.

# Tadazz Motion — protected integration gate (2026-11-04)

## Status and scope

Safe implementation exists exclusively in `extensions/**` on isolated branch
`agent/tadazz-motion-20261104` based on `agent/tomer/wave2@7dd6519`.
Source assets are Goldy's original `background.png`, `index.html` and `README.txt` from 04 Nov.
**Not deployed, merged, pushed, or enabled in any existing show.** No protected upstream files were edited.

## Safe extension components implemented

1. `core/tadazz-appearance.ts` — optional show-level background schema, safe static URL and
   priority: full-screen cinema video > per-card override > opt-in show theme > original Razzia.
2. `presentation/tadazz-backdrop.tsx` — relative to source 1920x1080; still image,
   four beams, edge glows, glints, floor/light shimmer and 34 particles (30fps limit,
   visibility cleanup, ResizeObserver, reduced motion).
3. `presentation/tadazz-answer-cards.tsx` — one responsive group for 2–5 choices,
   image/label/number as single animated parent; image aspect-ratio 1; no server vote mutation;
   percentages remain in their original card positions; reveal after server start, tie/zero votes
   handled by the existing poll-ranking engine.
4. `presentation/tadazz-leaderboard.tsx` — server-authoritative ranks and points with
   motion animations. Existing legacy `states/Leaderboard.tsx` is unchanged.
5. `presentation/tadazz-zz-transition.tsx` — CSS/SVG _placeholder_ for named `tadazz-zz`
   animation scene; **NOT the brand's finished layered Lottie**. Prefer authentic user-supplied Lottie.
6. Extension ScenePresenter has `tadazzThemeEnabled` **default false**. It uses new cards for
   a 5-image interimResults scene and new ranking rows only when explicitly opted in.
7. `defaults.tadazzBackground` typed in Studio V2; backed through friendly JSON and
   workbook `tadazzBackgroundJson` import/export, native conversion and bundle.

## Protected files that still need independent owner approval

Upstream baseline: `5161eb7022144ee26d46a5f94cdbc714ec8b560d`.
These are protected under `AGENTS.md` / `docs/extensions/WORKING_RULES.md`.
**This document is a proposed change request, NOT approval to edit them.**

- `packages/web/src/features/game/components/GameWrapper.tsx`:
  Introduce one bounded extension-owned background-adapter mount where `GameBackground`
  currently sits. Pass authoritative show defaults + per-card background and actual
  cinematic full-screen status. Exclude cinema and card background from drawing ambient
  effects; ensure every host/player/spectator shares one stage background. No new game engine,
  no iframe, no direct DOM mutation. Review trigger: likely >20 integration lines; alternative
  attempted: extension-owned exported wrapper, but the existing GameWrapper does not expose
  an injection slot. Requires architectural review.
- `packages/web/src/features/game/components/PhotoCardGrid.tsx` and
  `states/Answers.tsx`, `states/Responses.tsx`:
  Opt-in the extension `TadazzSurveyCards` via a **minimal delegation** when the show
  explicitly uses Tadazz + exactly five image answers. Legacy path remains unchanged,
  including quiz correctness and text/multi/estimations. Preserve real user voting,
  authoritative Results timeline, DTMF numbering, valid (non-photo) fallbacks.
  The existing PhotoCardGrid had three-plus-two wide layout and delayed percentages;
  avoid copy-pasting a second polling engine into protected files.
- `packages/web/src/features/quizz/components/studio/studio-settings-page.tsx`
  or its actual controlling settings component:
  Add a native Razzia Settings field (Original/default, Tadazz Animated, Static Custom),
  intensity, pause/static preview. Use the already defined `defaults.tadazzBackground`
  schema and same shared MediaLibrary. Do not redesign the editor or move ToggleGroup.
  Confirm whether this file existed in baseline before editing.
- `packages/web/src/features/game/components/GameWrapper.tsx` at `<ScenePresenter>`:
  Pass the `tadazzThemeEnabled` opt-in derived from the server-authoritative show setting.
  The extension renderer defaults OFF until this handoff happens.

Before editing each baseline-protected file, append its exact symbol/line, baseline-to-current
diff, failed alternative, minimum patch and explicit approval to `UPSTREAM_TOUCHES.md`.
If patch exceeds 20 lines or changes base semantics, obtain separate architectural review.
Do not use this implementation work as generic authorization to alter original Razzia.

## Acceptance gates (must pass before any local merge or event use)

- Screen role parity: host, player, read-only /display; websocket refresh/reconnect.
- Five square images at 1920x1080 in one row, fallback 3+2 or 2+3 on narrow widths, 4:3
  no clipping/scroll; labels and images always move with parent card; actual vote updates.
- Poll result percentages animate in place to authoritative values; tied options equal,
  zero vote declares no winner. Quiz success colouring unchanged when Tadazz is off.
- Precise background priority: MP4/whole-stage Lottie suppress ambience; per-card custom
  suppresses; default legacy unchanged. Reduced-motion/disconnected/suspended tab fallback.
- Original editor controls, 8 languages, JSON/XLSX/bundle round-trip; save/clone/reorder.
- Test 1920x1080, 1366x768, 800x600, 390x844, 320x568, stage + telephony; verify
  no input blocking, overflows, double animations, leaks and event-hour frame rate.
- Brand-specific logo Lottie assets not supplied/accepted: user-authored file still needed.

## Verification recorded in this isolated branch

- Source-grounded module tests and workbook round-trip have passed.
- Root production `pnpm build` has passed during implementation.
- Actual client live browser end-to-end and 8-locale acceptance are **not signed off**.
- No push/merge/deploy; the protected Razzia stage is **not yet switched to the new theme**.
