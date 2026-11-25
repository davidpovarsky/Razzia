# TADAZZ — Agent Implementation Handoff

**Goal:** Integrate the already-built new TADAZZ marketing website and signed-in My Studio into the **actual** TADAZZ product, finish and connect all user-management screens, and connect Create/Edit to the **existing** game editor **without redesigning that editor in this phase**.

**Owner's non-negotiable instruction:** Implement in **our downstream TADAZZ extension layers**, **NOT by rewriting the upstream Razzia source code**. Work as an implementation agent: inspect, implement, integrate, test, document, and deliver a reviewable branch. Do not stop at a plan or a visually similar mockup.

> **עברית — הוראת הבעלים:** חבר את האתר החדש ואת My Studio למערכת TADAZZ האמיתית, כולל ניהול משתמש, משחקים, אירועים ומעברים לעורך הקיים. אין לעצב מחדש כעת את מסכי יצירת ועריכת המשחקים. העבודה בשכבות ההרחבה של TADAZZ, בלי לערוך את קוד המקור של Razzia. אין לפרוס או למזג לייצור ללא אישור מפורש.

## 0. Files in this delivery

Two supplied HTML files are **immutable visual references**, not production code:

1. `reference/TADAZZ-Animated-Modern.html` — marketing site, game library, sample demo, pricing/custom/other views. SHA-256: `4414d32c0e8f5b87519470d824ff72325bd0041776060c21c09ec9300acb7e0f`.
2. `reference/TADAZZ-My-Studio-Modern.html` — signed-in dashboard, My Games, Explore Games, My Events, Account & licences, preparation and checkout mock views. SHA-256: `f054e110766b7a21798de4e3efffdad8939127bab9846c8d8a6fba2b75c169a7`.

The ZIP also carries current source-reference documentation, component provenance, extracted design assets, and reference screenshots. If the HTML files are also present at `docs/design-reference/` inside the existing local feature worktree, cross-check their hashes. **Do not run the HTML files' embedded JavaScript as the production UI or treat their localStorage demo state as real data.** In the marketing source, later declarations override earlier functions (including `home()`); use the **final rendered design** as the authoritative reference.

## 1. Which repository and previous work to use

- Actual repository: `davidpovarsky/Razzia`, with an upstream Razzia fork and TADAZZ downstream extensions.
- Previous isolated local worktree on the owner's Windows machine: `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-site-library-parity-20261110`.
- Existing local implementation branch: `feat/tadazz-site-library-parity-20261110`, last observed commit `08ddc42` (2026-11-10). **This branch may be local-only, not available on GitHub.** Discover the repository's *current* live development branch, divergence, ownership files and up-to-date contracts first; do not assume the historical commit is current.
- Older integration base: `codex/tadazz-package-runtime-20261109`; historical context only. Do not reset or overwrite the current production/development head to this branch.
- Existing preview, for visual comparison only: `https://site-preview.132.145.25.168.sslip.io/site` and `/site/studio`. **The preview is not the finished application.** Its origin and production site are different; real editor deep links currently bounce to `tadazz.com`.
- Existing implementation to *reuse/migrate*, not re-create:
  - `packages/web/src/features/tadazz-site/SitePreview.tsx` — marketing and Studio React previews (currently combined in a long file).
  - `packages/web/src/features/tadazz-site/SiteAccountGateway.tsx` — local branded account UI using actual account endpoints.
  - `packages/web/src/features/tadazz-site/ReferenceCanvas.tsx` — isolated design reference styling.
  - `packages/web/src/features/tadazz-site/components/HoverDevTiltCard.tsx` and `MagicBorderBeam.tsx` — sourced animated components.
  - `packages/web/public/tadazz-design-reference/*` — extracted original CSS and design assets.
  - `packages/web/src/pages/site/{index,studio,login,signup}.tsx` — historical preview routes; route files are an integration **reference**, not approved upstream modification templates.
  - `docs/design-reference/{COMPONENT_SOURCES,INTEGRATION_CONTRACT,UNIFIED_SITE_INTEGRATION,DEPLOYED_STATIC_PREVIEW}.md` — historical audits. Some earlier statuses are dated; verify against actual code.

