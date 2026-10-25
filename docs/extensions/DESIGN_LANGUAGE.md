# Source-grounded Razzia design language

> **MANDATORY FOR CURRENT TOMER P0:** Read `orchestration/P0_ONE_AGENT_UI_FIDELITY_2026-10-26.md` and inspect the live source of original components, tokens and Rubik typography. Every new roster/player-status/import/settings UI must be visually indistinguishable from native Razzia, never a new design system. Verify with real-browser screenshots, not only logic tests.

Baseline: upstream commit 5161eb7022144ee26d46a5f94cdbc714ec8b560d (v4.0.1).
Primary sources: packages/web/src/index.css, branding.ts, main.tsx, components/, features/game/components/, features/quizz/components/.

## Visual system

- Tailwind CSS v4 with CSS theme variables; primary #FF9900, secondary #1A140B, light background, gray foreground/muted surfaces; correct uses green-500.
- Answer colors (A-D): #E69F00, #56B4E9, #3DBFA0, #CC79A7.
- Typography: Rubik Variable loaded in main.tsx, --font-display and font-display; semibold/bold actions and headings.
- Base UI: Button, Input, Select, Switch, ToggleGroup, Combobox, Card, AlertDialog, Tooltip, PinInput. Reuse upstream, do not clone.
- Radius: button rounded-lg, cards rounded-xl; subdued borders/shadows. Lucide icons; Radix primitives; clsx/tailwind-merge.
- Motion: motion/react and CSS keyframes anim-show, anim-timer, anim-quizz, anim-balanced, spotlight. Keep energetic playful pacing and presenter readability.
- Branding override is supported by packages/web/src/branding.ts and optional /branding/theme.json; preserve this system.

## Screens

- Auth and manager pages in packages/web/src/pages/(auth) and /manager.
- Quiz editor in packages/web/src/pages/manager/quizz and features/quizz.
- Host/player live game in packages/web/src/pages/party and features/game.
- Game statuses: SHOW_ROOM, SHOW_START, SHOW_PREPARED, SHOW_QUESTION, SELECT_ANSWER, SHOW_RESULT, SHOW_RESPONSES, SHOW_LEADERBOARD, FINISHED, SUMMARY, WAIT.

## Localization

i18next + react-i18next + browser detector. Five namespaces: common/errors/game/manager/quizz; eight languages en/fr/de/es/it/ja/tr/vi. New extensions must register translations without overwriting upstream keys. Missing keys fail CI.

## Acceptance

Compare new UI with existing components for font, palette, padding, focus, disabled/hover, animation and presenter legibility. Screenshots require actual browser testing; this document is code-grounded, not a screenshot audit.
