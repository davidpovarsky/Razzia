# TADAZZ React UI migration — verified status (2026-11-10)

## Repository isolation

- Local branch `feat/tadazz-site-library-parity-20261110` in its own Git worktree; based on `codex/tadazz-package-runtime-20261109` (`18d3c9d`).
- No merge, no push, no public site or production deployment. The GitHub repository is PUBLIC, so this branch has intentionally **not** been published pending a commercial code-use review and permission to expose design/source files.
- All original source files, image assets, style sheets, source checksums and screenshot baselines are in `docs/design-reference/`.
- Both new React routes are **preview-only** and do not replace the current homepage: `/site` and `/site/studio`.
- Original quiz editor remains untouched: `/manager/quizz` and `/manager/quizz/$quizzId`.

## Working React preview implementation

- Marketing `/site`: original stage hero ("Make it a show."), "How will you play?" three cards, featured three games, custom show CTA and footer in matching order; internal catalogue, search/filter, product view, demo round, how-it-works, pricing placeholder and custom enquiry placeholder.
- Studio `/site/studio`: sidebar, page topbar, dashboard welcome card, my-games list/empty state, explore games, events, account/licences and a prepare checklist. Actual manager quiz list uses `quizzListQuery()`; new/edit deep links use the existing quiz editor.
- Original static HTML sample data remains limited to the marketing demonstration. Neither event licence payments, template copying, pricing nor enquiry transmission are wired to real services. The UI explicitly states when a flow is not connected.
- CSS isolated within a ShadowRoot, original fonts/artwork/colors available. This separation prevents the new styles from affecting quiz editor and presenter CSS.
- Real sourced code from Magic UI `BorderBeam` used in the marketing stage; real Hover.dev `Hover Tilt Card` algorithm used in marketing game card hover. See [COMPONENT_SOURCES.md](./COMPONENT_SOURCES.md) for original file hashes, modification ledger and licences.

## QA baselines

- Reference screenshots (frozen HTML): `screenshots/*-reference-1440.png` and `screenshots/*-reference-mobile-390.png`.
- React screenshots: `site-1440.png`, `site-1024.png`, `site-390.png`, `studio-1440.png`, `studio-1024.png`, `studio-390.png`. These are from isolated browser preview, NOT production.
- **Browser smoke passed after the library integrations and header/sidebar refinements**, covering marketing home at 1440/1024/390, search/detail/demo, Studio guest/create/prepare, and manager-role mocked quiz data with exact edit deep link; **no page JS errors**.
- Web TypeScript compile, focused oxlint (zero warnings/errors) and production Vite build all passed after both sourced component integrations. Vite printed pre-existing config/chunk-size warnings. Exact visual comparison and all interaction parity are still outstanding.

## Remaining gaps — not production ready

- Pixel-exact parity has NOT been established. Notable difference: the marketing header now presents guest Log in / placeholder Sign up and authenticated My Studio, but guest-specific auth flow and signed-out Studio dashboard still differ from sample-filled screenshots; sample games/events are not falsely presented as persisted user data. Some transitions and decorative details may differ.
- Not all original sample interactions, responsive states, login/sign-up screens, event preparation routes, checkout flows, game templates and purchase states have been fully implemented and connected. A paid plan/pricing UI must be checked against the actual production billing contracts before enabling.
- Authentication and backend integration still require end-to-end tests with real account roles and appropriately mocked/seeded backend data; no real-user login or licence checkout was tested.
- Hover.dev labels this component Free and publishes its CODE source, but commercial redistribution rights were not independently validated. Treat as a source-tracked preview implementation pending license review; do not silently relabel it MIT.
- Run complete QA (all locales, mobile, accessibility, no-regression editor/browser suite), full screenshot comparisons and product review before considering any production integration. The original editor must stay unchanged.