**Crucial:** Some preview code and routes were previously placed directly under `packages/web/src/...`, which is an *upstream-owned surface under this project's architecture*. **Do not continue that pattern for this implementation.** Re-home or wrap TADAZZ-specific feature code in downstream extension-owned modules and use existing integration seams. Avoid wholesale cherry-picking, copying large upstream files, or replacing the web package with the preview fork. Treat the old preview branch as source material, not the architecture to preserve.

## 2. Read and obey the project's architecture first

Read current versions of: `AGENTS.md`, `docs/extensions/WORKING_RULES.md`, `ARCHITECTURE.md`, `INTEGRATION_POINTS.md`, `CONTRACTS.md`, `DESIGN_LANGUAGE.md`, `orchestration/00_START_HERE.md`, `01_WORKTREE_PROTOCOL.md`, `10_LOCKED_PRODUCT_DECISIONS.md`, `13_FILE_OWNERSHIP.md`, and `14_ENGINEERING_ACCEPTANCE_CASES.md`. Follow their *current* precedence and file ownership. Historical V3 Tomer/Maya/Noam role assignments may not reflect today's active team; keep the **downstream-only and upstream-touch controls** even where role labels have changed. Do not assume a documented candidate hook already exists.

Architect the work as downstream TADAZZ features, e.g. **only if compatible with real exports and build layout**:

```
extensions/src/site/
  contracts/         # typed view models, route and capabilities contracts
  web/               # public marketing + authenticated Studio UI
    marketing/
    account/
    dashboard/
    my-games/
    explore/
    events/
    licences/
    shared/
  adapters/          # adapt existing account/quiz/results/events APIs, no fake stores
  themes/            # shared design tokens, scoped CSS, reusable UI primitives
  locales/           # i18next namespaces, all supported locales
  tests/             # feature and contract tests
```

Actual directory names may differ depending on the extension package's exports. Respect the existing module layout; avoid unapproved package rewrites. Split giant React preview files by feature and use stable public extension exports instead of deep cross-feature imports. Build one coherent product, not a second frontend or parallel authentication database.

**Strict upstream protection:** No edits to existing Razzia `packages/web/**`, `packages/socket/**`, `packages/common/**`, runtime, core schema or game engine as part of normal execution. Prefer composition, adapter, DI, registry, extension route mount, existing downstream integration and feature flags. If you prove **no supported extension seam exists**, first document the exact minimal upstream hook needed, alternative approaches, test, merge risk and rollback in `docs/extensions/UPSTREAM_TOUCHES.md` or the project's current canonical ledger, then seek the owner's explicit approval **before touching that upstream file**. Do not silently treat user permission to integrate the site as blanket permission to rewrite Razzia. Do not bypass this by a patch in a generated router file.

## 3. User experience: one site, one account, one coherent navigation

### Public / guest

- Existing domain should eventually show the new approved marketing homepage as the real homepage, **under a rollout flag first**, not a separate product. Keep public Home, Games / Explore Games, How it works, Pricing, Custom shows, Try a round and footer exactly in the supplied HTML's order/visual language.
- Provide prominent **Log in** and **Create account / Sign up** controls in desktop header and mobile menu. Account links must actually work; no 404, dead button, placeholder modal or fallback to unrelated legacy manager login.
- Support login, registration, email verification/resend, password reset, useful loading and error messages and account-scoped post-login navigation. Reuse the **existing TADAZZ account APIs and security rules**; never create a second identity provider, skip verification or fake success.
- After authentication, navigate naturally into **My Studio** on the **same origin** and shared real session; after sign-out, return to public site, clear client session and invalidate private cached data. Handle expired sessions and deep-linked authenticated pages.

### Authenticated My Studio (signed-in reference)

Keep the hierarchy and density from `TADAZZ-My-Studio-Modern.html`. Provide responsive sidebar/topbar and actual screens:

