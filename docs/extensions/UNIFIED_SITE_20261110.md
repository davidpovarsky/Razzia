# Unified TADAZZ site — implementation and acceptance

## Scope and baseline

Owner instruction: `docs/design-reference/handoff-20261110/TADAZZ_UNIFIED_SITE_AGENT_PROMPT.md`.
All 48 delivery files verified against the supplied SHA-256 manifest.
Working branch: `codex/tadazz-unified-site-20261110`; clean integration base
`18d3c9d` (`codex/tadazz-package-runtime-20261109`). Preview source inspected at
`08ddc42` (`feat/tadazz-site-library-parity-20261110`). The preview consists of
five commits on that base. It is source material, not a branch to merge wholesale.
The dirty `agent/tadazz-next-20261105` worktree is preserved untouched.

## Initial implementation map

- Public reference React markup and sourced animation components migrate to
  `extensions/src/site`; original CSS/assets live in `extensions/site-assets`.
- A downstream Vite config composes the existing web config. Its opt-in HTML
  entry composition mounts the downstream bootstrap. No upstream source or
  generated router patch. Default web commands remain unchanged.
- The bootstrap uses the existing root route/providers and router public
  `addChildren` API to add public and authenticated site routes. It retains
  `/game`, PIN links, manager, editor, display, host and player routes.
- Account UI reuses `/api/accounts/*`, `/api/auth/logout`, and the existing
  session module. Protected screens first verify `/api/accounts/me`; query
  keys include account ID. Logout cancels/clears private caches and socket.
- My Games reuses the real import preflight/export/package APIs and original
  editor routes. Deletes use the composite API to preserve sidecar consistency.
- My Events uses actual results and `createGame`, including original manager
  store initialization. There is no persisted scheduled-event catalogue.
- Account shows actual profile and billing configuration. Disabled billing
  provides no checkout. Explore remains clearly marked illustrative because
  no public template-installation contract exists.

## Upstream touch ledger

No `packages/**` source edits authorized or planned. Supported Vite HTML entry
composition plus TanStack route composition avoids a new upstream hook.
Editor, runtime, server, common schemas and original generated route tree stay
byte-identical to the integration base. Feature enabled only by the downstream
build config **and** `TADAZZ_SITE_ENABLED=true`; default OFF.

## Acceptance evidence

Results and exact commands are recorded in `qa-evidence/unified-site-20261110/`.
This is a local implementation, not a production deployment or an assertion
that missing catalogue/contact/scheduling services now exist.

## Working routes and compatibility

