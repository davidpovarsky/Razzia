# Tada P0 - mandatory original UI/component/typography fidelity (26 Oct 2026)

**ACTIVE P0 RULE FOR TOMER. READ BEFORE BUILDING ANY P0 SCREEN.**
This document implements the user's one-agent P0 prompt, supplied in Tomer's conversation as `TADA_ONE_AGENT_TOMER_COMPLETE_P0_2026-10-26.md`. The task is to EXTEND the existing Razzia/Tada interface, NEVER to introduce a new design language, dashboard theme, component kit or typography system. Applies to every new control, panel, modal, field, import table, roster view, counter, status indicator and error/empty/loading state, in BOTH quiz editor and live game.

## Source of truth (inspect the real current files before coding)
- `packages/web/src/index.css`: Tailwind v4 CSS theme tokens, spacing and animations; default `--font-display: "Rubik Variable", sans-serif`; colors `primary`, `secondary`, `background`, `foreground`, `muted`, `accent`, answer 1-4 and `correct`.
- `packages/web/src/main.tsx`: imports `@fontsource-variable/rubik/wght.css`, loads branding, initializes app; `packages/web/src/branding.ts` applies user theme overrides, including font and colors. New UI must inherit the active brand, not hard-code a separate theme.
- `packages/web/src/components/`: use EXISTING `Button`, `Input`, `Card`, `Select`, `Switch`, `ToggleGroup`, `Combobox`, `AlertDialog`, `Tooltip`, `PinInput`, form helpers etc. See their actual classes, variants, focus, disabled and hover states before composing additions.
- `packages/web/src/features/game/components/GameWrapper.tsx`: original common host/player stage and bottom controls, including the current bottom player count; extend in place.
- `packages/web/src/features/game/components/ManagerControlToolbar.tsx`: existing host toolbar, controls and keyboard-shortcut guard.
- `packages/web/src/features/game/components/GameSettingsModal/index.tsx`: existing `radix-ui` Dialog patterns, typography, backdrop, spacing, layout and form integration.
- `packages/web/src/features/quizz/`, `packages/web/src/pages/manager/quizz/`: existing quiz editor structure and field layout. Add roster management/import WITHIN those patterns.
- `docs/extensions/DESIGN_LANGUAGE.md`: original documented visual rules; current React/CSS source prevails over any outdated examples.

## Non-negotiable implementation rules
1. **Components:** reuse upstream Razzia shared React components and existing Radix primitives. Compose any missing element using those foundations and adjacent screen conventions. No parallel `ui/` design system, no replacement Button/Input/Modal, no Shadcn/MUI/Bootstrap/Ant or embedded independent app.
2. **Typography:** use the app's current Rubik Variable display/body conventions, inherited `--font-display` and existing Tailwind type scale and weights (`font-semibold`/`font-bold` where comparable). Respect branding overrides. Do not import/select another font, inject per-feature `font-family`, or introduce unrelated heading/table/label scales.
3. **Color and shape:** use Tailwind `bg-primary`, `text-foreground`, `bg-background`, `border-accent`, `text-muted-foreground`, etc. plus established host translucent white/black stage controls as appropriate. Honor branding overrides. No new arbitrary HEX palette, gradients, glass/3-D/neon styling, or invasive edits to global CSS; mirror original rounded-lg/rounded-xl, paddings, borders/shadows and hover/focus/disabled states.
4. **Iconography and motion:** use existing `lucide-react` icon sizing/stroke conventions and existing `motion/react` / Razzia transitions when needed. No new icon/animation package or unrelated visual embellishment. Preserve stage readability and timer behavior.
5. **Placement and interaction:** host Players/Status must be part of existing `GameWrapper`/manager toolbar patterns and reachable in ALL phases; panel must be manager-only and never replace/disrupt stage or projector/player UI. Quiz roster + XLSX/CSV preview should fit existing editor/game-settings patterns; scrolling tables, imports and confirmations behave like native Razzia controls.
6. **Data visibility:** FULL numbers are mandatory within the AUTHENTICATED host roster, with numbers selectable and LTR even beside Hebrew names; never display the private contact book to participant/projector screens. The user's full-number requirement does NOT authorize public exposure.
7. **Localization:** preserve all existing eight UI locales (en/fr/de/es/it/ja/tr/vi) using i18next and existing namespaces/extension translations; use meaningful translated labels for every new state. Support mixed-direction Hebrew player names and LTR `+972`/`+44` phone text without forcing a new global Hebrew locale or changing overall layout direction.
8. **Accessibility:** use labels, focus states, keyboard focus trap and Escape behavior from existing Radix patterns; opening status/import panels must not trigger host Space/Enter game commands; new buttons use existing sizes and disabled states.
9. **No redesign:** do not change existing stage visuals, fonts, colors, buttons, toolbar hierarchy, backgrounds, game animations or layout outside the smallest necessary additive hooks. Never substitute a generic admin dashboard look for Razzia.

## Mandatory visual acceptance (not just unit tests)
- In a REAL running app/browser, compare new host panel, editor roster, game settings, import-preview/errors and bottom count against adjacent ORIGINAL Razzia UI (font, weights, sizing, palette, controls, spacing, radius, hover/focus, responsiveness).
- Test desktop plus a narrower browser width; eight existing locales; mixed Hebrew+international-number samples; keyboard use while a live game timer runs; close/reopen without advancing the game.
- Capture actual Playwright/browser screenshots and record file paths. A fake standalone HTML/React mock or `page.setContent()` is NOT acceptable proof.
- In P0 handoff, provide a short "Original UI fidelity" checklist listing reused components, inherited Rubik/theme tokens, screenshot paths, and any unavoidable new primitive with justification. If visually inconsistent, correct BEFORE declaring Gate 2 PASS.

**Precedence:** The newer user-supplied one-agent P0 prompt overrides old V3 multi-agent/offline-only/ownership restrictions for this scoped delivery. All safety, no-secrets, no-unauthorized-push/deploy/purchase and unrelated-worktree prohibitions remain. This UI fidelity contract is mandatory alongside that prompt, not a replacement for its telephony/backend requirements.
