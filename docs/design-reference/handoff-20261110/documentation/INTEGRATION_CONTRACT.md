# TADAZZ new site: audited implementation contract

## Checked on 2026-11-10

- Source branch: `codex/tadazz-package-runtime-20261109` at `18d3c9d`.
- Isolated working branch: `feat/tadazz-site-library-parity-20261110` at dedicated worktree.
- React 19, Vite 8, TypeScript, Tailwind 4, `motion`, `radix-ui`, `lucide-react` already present in `packages/web/package.json`.
- Original prototypes are **not** React, not authenticated, and contain static sample games, simulated prices/checkout, and browser localStorage state. Do not run their embedded scripts as the production app.
- The existing React editor is `StudioShell` on `/manager/quizz` (new) and `/manager/quizz/$quizzId` (edit). Keep its code unchanged.
- Real quizzes are loaded via `quizzListQuery()` returning `data.quizz`, not the prototypes' `seed` or `games` constants.
- Both approved HTML files and assets are preserved as **frozen visual references**, with hashes in the asset manifest.

## Screen inventory to reproduce 1:1 (ORDER LOCKED)

### Public marketing HTML: `TADAZZ-Animated-Modern.html`

1. Global header / navigation, logged-out + logged-in states
2. Home hero: **Make it a show.** / stage Z artwork
3. Home section: **How will you play?** — Ready to play / Make it yours / Start fresh
4. Home section: **Find your show.** — featured three game cards
5. Home section: bespoke custom show CTA
6. Game library (store): filter/search/cards
7. Game detail: cover, facts, actions, feature info
8. Try-a-round demo and results
9. How it works
10. Pricing / capacity estimator (illustrative; real billing is a separate integration)
11. Custom shows / contact
12. Account-dependent Studio/Events/Prepare/Checkout paths as appropriate
13. Global footer

The HTML's sample **editor** is a demonstration only, not a spec for replacing the real TADAZZ editor.

### Signed-in workspace HTML: `TADAZZ-My-Studio-Modern.html`

1. Sidebar: Dashboard / My Games / Explore Games / My Events / Account & licences
2. Topbar: page title / search / help / Create game / account
3. Dashboard: welcome hero, pick-up tiles, My games
4. My Games: list/filter/search/duplicate/edit (must use real data)
5. Explore Games: library and preview; template copy must use real backend
6. My Events
7. Account & licences (use actual account and billing sources)
8. Event licence / checkout (never present mock amounts as real pricing)
9. Show preparation, existing manager and presenter routes

### Invariants

- Preserve wording, section order, imagery, composition, animations, responsive breakpoints and component density from the approved source — no redesign.
- Use real React components and state. **Do not ship iframes** or the source HTML's `innerHTML` handler as the new production implementation.
- Isolate prototype CSS from all existing editor and game screens.
- Never modify the live game editor, player flow, presenter screens, billing logic, server deployment, or production DNS as part of this branch.
- Reuse backend APIs / account gates; do not substitute fake accounts, localStorage persistence, illustrative prices or simulated purchases.
- Preserve original assets and source mappings; keep third-party source ledger honest.
- No deploy or merge until verified.

## Required acceptance before changing the default home screen

- Each route/section in both inventories implemented in real React.
- Screenshot comparisons at 1440x900, 1024x768, 390x844 against both frozen HTML references. Review first visible viewport and full-page, spacing and typography, color, state transitions.
- Keyboard/mobile navigation, accessible focus, reduced-motion option, and no hydration/JS errors.
- Verify authenticated/guest paths, real quiz list, creation and edit deep links. No mock checkout.
- Run typecheck, lint, unit tests, browser tests and check no editor files were changed:
  `git diff --name-only codex/tadazz-package-runtime-20261109 -- packages/web/src/features/quizz/components/studio packages/web/src/pages/manager/quizz`.
- Keep this branch isolated until acceptance; no automatic deployment.

## Current status

**Source acquisition / assets / source ledger / an upstream Magic UI component staged.** Native React page migration and pixel-level acceptance have **not** been completed. Do not claim the two HTML prototypes are already integrated as production pages.