| Route                                                                                   | Behavior                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`, `/site`                                                                            | Approved public React marketing; Home → play choices → featured examples → bespoke CTA → footer. `?view=store`, `how`, `pricing`, `custom`, `demo`, `product&game=<example>` survive refresh/history.             |
| `/login`, `/signup`, `/verify`, `/forgot`, `/reset`                                     | Real account endpoints, verification/resend/reset, error/pending states. `/site/login` and `/site/signup` remain compatible. Password/code never enter URLs.                                                      |
| `/studio`, `/site/studio`                                                               | Verified account gate, personalized dashboard, actual game/result counts, account-scoped data.                                                                                                                    |
| `/studio/games`                                                                         | Real saved games, search, name ordering, gallery/list, create/edit, duplicate, original import preflight, legacy/enhanced/Excel/authored-JSON exports, composite delete confirmation, package tools when enabled. |
| `/studio/explore`                                                                       | Explicitly illustrative ready-made/customize/new tiers. Public template copying is disabled; own game creation works. Existing private package management remains in My Games and legacy tools.                   |
| `/studio/prepare`                                                                       | Select an owned quiz, create a real game room, initialize original manager state, navigate to the unchanged host. `?quiz=<id>` preselects only a currently owned ID.                                              |
| `/studio/events`                                                                        | Actual historical results/details/delete and last opened in-memory room, with existing host/presenter links. Session availability is revalidated by the original host.                                            |
| `/studio/account`                                                                       | Actual profile, password reset, language, backend billing configuration; read-only real grants/remaining capacity when configured. Disabled billing exposes no checkout.                                          |
| `/manager/config`                                                                       | Opt-in composition redirects editor Save/Exit to `/studio/games`. Existing `packageUpload` links go to `/studio/legacy` with their query preserved.                                                               |
| `/studio/legacy`                                                                        | Verified-account wrapper around the **unchanged** original management component. All historical business functions remain reachable.                                                                              |
| `/manager/quizz`, `/manager/quizz/$quizzId`                                             | Original editor/provider, markup, tabs, scene/question/participant/launch capabilities and save formats unchanged. No new overlay over editor controls.                                                           |
| `/manager`, `/manager/checkout`, `/game`, `/party/*`, `/display/*`, `/manager/themes/*` | Original routes retained. Printed `/?pin=...` links hand off to the original `/game` flow. Tokens remain on the same origin.                                                                                      |

## Live versus illustrative data

| Screen                         | Real data/operations                                                                            | Deliberate unavailable capabilities                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing/library/product/demo | Navigation, filters, search, local sample answers and clearly labelled sample results.          | Example catalogue is **not** a public server-backed game store. No copies or purchases are simulated.                                                                                                                               |
| Pricing/custom                 | Approved comparison/estimator/form visual language; account entry works.                        | Plans/capacities labelled illustrative; no fabricated prices, reservations, payments, sent enquiries or delivery promises. Contact submit is disabled.                                                                              |
| Accounts                       | Existing registration, email code verification/resend, login, reset, logout/session retirement. | Backend has no profile rename/email-change contract; no pretend Save controls. Real mail delivery was not contacted in QA.                                                                                                          |
| Dashboard/My Games             | Owner-scoped quizzes; actual mutations and exports; original editor persistence.                | Metadata API exposes ID and subject only: no invented last-edited time, draft/published status or category. Name ordering and title search are supported. Dashboard continuation uses a real available game, not fictional recency. |
| Explore                        | Own game creation and existing private package tools.                                           | `/api/themes/catalog` is authenticated renderer/theme metadata, not a public quiz-template store. No public game-template install/purchase endpoint was found.                                                                      |
| Events                         | Real results API and real room creation/host/presenter.                                         | No durable scheduled-event catalogue or active-session listing API. Last opened room comes from the original manager store and may have expired.                                                                                    |
| Account/licences               | Real profile, config and configured billing snapshot/grants.                                    | Live checkout/paid orders were not exercised. Configured billing routes remain available through original management. No fake quotas when disabled.                                                                                 |

## Integration and security details

- Existing account session module remains the only credential store. No new
  identity database, token forwarding, public API proxy or credential changes.
- Private queries first verify `/api/accounts/me`; keys include account ID.
  Login/logout cancel and clear caches, disconnect the game socket and reset
  manager state. Storage changes, expiry and restored history pages revalidate
  identity and reload data. The server remains the authorization authority.
- Duplicate exports/imports through the existing enhanced-bundle contract,
  generating fresh quiz/question IDs while retaining enhancements. It does
  not clone only the legacy question data or invent a duplicate endpoint.
- One downstream backend correction: `CompositeStorageService.deleteCompositeQuiz`
  resolves the quiz in the current tenant before deleting either part. Absent
  or foreign IDs now return the existing 404 contract instead of an unrelated
  storage exception becoming 500. Covered by unit and actual HTTP/browser tests.
- Reference styles live inside a ShadowRoot. Tailwind utility tokens are reused
  **without** game-specific selectors or global preflight. Site controls delegate
  to the real host button; editor and runtime never mount the reference canvas.
- Native dialogs provide confirmation/help focus and Escape behavior; original
  result details are composed inside a native modal without changing their code.
- 225 site translation keys cover all eight existing languages. User-provided
  quiz subjects/results and backend plan identifiers are data, not translated UI.

## Source structure and exceptions

Features are separated into account, marketing/catalogue/pricing, games,
events/preparation, account/licences, session adapters, shared controls/dialogs,
scoped themes, locales and QA. Most modules are small. The marketing composition,
account state/form and Studio shell exceed the historical 250-line target to
retain explicit reference markup and an auditable single account gate; none
replaces the existing editor or introduces an engine/registry framework.

Exact source inventory and reference hash verification are recorded with the
final evidence. Component origins/licences are in
`UNIFIED_SITE_SOURCES_20261110.md`; the majority of the UI is local TADAZZ code.

## Rollout and rollback — documentation only

The ordinary web build/config remains the default and does not import the site.
Opt-in needs **both** the downstream config and `TADAZZ_SITE_ENABLED=true`.
Use the existing same-origin account/backend deployment; never transfer tokens
to the historical preview hostname. Account mode must already have its existing
persistent signing secret and email configuration; this task changes neither.

Local Windows example, in this worktree with Node 24 on the process PATH:

```powershell
$env:TADAZZ_SITE_ENABLED = 'true'
pnpm --filter @razzia/extensions site:build
pnpm --filter @razzia/extensions site:preview
```

The preview proxies `/api` and `/ws` through the same web origin, using the
existing backend port configuration. The package root script does not silently
enable the rollout flag. QA configs supply isolated ports/configuration and a
local-only mail sink; they are not production launch commands.

For future approved deployment: build with the downstream config/flag, serve its
normal `packages/web/dist` output with the existing SPA fallback and same-origin
API/socket/media routes. Keep existing compatibility routes and private data.
First resolve the documented baseline test defect and separately approve rollout.

Rollback: rebuild with the ordinary upstream web config (or unset the flag in
the downstream config) and redeploy that approved artifact. No database migration,
quiz rewrite, reverse migration, session schema change or data deletion is needed.
Do not remove legacy tools until their retirement is separately approved.

No push, production deployment, merge, live account creation, live email, payment,
telephony/provider call, public tunnel or Asana edit was performed.

## Final verification — 10 November 2026

Commands below ran from this isolated worktree with Node 24.22.1 on the process
PATH and the frozen pnpm lockfile. Logs, machine-readable browser reports and
eight screenshots are in `qa-evidence/unified-site-20261110/`.

| Check / command                                                                                                                                                         | Observed result                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --prefer-offline`                                                                                                                       | Passed; existing resolved dependency versions preserved.                                                                                                                                |
| `pnpm --filter @razzia/extensions test --maxWorkers 2`                                                                                                                  | **671 tests passed, 80 files**, exit 0. Includes downstream storage, auth boundaries, runtime and telephony tests.                                                                      |
| `pnpm test --maxWorkers 2`                                                                                                                                              | **364 passed, 1 failed**, 37 files, exit 1. Existing Windows oversized-upload failure detailed below.                                                                                   |
| `pnpm exec tsc -p extensions/tsconfig.json --noEmit`                                                                                                                    | Passed, exit 0.                                                                                                                                                                         |
| `pnpm exec tsc -p packages/web/tsconfig.app.json --noEmit`                                                                                                              | Passed, exit 0.                                                                                                                                                                         |
| `pnpm exec tsc -p packages/socket/tsconfig.json --noEmit`                                                                                                               | Passed, exit 0.                                                                                                                                                                         |
| `pnpm exec oxlint`                                                                                                                                                      | Whole repository passed, exit 0.                                                                                                                                                        |
| `pnpm exec prettier --check . --log-level warn`                                                                                                                         | Whole repository passed, exit 0; immutable owner references excluded.                                                                                                                   |
| `pnpm build`                                                                                                                                                            | Ordinary default-OFF web and socket builds passed, exit 0. Default web bundle contains no site entry.                                                                                   |
| `pnpm --dir extensions exec playwright test --config site.playwright.config.ts`                                                                                         | **6 passed**, exit 0; real isolated account/backend APIs and opt-in production build.                                                                                                   |
| `pnpm --dir extensions exec playwright test --config site.playwright.config.ts --grep 'public routes\|real account\|past events' --reporter=list`                       | **3 passed** after final mobile CTA/avatar, source beam hook and result pluralization corrections.                                                                                      |
| `pnpm --dir extensions exec playwright test --config site.baseline.playwright.config.ts --grep 'saves every question\|keeps the site\|current runtime\|current native'` | **4 passed**, exit 0; default-OFF original editor save, original auth, two-player answers/ranking/podium and native host/presenter presentation, Escape and authoritative pause/resume. |
| `git diff --check`; upstream diff/hash audit                                                                                                                            | Clean whitespace; zero modified `packages/**` files, including editor and generated router. All 48 supplied payload hashes and 18 copied asset hashes match.                            |

The browser scenarios additionally cover create/save/edit/save through the
original editor, enhanced duplicate/import/export/delete and retry after an
injected server deletion error; prepare/host handoff; actual persisted results;
verification/reset/failed login/expiry/logout; foreign-tenant mutation denial;
safe post-login destinations; disabled billing; direct routes/history; all eight
locales and reduced motion. No new database schema or engine changes.

Screenshots were visually reviewed against the supplied desktop/mobile reference
images at 1440×900, 1024×768 and 390×844; the browser checks assert no horizontal
overflow. This is visual review, not an automated pixel-equality claim. Real empty
accounts, real profile text and disabled illustrative actions intentionally differ
from the prototype's fabricated sample account. Browser execution was Microsoft
Edge Chromium on Windows; Safari, physical devices and live delivery/payments
were not exercised. The original editor design remains a separate future task.

### Known defects and release limits

1. Root unit suite is **not fully green**: the existing theme-upload HTTP test
   at `packages/socket/src/api/extensions/theme-routes.test.ts:177` receives
   Windows `ECONNRESET` while expecting an oversized-body 413 response. The same
   targeted test failed in the untouched clean base worktree at `18d3c9d`:
   `pnpm exec vitest run --project socket packages/socket/src/api/extensions/theme-routes.test.ts --maxWorkers 2`.
   Both failure logs are retained. No unauthorized upstream fix was made.
2. An initial run of the unmodified historical E2E scripts produced two passes
   and two failures: the old player test navigates `/` instead of the current
   `/game` join route; the old presentation script expects a cinematic-only
   lobby selector and obsolete single-key shortcuts. The retained attempt is
   not counted as passing. The four explicit current-runtime checks above pass
   using the existing double-press safety shortcuts and native presenter.
3. Public template installation, durable scheduled events and contact delivery
   have no current backend contract; affected actions stay disabled/labelled.
   Billing remains controlled by actual backend configuration. None of these
   gaps is hidden behind a fake success message.
4. Vite reports the existing native-config import-extension warning and a large
   production chunk warning (also present in the default build). No build error
   or browser hydration/page exception was observed in the checked flows.

The branch is reviewable local work. Production rollout remains unapproved and
the flag remains OFF by default. The source inventory distinguishes new feature
modules, QA/reference/evidence files and the small existing downstream/tooling
changes; it contains no upstream modification.