1. **Dashboard:** personalized welcome, overview, continue working, recent real games and events; proper empty/loading/error states.
2. **My Games:** real account-owned games, searchable/filterable/sortable list/gallery; **Create**, **Edit**, **Duplicate/Clone** (only where real backend supports), **Import**, **Export**, **Delete with confirmation**, game details, ownership checks and status. Reuse actual actions/queries and loading states; avoid resurrecting demo arrays or localStorage as the source of truth.
3. **Explore Games:** distinguish public ready-made templates from a user's private games. Wire to actual template catalogue/installation/customization capability if implemented. If there is no real template backend, document the gap, keep design/demo data clearly labeled and avoid claiming purchases/copies happened. Preserve the tier concept (ready-made, customize, bespoke professional service) without pretending pricing is final.
4. **My Events:** show real prepared, active and past events/results where supported; start/prepare show, capacity/licence state, event entry and explicit routes to existing Host / Presenter. Do not confuse *quiz templates* with *live game sessions* or post-event result records.
5. **Account & Licences:** real profile/session and quotas; billing only when configured and verified. The production billing config was seen with `enabled:false` on 2026-11-10: **never expose mock checkout as an active purchase flow** or fake subscriptions.
6. **Help, notices and account menu:** accessible modal/menu behavior, mobile navigation, status feedback, sign-out.

The public site and Studio should share logo, typography, colors, tokens and component language. No forced navigation to a different hostname during normal use. Direct refresh and browser Back/Forward must work for real routes. Avoid pushing auth-critical tokens into URLs.

## 4. Game creation and editing: integrate, **do not redesign**

**Absolutely preserve the current editor layout and capabilities for this phase.** Locate the actual `StudioShell` implementation, seen in `packages/web/src/features/quizz/components/studio/studio-shell.tsx`, and existing editor routes `/manager/quizz` and `/manager/quizz/$quizzId`. The current editor contains questions, scenes/timeline, settings, participants and launch views — do not replace it with the HTML prototype's fake editor, remove tabs, change scene logic, touch save schemas or rewrite the editor styles.

- **Create game** from My Studio must start the **existing real create route/state**; save under the logged-in account and return the resulting real game to My Games.
- **Edit game** opens the **existing real editor** for that quiz ID, with proper authorization and correct state; save/cancel/return/back handling must work. Do not build a competing editor.
- Keep editor full-height, full-width workspace, same keyboard controls, original responsive behavior, question/presenter feature sets and existing editor context/provider.
- Use only a minimal, **separate composition-level** navigation affordance (“Back to My Studio”) if it can be added without modifying core editor UI or editor state. If it needs an upstream source edit, follow the documented hook approval workflow; don't force an overlay that blocks controls.
- On returning to My Studio, invalidate/reload game lists appropriately. Deep links and old editor bookmarks must continue to work. Do not transfer access tokens between domains to work around preview limitations.
- **Visual redesign of the editor is explicitly postponed to a later separate task.** Do not consume the agent's scope on changing its colors, typography, timeline or panel layout.

## 5. Integrate or retire the *old manager screens* safely

Audit the actual existing manager pages and API handlers; move **user-facing entrypoints**, not their engine/business logic, to the new Studio. A functional map based on inspected code:

| Existing feature/source (verify current path) | Target in new experience | Required preservation |
|---|---|---|
| `ConfigManageQuizz.tsx`, `use-show-file-actions.ts`, `ShowImportModal`, `ShowExportActions`, `PackageManager` | My Games | Real create/edit/delete, `.tadazz` package, JSON/XLSX import/export, confirmation and cache invalidation |
| `ConfigSelectQuizz.tsx`, `createGame`, manager store and game-status initialization | My Events / Prepare / Start | Actual selection, authorization, host session creation, invitation/room state, manager navigation |
| `ConfigResults.tsx`, `ResultModal`, `resultsListQuery()` | My Events / Past Events / Results | True historical results, counts, details, delete confirmation where authorized |
| `ManagerAuthPage.tsx`, `AccountLogin.tsx`, account routes | New account/login shell | Password/reset/verify, legacy compatibility, security and session semantics |
| Existing account billing components and `/manager/checkout` | Account & Licences | Real plan/quota gates; disabled billing stays disabled until approved |
| `StudioShell`, its provider/editor components, `/manager/quizz*` | **Keep editor as-is** | Original create/edit/save/scene/question/launch behavior |
| `/party/manager/$gameId`, `/display/$gameId`, `/party/$gameId`, telephone bridge | Full-screen show/presenter/player routes | All runtime, audio, timers, host keys, voting, scoring and reconnect behavior unchanged |

