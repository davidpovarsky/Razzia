# Tadazz — Design System, UI Consolidation, Host UX and Naming Hygiene

**Agent implementation mandate | 10 November 2026 | Version 1.0**

> **Execute this plan end-to-end in a scoped development branch. The existing content editor is strictly frozen: do not redesign, restyle, rename, refactor, relocate, or functionally modify it during this initiative.**
>
> The work must remain resumable by a different coding agent at every phase. Update the existing Asana parent and its 13 subtasks **after each phase**, with evidence and exact Git commits. Do not merge or deploy without the owner's separate explicit authorization.

## 0. Project, references, authoritative tracking

- Product name in ordinary written English: **Tadazz** (title case), e.g. **Tadazz Studio**, **Tadazz Editor**, **Tadazz**; preserve the existing graphical uppercase/exclamation logo image exactly. Domain remains `https://tadazz.com`.
- Git repository: `https://github.com/davidpovarsky/Razzia`; upstream: `https://github.com/Ralex91/Razzia`.
- Inspected local working tree: `C:\Users\DAVID\Code\Razzia-worktrees\tadazz-unified-site-20261110` on `codex/tadazz-unified-site-20261110` at `fb6c7631999f` (10 Nov 2026). **This is a reference snapshot, not permission to assume it remains the latest branch or currently deployed code.** First check active worktrees, HEADs, recent integration commits, dirty work, upstream drift and actual production build. Create a separate scoped worktree from the correct integrated baseline; never overwrite another agent's work.
- Review before any edit: `AGENTS.md`, `GEMINI.md`, `docs/extensions/WORKING_RULES.md`, `docs/extensions/UPSTREAM_TOUCHES.md` (if present), `docs/extensions/SHOW_THEME_ENGINE.md`, `docs/extensions/UNIFIED_SITE_20261110.md`, `docs/extensions/SITE_REVIEW_HE_20261110.md`, current architectural contracts, all relevant tests. The old instruction **"Match original Razzia design, not a redesign"** is obsolete for the new platform and host UI but must **not** be superseded for the frozen editor. Update downstream guidance accordingly; respect upstream integrity and ownership.
- **Asana project**: `Tada | ...` at `https://app.asana.com/1/1219597879016953/project/1219846276680200` (existing project name may be historical; do not rename it as part of this task).
- **Asana master task:** [P0 | Tadazz — Design System + UI consolidation, editor frozen](https://app.asana.com/1/1219597879016953/project/1219846276680200/task/1220402777392717), GID `1220402777392717`.
- **Phase subtasks**: see §3 and the exact task IDs. Use the Asana account connected as `davidpovarski1@gmail.com`, not the Core Web account.
- Commit this specification to the working branch at `docs/extensions/plans/TADAZZ_DESIGN_SYSTEM_UI_UNIFICATION_AGENT_PROMPT_2026-11-10.md` and add a concise plan/index document linked from developer guidance if necessary. Do not modify source files just to place this instruction.

## 1. Nonnegotiable product decisions

1. **Three intentional presentation contexts, one governed system:** (a) marketing website + customer Studio: branded purple/dark/lime, (b) existing content editor: professional neutral/light editing workflow, **untouched**, (c) player/audience show: arbitrary selected show theme; host management controls should retain a coherent Tadazz platform UI, independent of show theme.
2. **Freeze the editor as-is:** no code or styling changes to the existing content authoring editor; do not move editor-only components into a new library, restyle its controls, adjust its layout, or replace its dependency stack. Avoid indirect effects from global CSS, typography, custom properties, base layers, portal styles, import alias changes, routing, or layout. The editorial interface may use native Razzia visual patterns for now. Future editor work is outside scope.
3. **Preserve functional behavior and all data:** live voting/scoring/rooms/timers/telephony/reconnect, host keyboard controls, manager/player/spectator roles, participant roster, existing accounts, package installers, custom show themes, media and customer-created games. No synthetic or hardcoded data replacing real APIs. Public display must not leak participant phone numbers or manager controls.
4. **Preserve upstream when possible:** use downstream extensions, adapters and scoped styling. Existing `packages/**` files are protected upstream unless a minimal, recorded and owner-authorized seam is unavoidable. Read `UPSTREAM_TOUCHES.md` and abide by the current stricter rule. Do not mass-format or churn upstream sources. Any essential upstream touch: exact file/lines, reason, alternatives, smallest diff, tests, merge-risk + permission. **Do not let this plan be interpreted as authorization to edit upstream.**
5. **Keep legacy compatibility:** persisted identifiers, public URLs, JSON/XLSX formats, runtime IDs, versioned schema contracts, theme renderer IDs, license data and saved legacy settings are not internal naming clutter. Never globally replace `tada`, `v4`, `razzia`, package names or hashes; use typed aliases/adapters and migrations with round-trip tests. Continue loading existing `tada-show`, `tada-xlsx`, `TadaShowV1`, `razzia-original`, `tadazz-classic` and other formats where they are part of persisted/public contracts. Do not change existing data without a separate explicitly approved migration.
6. **Brand spelling:** English product **Tadazz** in normal headings, navigation, dialogs, emails, alt/aria/metadata and translations; no "TADAZZ" in ordinary product copy. Logos may show the stylized uppercase mark. Internal code can use lowercase `tadazz` for branded namespaces and clean generic semantic names (e.g. `StageRenderer`, `QuestionCard`, `HostToolbar`) where namespace already conveys context. Do not rename the upstream Razzia brand/license in notices.
7. **Architecture over mockups:** the design catalog must render and import **actual production React components and actual generated tokens**. A static HTML specimen or Figma-only styleguide is insufficient. Changes to source definitions must update consumers automatically, with scoped exceptions.
8. **Safe execution:** no secrets, credentials or customer PII in commits, logs, screenshots, Asana or evidence. Never wipe production containers or data. No push/merge/deploy without explicit permission under project policy. CI and local isolated QA are allowed within configured policies.

## 2. Protected scope and explicit boundaries

### READ ONLY — do not edit even for cleanup

- Existing editor implementations under `packages/web/src/features/quizz/**`, especially `components/QuestionEditor/**`, `components/studio/**`, media library, timeline, settings, save hooks and test snapshots; `extensions/src/editor/**` and editor-specific styles.
- Editor behavior, state, node tree, fields, colors, media, preview, drag/drop, menus, navigation, routing and output formats.
- Generated user data, customer assets, live event rosters and persisted room snapshots.
- Baseline upstream Razzia source except where owner explicitly grants a surgical deviation.

### In scope, with upstream ownership safeguards

- Public site and authenticated Studio shell, account and My Games presentation and their independently scoped `extensions/src/site/**` modules.
- **Platform shell of the host/manager**: controls, toolbar grouping, overlays, dialogs, roster and status presentation; ensure unchanged manager capabilities.
- **Presentation hosting boundaries**: game background sizing and inheritance, join-screen data contract, audience vs manager composition and theme slot consumers. Do not modify show choreography itself except to fix an accepted integration bug after proving no change to the customer's sequences.
- Design tokens, semantic motion tokens, shared wrappers, theme scoping, component catalog, documentation, agent guardrails, QA and compatibility shims.
- Dedicated neutral editor-theme **documentation/token definitions only**, never applied to or imported by the editor during this initiative.

**Edge-case rule:** If a required cross-cutting change touches any frozen editor route, component, tokens or styles, stop that change and implement a scoped platform-only alternative; do not weaken this rule. Record a future editor proposal separately without executing it.

## 3. Work phases, Asana IDs, acceptance evidence

Every phase below is an actual **Asana subtask** under master `1220402777392717`. Update its description with a checkpoint and mark completed **only** when its exit criteria have been tested and attached/linked. Do not close the parent until all phases and the release gate are accepted. An independent agent must be able to resume purely from the repo checkpoint and Asana.

| Phase | Asana task GID | Result |
| --- | --- | --- |
| TDS-00 | `1220402430946120` | Baseline, ownership and freeze |
| TDS-01 | `1220402455305251` | Rules, naming and compatibility contract |
| TDS-02 | `1220402647256448` | Component inventory and dependency map |
| TDS-03 | `1220402777623967` | Shared tokens and scoped themes |
| TDS-04 | `1220402719463680` | Canonical React UI components |
| TDS-05 | `1220402777822480` | Live component catalog and governance |
| TDS-06 | `1220402777861386` | Website and Studio polish (not editor) |
| TDS-07 | `1220402729693747` | Full-window stage background and join core |
| TDS-08 | `1220402719392041` | Host controls, fullscreen modals |
| TDS-09 | `1220402539686302` | Roster and package/admin dialogs |
| TDS-10 | `1220402539658409` | Scoped UI motion system |
| TDS-11 | `1220402430879047` | Naming/brand cleanup, compatibility |
| TDS-12 | `1220402539686110` | Cross-platform regression, final handoff |

### TDS-00 — Baseline, ownership, freeze (MUST come first)

- Inspect all local Git worktrees and remote branches and newest validated integrated state; inspect actual production commit/image/asset manifest **read-only** if access permits. Do not assume Asana project notes are current; previously recorded production status can be stale.
- Record initial SHA, dirty state, pending PRs, owner permissions, packages/extension boundary, current file path inventory, relevant suites and user-provided screenshot baseline.
- Capture non-sensitive screenshots or visual snapshots of all representative surfaces: site home/demo, Studio/dashboard, My Games gallery/list, account/licenses, manager join, fullscreen host, host dialogs, audience-only screen, package dialog, theme preview and **unchanged editor read-only** (question/scene/timeline/media). Use approved test fixtures, never customer PII.
- Establish a locked allowlist/diff assertion so the initiative cannot change editor files or editor layout through shared/global styling. Baseline exact checksums or `git diff --name-only` for excluded directories; verify on each phase.
- Create isolated branch/worktree and start `docs/extensions/plans/TDS_PROGRESS.md` with a compact progress table, test links, status and next steps.
- Exit only when the intended base, protected paths and baseline are documented and clean.

### TDS-01 — Rules and naming contracts

- Amend `AGENTS.md`, `GEMINI.md`, `docs/extensions/WORKING_RULES.md` (or active instruction source) to resolve obsolete "match original Razzia design" instructions for **site/Studio/host** only while explicitly preserving the editor's current appearance and upstream protections. Make ownership rules precedence unambiguous.
- Define canonical brand names and casing by locale; protect logo artwork and URL scheme.
- Publish internal naming conventions: `kebab-case` filenames/directories, `PascalCase` React components/types, `camelCase` functions/variables, `UPPER_SNAKE_CASE` constants; generic semantics inside module scopes, branded `tadazz` only when needed. Keep public versioned schema IDs stable.
- Inventory persisted identifiers/formats and stable API discriminators before naming refactors; write compatibility classification: internal safe rename / external stable / historical load-only / protected upstream / editor freeze.
- Provide a policy document and validation/test approach, not blanket regex replacements.
- Exit: rules self-consistent, read-only editor boundary tests green, schema ID sample preservation documented.

### TDS-02 — Full UI/animation inventory and canonical architecture

- Catalog existing `packages/web/src/components/**`, `features/game/components/**`, manager dialogs, `extensions/src/site/web/**`, `extensions/src/site/themes/**`, `extensions/src/presentation/**`, `extensions/src/core/show-themes/**` and current motion assets. Include explicit screen to component and component to token dependency graph.
- Identify duplicate buttons, modal frameworks, lock and navigation controls, multiple join screens, overlays, package management embedded into game listing, color/font duplication, CSS leakage, `ShadowRoot` and portal boundaries.
- Classify each implementation: **canonical**, **reuse with wrapper**, **legacy compatibility only**, **editor-protected**, **replace presentation only**, **not in scope**. Name the single owner module and migration destination.
- Inventory UI animations (CSS, Motion, `dnd-kit`) independently from cinematic show WAAPI/Lottie/audio cues. Do not confuse a declared animation preset with evidence of an implemented motion asset.
- Reference exact relevant files, plus any new findings. Exit: auditable inventory checked into docs and linked in Asana.

### TDS-03 — Design tokens and bounded style scopes

- Build versioned semantic design tokens (source-of-truth structure) for brand, semantic status colors, type scales, font families, surfaces, contrast, borders, radius, shadow, spacing, icon sizing, focus, transition/easing/duration, z-index and breakpoints. Distinguish primitive tokens from semantic role tokens and component tokens.
- Provide contexts: `platform.marketing`, `platform.studio`, `platform.host`, `show.theme`. The **editor remains unchanged** and may be documented as `editor.current` without any runtime style changes.
- Avoid global Tailwind/preflight/`body`/`button` selectors leaking into game/editor; manage composed `ShadowRoot` styles and Radix portals correctly, including overlays in fullscreen and isolated scopes.
- Define fallback/override resolution and CSS variable contract; mapping from the existing `classic.manifest.json` and `razzia.manifest.json` must not change persisted renderer or theme IDs.
- Add CI checks for accidentally hard-coded brand values in newly converted platform components (explicit exceptions for artwork, animation assets, legacy/editor files, theme runtime).
- Exit: changing one scoped token updates actual site+host consumers in a test fixture; editor visual baseline unchanged; no theme leakage, no contrast regression.

### TDS-04 — Canonical UI components without behavior regression

- Reuse Radix primitives/installed Motion and existing React/TypeScript stack. Evaluate selected shadcn/ui patterns as **source-level inspiration/components**, not a compulsory massive dependency migration. Never introduce a second competing component framework needlessly.
- Create accessible, documented, typed wrappers for platform-only `Button` variants (primary, secondary, ghost, destructive), `IconButton`, `Dialog`, `AlertDialog`, `Popover/Menu`, `Input`, `Select`, `Switch`, `Tabs/Segmented`, `Card`, status/badge/toast, tooltip, search, table primitives, empty/loading/error states and responsive toolbar primitives where required.
- Guarantee semantics: keyboard navigation and Escape, focus trap and return focus, ARIA, stable hit targets, native disabled state, loading pending state, scroll containment, screen-reader descriptions, RTL, contrast and reduced motion.
- Preserve existing event handlers, `data-testid` selectors and application API calls; ensure Radix portals render above fullscreen `document.fullscreenElement` when needed. Never duplicate server states.
- Component API should use tokens and scoped variants; no direct site-wide Razzia variable override. No editor consumer migration.
- Exit: unit stories/interaction tests, keyboard tests, integration in representative site and host component; editor diff guard green.

### TDS-05 — Live component catalog + agent governance

- Establish Storybook (preferred) or a well-justified equivalent using actual imported React components, compiled with supported project tooling. Validate compatibility/version first; do not introduce large, untested dependency upgrades.
- Stories for every canonical component, all states (`default`, `hover`, `focus`, `disabled`, `loading`, `error`, `success`, `empty`, `dark/light`, responsive and RTL), plus layout templates (Studio page, host modal, lobby join, dialog tables). No real customer data.
- Show token palette with names, typography/font samples, radii, spacing, shadows, icon vocabulary, focus states, motion timings and accessible usage rules. Document source path, properties, do/don't, API contract and ownership. Provide direct links from agent guidance and test scripts.
- Build/verify a production-quality catalog preview route **restricted to internal development or protected authentication**; no exposed private QA, secrets or editing surface on the public site.
- Add lint/testing enforcement where feasible. New platform UI should import canonical components; permitted exceptions clearly enumerated. Avoid enforcement on frozen editor/upstream.
- Exit: a token change is visible in actual Storybook and in both site/host consumer QA; docs are sourced from production components, not manually diverging copies.

### TDS-06 — Public site and Studio usability cleanup (NO editor)

- Preserve current polished Tadazz marketing identity and existing customer-owned games, sessions, authentication and APIs. Do not replace real data with decorative placeholders.
- `My Games`: fix list thumbnail distortion (`extensions/src/site/themes/studio.ts` currently uses `.site-game-list .site-game-cover { aspect-ratio:auto }`); enforce true 16:9 source ratio and responsive sizes; gallery/list controls, clear primary `Edit game` and `Prepare show` actions, a single accessible overflow for Duplicate/Export/Delete, confirm destructive delete, avoid distant floating actions.
- Avoid duplicate always-visible `Create game` CTA: keep obvious top primary action and only contextual/empty-state tile where appropriate. Prefer actual per-game covers when existing data supports them; do not invent metadata or new server fields. Use explicit fallback image when unavailable. Manage installed packages as a compact advanced/collapsible area or dedicated accessible flow without removing installer/export abilities.
- Demo (`extensions/src/site/web/marketing/MarketingSite.tsx`): make choice area visually prominent; stage-based buttons (choose -> reveal -> replay), no meaningless `Try again` before first answer, preserve demonstration-is-not-real-vote disclosure, reliable nav/scroll/locale.
- Account: compact logical sections, correct billing availability without fake checkout or quotas, human-readable state text, avoid duplicate account links unless semantics differ. Keep authentication/security intact.
- Use `Tadazz` in normal UI copy and translation entries; include all supported locales; preserve image logo. Verify address/header/footer/metadata.
- Exit: real API flows working, gallery/list no stretched thumbnails, mobile/tablet/desktop and keyboard screenshots, protected editor unchanged.

### TDS-07 — Host stage background, join screen and audience data contracts

- **Known defect:** original `packages/web/src/components/GameBackground.tsx` renders `assets/background.png` (classroom), while themed stage renders inside `NativeGameSurface` bounded between host toolbars. On `/party/manager/*`, classroom bleeds above/below the themed stage. Fix at the shell/presentation boundary using downstream composition/scoped background, **not** a naive global replacement that breaks the editor or original show modes.
- Theme-selected show backdrop must fill the host viewport behind both top/bottom toolbars at correct fit (cover/contain by explicit theme semantics) while scene/video/custom-media precedence remains correct. No legacy background flashes, black bars, scroll, letterbox distortions, transparent gaps or overlays covering the game. Explicit per-card background/animation and fullscreen video remain authoritative. Implement safe fallback and loading state; test first paint/navigation/resize, not only a single screenshot.
- Consolidate **data contract** for lobby: live room PIN, join URL, QR encoding URL+PIN, lock state, selected dial-in phone only if configured, player and host join instructions, connections/roster count. Require data from existing API/server state and permissions; no fake phone number or stale PIN. The same data contract feeds multiple customizable renderers; never force every theme to share the same visual layout.
- Actual entry implementations to inspect: `features/game/components/states/Room.tsx`, `tadazz-show/TadazzScreens.tsx` (`TadazzLobbyScreen`), `extensions/src/presentation/tadazz-v4/reference-story/SeatingPlan.tsx`. Preserve Creating Worlds custom table layout and per-game branding, host instructions and full phone/QR/PIN when applicable; no PII leaking into public audience scene.
- Keep manager vs spectator vs player surface/permissions separate, and keep hosted projector fullscreen clean. Verify regular lobby without phone config, phone-enabled lobby, Creating Worlds, locked/unlocked, reconnect and audience display.
- Exit: screenshots and automated assertions for entire viewport, role separation and correct live room URL/PIN/QR/phone behavior; zero editor changes.

### TDS-08 — Host toolbar and modals consolidation

- Re-organize `ManagerControlToolbar.tsx`, `GameWrapper.tsx` and host control composition. Distinguish `Audience Display` (external spectator route), `Present from Host` (local fullscreen presentation) and copy-link as two legitimate display modes within one coherent control group, not duplicate-looking primary buttons.
- Make navigation and phase controls meaningful: hide/disable previous on first screen, avoid duplicate room lock, group Start/Pause/Next/Skip/history/keyboard-help/settings with hierarchy and tooltips. **Never change shortcut behavior or state meaning**; double-press shortcuts within their specified window, pause/resume game vs pause/resume audio, early end timer keeping votes vs skip discarding answers, restart etc. remain semantically distinct.
- Shared presentation for `HostShortcutsDialog.tsx`, `HistoryDialog.tsx`, `GameSettingsModal/index.tsx`, QR zoom, confirmations and host manager dialogs. Use scoped platform skin and production component wrappers; preserve actual Radix focus/keyboard behavior and fullscreen portal placement.
- Never let a host control appear in spectator/player view. Avoid layers showing through cinematic transitions. Tests must cover fullscreen, shortcuts while dialogs focused, escape, keyboard, touch, split screen and browser zoom.
- Exit: no ambiguous duplicated UI actions; all original commands proven to reach their original handlers, with no double firing.

### TDS-09 — Roster, live status and package/admin panels

- Inspect `HostPlayersModal.tsx`, server roster semantics, invite-only toggles and package controls. Reorganize headers, live registered/connected/disconnected/not-joined counters, search/filter/CRUD, spreadsheet import/export/templates and table; maximize rows without tiny targets. Change only presentation of established data; do not invent presence statuses or phone values.
- `Phone Invite Only` is a **setting**, not a fifth metric. Single authoritative backend state across roster and settings, with saved/error/disabled feedback. Avoid two unsynced toggles.
- Replace icon-only irreversible player deletion with descriptive confirmation (identity, consequences, cancel) and genuine error feedback; no silent destructive action. Preserve functional import CSV/XLSX, duplicates, normalization and reconnect/points.
- Large table: sticky header and scroll within modal, mobile responsive column priorities or detail drawer; evaluate TanStack Table/Virtual **only if** it materially improves >40/400 participant use; use current dependencies first and preserve IDs/tests.
- PackageManager surface: normalize skin and contrast, avoid duplicating installer logic, keep private package administration accessible, preserve validator/tenant controls and server-side permissions.
- Exit: functional import/CRUD/search/filter/realtime tests, 38-50 and 400-row safe synthetic load, privacy and mobile screenshots; editor untouched.

### TDS-10 — Scoped UI motion, not a new show timeline

- Introduce **platform UI** motion tokens (duration/easing/spring) and reusable transitions: dialog enter/exit, menu/popover, tabs/selection, gallery/list layout changes, list reordering, animated count/status and progressive load. Use installed `motion/react` where it adds real value; avoid flashy movement in the editor or audio-sensitive host controls.
- Preserve `extensions/src/presentation/tadazz-v4/motion.ts` WAAPI engine, cinematic scene choreography, Lottie, cue timing and audio ownership; no retiming or rewriting of existing Creating Worlds stage as part of UI cleanup. Maintain pause/resume/stop/unmount/scene interruption semantics, timer clock, reduced-motion fallback and frame performance.
- Inspect and selectively reuse upstream leaderboard `AnimatePresence`, `layout`, `useSpring` patterns without importing Razzia's visual styling. Avoid changing game results or scoreboard visibility policy.
- Exit: UI motion visual evidence and deterministic interruption tests; no duplicate cue or animation leaks; accepted stage frames unchanged.

### TDS-11 — Naming hygiene and backward compatibility

- Apply **internal-only** safe semantic naming. Avoid generic `V4` or temporary design generation suffixes in new public-facing component names. Example targets (verify references before choosing): `TadazzV4StageAdapter.tsx` -> `StageRendererAdapter.tsx`, `TadazzV4Stage.tsx` -> `ShowStage.tsx`, `TadazzV4Data` -> `StageData`. Do not force those exact replacements if historical imports/contract consumers require an alias; favor stable barrel exports.
- `TadaShowV1`, `TADA_SHOW_FORMAT = "tada-show"`, preflight values `tada-xlsx`/`tada-json`, file header version and saved renderer/theme IDs are serialized contract values; **keep reading/writing historical data** or adopt an explicit new version with dual-format support and roundtrip/contract tests. Do not rename persisted IDs in-place.
- Keep `razzia-original`, `tadazz-classic`, `rendererApiVersion`, `manifestVersion`, user-created package IDs and existing MIME/route names where external data depends on them; never alter hashes/rights metadata just for cosmetics.
- Standardize ordinary user-visible branding everywhere in scope to `Tadazz`, across eight translated languages where relevant, nav, title, tooltips, alt text and notifications; leave actual logo image and third-party licenses unchanged.
- Scope rename to modules edited by initiative and safe downstream references; do not move/rename frozen editor code or upstream simply for uniformity.
- Exit: old JSON/XLSX/bundle import+export round-trip, pinned show theme/old game load, TS compilation, no orphan aliases, no changed editor source hashes.

### TDS-12 — Exhaustive QA and final handoff

- Test on clean isolated environment and against actual browser UI (not only DOM-less unit tests). Run relevant `pnpm` lint/typecheck/format/build/unit/integration/E2E scripts, record commands and versions; explain if a script is unavailable. Do not silently mark unrun tests PASS.
- Route matrix: public home, demo, pricing, login/signup, Studio dashboard/My Games gallery/list/explore/account/packages, editor as **read-only baseline**, host/lobby/players/shortcuts/settings/history, spectator display, player join, archived games and theme variants; network error/loading/empty states.
- Viewport matrix: 1920x1080, 1366x768, 1280x720, 1024x768, iPad portrait/landscape simulation, narrow phone, 200% zoom, fullscreen projector, RTL fixture and supported locales (en/fr/de/es/it/ja/tr/vi), reduced motion and keyboard only; test real device where available or mark not tested.
- Lifecycle matrix: fresh join, QR URL and PIN, valid phone dial-in when configured, no phone scenario, roster import/CRUD/reconnect, host copy/show/fullscreen, timer start/pause/early-end/skip/restart, scene transition and result views, theme-specific background override, audio pause/resume, game resume, accessible dialogs and data privacy.
- Automated screenshot comparison against verified baselines; clearly classify approved appearance changes versus unexpected regressions. Preserve original editor pixel and functional baseline, along with Razzia/theme fallback; if any editor difference is caused by shared tokens or portals, **revert or scope the change**.
- Deliver architecture map, catalog URL/dev launch instructions, token registry, component API map, changed files summary, upstream touches ledger, naming compatibility map, QA pass/fail/not-run list, before/after screenshots, rollback commands, known issues and production readiness recommendation.
- **Separate owner approval gate:** final validated branch does not automatically authorize `main` merge, deployment, production DB writes or container cleanup. Request approval with exact candidate SHA and release/rollback plan, then carry out only if authorized.
- Exit: owner-facing final report and Asana phase evidence. Parent task must stay OPEN if production acceptance/deployment is pending or any required phase is incomplete; clearly distinguish "dev implementation verified" from "production deployed".

## 4. Source pointers (initial inspection; verify latest paths)

| Concern | Likely current file(s) |
| --- | --- |
| New Studio site shell | `extensions/src/site/web/studio/Studio.tsx` |
| Games listing / duplicated actions | `extensions/src/site/web/studio/MyGames.tsx`, `extensions/src/site/themes/studio.ts` |
| Site styles, dialog | `extensions/src/site/themes/studio.ts`, `extensions/src/site/web/shared/ReferenceCanvas.tsx`, `extensions/src/site/themes/native.css` |
| Existing package tool | `extensions/src/site/web/studio/PackageTools.tsx`, `extensions/src/site/themes/packages.ts` |
| Marketing demo | `extensions/src/site/web/marketing/MarketingSite.tsx` |
| Old classroom underlay | `packages/web/src/components/GameBackground.tsx`, `packages/web/src/assets/background.png` |
| Stage host shell | `packages/web/src/features/game/components/GameWrapper.tsx`, `ManagerControlToolbar.tsx` |
| Host keyboard help | `packages/web/src/features/game/components/HostShortcutsDialog.tsx` |
| Roster/dialogs | `packages/web/src/features/game/components/HostPlayersModal.tsx`, `GameSettingsModal/index.tsx`, `HistoryDialog.tsx` |
| Legacy join | `packages/web/src/features/game/components/states/Room.tsx` |
| Tadazz join | `packages/web/src/features/game/components/tadazz-show/TadazzScreens.tsx` |
| Creating Worlds seating | `extensions/src/presentation/tadazz-v4/reference-story/SeatingPlan.tsx` |
| Native cinematic stage | `extensions/src/presentation/tadazz-v4/TadazzV4Stage.tsx`, `motion.ts`, `extensions/src/presentation/tadazz-show/TadazzV4StageAdapter.tsx` |
| Theme versions/contracts | `extensions/src/core/show-themes/definition.ts`, `classic.manifest.json`, `razzia.manifest.json` |
| Old serialized authored show | `extensions/src/core/show-authoring-schema.ts`, `show-authoring-convert.ts`, `show-import-preflight.ts` |
| Original Razzia editor (freeze) | `packages/web/src/features/quizz/**`, `extensions/src/editor/**` |

**Important implementation nuance:** These paths describe consumers/owners, not automatic authorization to modify them. When the only candidate fix involves a protected `packages/**` path, design a downstream adapter, injected component, wrapper or style composition first, then document any truly unavoidable surgical seam and request consent. Do not confuse repository path visibility with ownership.

## 5. Explicit behavioral acceptance tests (minimum)

1. `Tadazz` displayed normally (title case) throughout ordinary English site/Studio/host UI, existing graphical logo identical. Historic persisted formats and Razzia copyright notices untouched.
2. Single token edit affects real new platform button/dialog across website and host/catalog in smoke test; no effect on frozen editor or on user-selected show palette.
3. All canonical components have typed imports and interaction stories, behavior and focus tests; no second independent button/dialog implementation inside migrated platform screens.
4. My Games gallery and list produce correctly proportioned thumbnails, no overflow, duplicate CTA noise or scattered destructive actions. Uses actual games, not fake categories/covers.
5. Host fullscreen has consistent themed backdrop across entire viewport, including behind controls; no classroom bleed, wrong theme fallback, black bar, old-background flash, cropped stage content or body scrolling. Public audience view clean.
6. QR+PIN+URL+configured phone number, if present, are sourced from correct current room, lock-aware and scannable; creating-worlds themed layout and table representative names preserve placement and safety; no public PII.
7. Host audience display / local presenter distinguish modes; audio vs gameplay pause remain independent; shortcuts, skip vs early finish, restart and previous semantics unchanged.
8. Roster 38/50 synthetic registered participants imports and updates correctly, live connected status is server-driven, deletion asks for confirmation, 400-row synthetic table remains navigable. Never commit personal phone numbers.
9. Modal close/keyboard/scroll/fullscreen/portal layering pass, including Escape and 200% zoom; no trap in dialogs with nested menus.
10. Previously created themes, legacy Razzia presentation, authored JSON/XLSX imports and saved game assets still round-trip; scoring and telephony unchanged.
11. Editor has **zero changed tracked files** and is visually/behaviorally unchanged under the new production CSS/JS bundle. Negative regression tests are mandatory; untouched source alone is insufficient if shared CSS leaks.
12. All known failures in phase acceptance are either fixed, explicitly blocked in Asana, or acknowledged as out of scope; nothing is silently omitted.

## 6. Continuous resumability protocol — mandatory at EACH phase and session boundary

**Never batch phase completion updates until the end.** Perform one coherent phase, run verification, commit, update Asana subtask, update `docs/extensions/plans/TDS_PROGRESS.md`, and only then move to the next. If quota/time expires, preserve checkpoint immediately before stopping.

Every phase checkpoint must contain:

```text
PHASE: TDS-XX  [NOT_STARTED | IN_PROGRESS | BLOCKED | CODE_COMPLETE_UNVERIFIED | VERIFIED]
Asana parent: 1220402777392717
Asana subtask: <exact GID>
Working branch and worktree:
BASE_HEAD:
NEW_HEAD / commit(s):
Diff paths (especially editor/upstream guard):
What changed:
Decision and tradeoffs:
Test commands, result and artifacts: [PASS / FAIL / NOT RUN for each]
Visual evidence (screenshots paths/URLs, anonymized):
Compatibility / security / accessibility checks:
Outstanding bugs + blockers:
Next exact action:
Owner approval required? [yes/no, for what]
```

- Put phase status and full checkpoint as **task description update** (not only a transient comment). The Asana task checkbox is the authoritative completion marker only for **VERIFIED** phases. Do not mark completed for partial implementation, unverified tests or a successful code commit alone.
- At least at the start and end of each working session, re-fetch parent/subtasks from Asana and `TDS_PROGRESS.md`, compare with actual Git branch and SHA, and reconcile discrepancies by evidence (Git > unverified status claims). Never trust earlier claimed production state without verifying it.
- Use the **same existing Asana tasks**, never create duplicate phases if resuming. If parallel agents are necessary, isolate worktrees and files and record explicit ownership; default to a **single sequential coding agent** for consistency.
- If Asana integration is temporarily unavailable, commit local `TDS_PROGRESS.md` and an `ASANA_SYNC_PENDING.md` recording the exact task IDs and outstanding updates. Do **not** falsely mark Asana as updated; sync promptly on restored access.
- Keep parent open while any subtask remains incomplete or final owner release gate is pending; report current phase and future sequence in every handoff.

## 7. Safety gates and explicit stops

- **Stop and escalate:** any desire to modify editor code or its appearance; any unavoidable upstream code change without owner approval; customer data migration; secret or live production access changes; new billing or telephone provider behavior; deployment or merge; any destructive production operation.
- It is okay to finish code and tests in a dedicated branch without asking permission for each internal styling choice, provided the above limits are obeyed.
- If a suggested change only makes the site look prettier but removes a real feature, do **not** do it. Preserve functional controls behind coherent progressive disclosure.
- If packaging/Storybook would enlarge public initial JS unexpectedly, lazy-load and isolate; measure before/after. Do not inadvertently import editor/large media into marketing root.
- All tests must respect licensed assets and customer privacy. Use safe fixture data; never log telephone contacts.

## 8. Definition of done and final report format

The initiative is **implementation-complete** only when all relevant verified Asana subtasks are updated and every technical criterion above passes on exact candidate SHA; the **release** remains separately gated by owner approval. Prepare a clear owner-facing report with:

- Implemented vs deferred vs blocked; Asana subtasks status table, latest candidate SHA and worktree.
- Visual before/after and current screenshots: website, Studio gallery/list, account, host join, fullscreen, keyboard shortcuts, roster, QR and audience-only, catalog.
- Design System launch command, paths, import guide, token names and component APIs.
- Proof that content editor source and appearance are unchanged; upstream touch ledger and compatibility mapping.
- Full test evidence on Chromium and WebKit, desktop/tablet/mobile/projector, RTL/i18n, smoke, security and performance, including NOT RUN.
- Exact safe merge and deployment plan with rollback, **without performing them until explicit authorization**.

**Final mandate:** deliver a cohesive Tadazz platform experience and maintainable actual component library, while preserving the existing professional editor exactly as it is and ensuring any future coding agent can resume each verified phase from Asana and Git evidence without redoing completed work.