**Do not remove old `/manager/config` or legacy auth routes until all capabilities are re-homed, tested and reachable; keep compatibility redirects/deep links where needed.** Never delete business functions merely because their original panel becomes hidden. No live session or results data migrations without a documented, tested plan.

## 6. Real data, contracts and security

Inspect the current typed APIs and backend behavior **as they exist now**, rather than building from historical assumptions:

- `packages/web/src/features/manager/queries.ts`: `quizzListQuery()`, `quizzQuery`, `createQuizz`, `updateQuizz`, `deleteQuizz`, `resultsListQuery()`, `createGame`; verify actual auth/role and payloads.
- `packages/socket/src/api/routes/accounts.ts` and auth-related endpoints: account login, registration, verification, reset, logout and session. Use existing validation, rate limits and error models.
- Actual billing contracts and feature flags, template/catalogue ownership and event/room state; distinguish missing backend features from already implemented ones.
- Account-scoped queries must enforce authorization on the **server** (tenant/owner isolation), not only filter in the browser. Do not show real data to guests or leak between accounts; cache query keys/session isolation and logout invalidation matter.
- Every user action should have real persistence or be explicitly disabled with truthful explanatory text. No pretend “Saved”, “Purchased”, “Duplicated”, “Sent” or “Created”.
- Protected API mutations must not be exposed through publicly readable preview hostnames or unmanaged proxies. Prefer local/test backend and fixtures for automated end-to-end flows; do not create fake paid orders or bulk test accounts on production.
- Avoid plain localStorage *as a database*; session storage should continue to follow the existing project's security architecture rather than inventing a new one.

## 7. Design fidelity and library provenance

- Marketing HTML and Studio HTML are the authoritative visual references. Preserve approved section order, responsive layouts, typography, logo, dark violet/lime/pink palette, game-card rhythm, spacing, hover/animation behavior, and editorial tone. Cross-check desktop/tablet/mobile. Make the new user management screens feel like the same product, not a generic admin dashboard.
- Reuse actual available React UI libraries where helpful and licensed; the current branch includes one **real sourced Magic UI Border Beam** and one **real sourced Hover.dev Hover Tilt Card**, plus installed Motion, Radix, Lucide and Tailwind. **Most remaining elements are local implementations or come from the supplied prototype. Do not attribute them falsely to libraries.**
- `docs/design-reference/COMPONENT_SOURCES.md` records exact origin and changes. For each new borrowed component, record upstream URL/commit, license, copyright, modifications, usage location and component tests; verify commercial use of Hover.dev before final release.
- Prefer accessible Radix primitives for forms, dialogs, dropdown menus and toast where appropriate. But don't add gratuitous flashy components or replace polished reference layout just to claim more library usage.
- Extract shared **downstream** design tokens and scoped styles. Avoid global CSS leakage into the runtime or the editor. No iframes and no executing source HTML with unsafe `innerHTML`.
- All *new* user-facing copy uses the project's i18n architecture and its required locales (consult latest policy; historical required locales: en, fr, de, es, it, ja, tr, vi). Honor keyboard navigation, focus, contrast, reduced motion and responsive mobile menu/sidebars.

## 8. Implementation order (execute without waiting for design decisions)

1. **Discover and reconcile:** actual HEAD, feature branch, existing extension registration/build/route seams, current manager/editor paths, real APIs, existing UI. Read canonical downstream docs. Record known gaps in a short initial implementation map. **Do not spend the entire engagement on analysis**.
2. **Move into downstream architecture:** implement new site feature module(s) under `extensions/src/**`; adapt/reuse the existing React preview implementation and original assets without rewriting Razzia modules or changing core game behavior. Keep feature flag OFF for default production until ready.
3. **Unify public site + authenticated Studio** in existing application router/origin. Functional login, signup, verification/reset, logout; persistent account-scoped session and no 404/dead entrypoints.
4. **Build real My Games** with all existing management tools. Connect Create/Edit to the unchanged `StudioShell` and existing safe routes; refresh data on return.
5. **Build real My Events/results/prepare** around existing operations; handle active, scheduled/past where supported. Preserve live show routes and all game settings.
6. **Integrate Account & Licences and Explore Games** using actual backend features. Clearly flag unsupported backend capabilities; do not simulate billing or template purchases as success.
7. **Bring styling and UX to reference parity** for public, Studio and the new account/management shells; **do not redesign the original editor**.
8. **Validate and deliver:** tests, source provenance, route/action audit, no-regression report, branch commits, handoff, rollout/rollback notes. Do not push/merge/deploy or modify production unless explicitly approved.

## 9. Required acceptance checks the agent must perform

The owner is delegating checks to **you**, the implementation agent. Do not ask the owner to manually validate basic operations; run tests using appropriate seeded test accounts/fixtures and never against live payment data.

- Public: home/hero/sections order, game search/filter, demos with obvious results, pricing/custom CTA, mobile navigation, no dead buttons, Back/Forward/refresh/direct URLs.
- Accounts: guest→signup→verify→login→Studio→logout; reset, expired session, failed auth, role checks, private data hidden on sign-out.
- My Games: account-owned data, empty/loading/error, create/save/list/edit/save, import/export/delete/duplicate where supported, tenant isolation, cache invalidation, correct links.
- My Events: prepare/start, manager-to-show routes, host/presenter compatibility, past results, reconnection, error states. Distinguish templates, quizzes, events and runtime sessions.
- Editor: **same markup/interaction design and features as baseline**, no file changes unless approved hook; check existing editor snapshot/screenshots and regression tests, save integrity, deep links, working routes.
- Security: no cross-account data, no unmanaged cross-origin token propagation, safe rate limiting, authorized mutations, checkout disabled unless configured; proper feature gate.
- UI: desktop 1440×900, tablet 1024×768 and mobile 390×844; responsive screenshot comparison against both supplied HTMLs; zero horizontal overflow, accessibility/focus, no console errors or hydration warnings.
- Tooling: project-equivalent TypeScript, ESLint/oxlint, Prettier, unit/integration/E2E and build. Test existing game runtime, presenter and telephony non-regression where changes touch shared seams. Log exact commands and results, no invented passes.
- Git: separate downstream feature branch/worktree, isolated commit(s), diff listing, explicit upstream touches ledger with **zero unauthorized upstream modifications**.

## 10. Final delivery contract

Deliver real integrated **code**, not only notes or an HTML mockup. Provide:

- Branch/worktree and commit IDs; exact source file list (new downstream modules vs pre-existing upstream files); implementation inventory with working routes.
- Live-vs-example data matrix for every screen, list of any missing backend capability and any blocked action. No deceptive “done” status.
- Accurate third-party component provenance/licence table (not fictional attribution).
- Test evidence/results, screenshots, defects and remaining release blockers.
- Clear entry route and how the existing Create/Edit editor and management/runtime features are reached from the new site; route compatibility/redirect map.
- Feature flag, deployment steps and rollback instructions **as documentation only** unless deployment separately approved.
- No changes to game editor visual design in this task. Defer it explicitly as a *future independent design project*.

### Stop conditions requiring owner decision

Only escalate if (a) a **minimal upstream code hook** proves unavoidable after trying supported extension approaches, (b) a genuinely missing backend contract would require schema/engine changes, (c) a purchase/service/security-impacting action needs permission, or (d) you would modify live production infrastructure/data. Otherwise proceed independently, make sensible implementation choices, test and report.

**Definition of done:** A user opens TADAZZ, explores real available games, creates/logs into an account, works in a properly designed My Studio connected to authorized real data, and creates/edits through the **original unchanged editor** without a second site or phantom state — with all historical management/runtime capabilities preserved and downstream/upstream boundaries respected.
