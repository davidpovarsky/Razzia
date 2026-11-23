# Unified TADAZZ website: source-grounded integration plan

Checked against the real Razzia/TADAZZ React repository and the Oracle server on 2026-11-10. **This is not an assertion that all work is already implemented.**

## Proposed primary navigation and owner of each feature

| User-facing area                                         | Target experience                                                                     | Reuse from existing repo                                                                                               | Decision / status                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Public homepage, How it works, gallery, pricing, contact | Public marketing, no login needed                                                     | `SitePreview.tsx` with supplied original marketing HTML assets                                                         | React preview exists; catalogue is still **example data**, not a published templates database                                         |
| Log in / Sign up / Verify / Forgot                       | Branded account screen within the same site                                           | `packages/socket/src/api/routes/accounts.ts` and existing `AccountLogin.tsx` contract                                  | Real account API enabled on production; preview uses narrowly proxied real account endpoints                                          |
| My Studio                                                | Logged-in Dashboard, My Games, Explore, Events, Account                               | `SitePreview.tsx`, `quizzListQuery()` and `/api/quizz`                                                                 | Real account-scoped **GET only** enabled on preview; a browser fixture verifies rendering, no real password used                      |
| Create / edit game                                       | Existing professional editor, with a minimal branded header and **Back to My Studio** | `packages/web/src/features/quizz/components/studio/StudioShell`, routes `/manager/quizz` and `/manager/quizz/$quizzId` | **Keep editor unchanged**. Preview currently links to the production editor, so a second sign-in may be required across hostnames     |
| My Games management                                      | Consistent card/list UI, Import, Export, Edit, Delete, Duplicate                      | `ConfigManageQuizz.tsx`, `ShowImportModal`, `ShowExportActions`, package manager                                       | Migrate existing actions carefully into contextual menus rather than duplicate implementations; destructive actions need confirmation |
| My Events / Prepare Show                                 | Game selection, show setup, projectors, audio, participant counts, host controls      | `ConfigSelectQuizz.tsx`, `createGame`, `/party/manager/$gameId`                                                        | Preserve existing operational logic; preview checklist is only visual                                                                 |
| Past Events / Results                                    | Previous shows and result history                                                     | `ConfigResults.tsx`, `ResultModal`, `resultsListQuery()`                                                               | Move presentation into My Events; **do not delete the data APIs**                                                                     |
| Account & Licences                                       | Actual account, quotas, billing/checkout when activated                               | `AccountBilling`, `/manager/checkout`, billing API                                                                     | **Not yet live**: production billing config reports `enabled:false`; preview cannot charge                                            |
| Presenter, player, phone voting                          | Fullscreen, low-latency runtime routes                                                | `/display/$gameId`, `/party/$gameId`, `/party/manager/$gameId`, phone gateway                                          | **Keep as separate immersive full-screen modes**, no marketing navigation overlays                                                    |

## What is redundant when the new Studio reaches feature parity?

- The **old manager configuration tab _screen_** (`/manager/config`) becomes redundant as a top-level destination only after its **Start game**, **Manage quizzes**, **Results**, account and billing actions are re-homed, tested and discoverable. Do not remove its business logic or routes early.
- The **old login screen wrapper** (`ManagerAuthBackground`, `ManagerAuthPage`) can be visually replaced with the new branded account screens, but retain security logic and backward-compatible legacy player joins.
- Do not create a second game editor, a separate localStorage game catalogue for real accounts, or a competing checkout screen. Those would cause data inconsistency.

## What is definitely not redundant?

- `StudioShell`, `QuizzEditorProvider` and real create/update routes.
- Import/export (`.tadazz`, JSON, XLSX), package migration, results and launch mechanics.
- Host/manager runtime, presenter, players, telephone and audio controls.
- Backend account scoping, authentication, account quotas, session revocation, billing checks.
- Current staging, production and release safeguards; do not combine UI migration with live game infrastructure changes.

## Coherent visual system

Use the approved two HTML files as **source of truth** for positions, section order, artwork, colors, typography and density. Extract a shared token layer (deep violet, lime accent, gradients, radii, typography, focus rings, shadows) and apply it to new public account shell, Studio navigation and the editor **frame**. Avoid imposing a heavyweight sidebar _inside_ the editor canvas; it needs maximum workspace and only a simple return affordance.

Actual sourced UI in this branch: **Hover.dev Hover Tilt Card** (marketing game cards) and **Magic UI Border Beam** (marketing hero); existing `lucide-react` icons and `motion` API are also used. Other panels, buttons, form fields, navigation, demo reveal and branding are **local TADAZZ implementations** or copied from the supplied design reference. They are **not all sourced third-party components**. Add Radix UI accessible primitives incrementally where suitable; don't pile animations on every control. See `COMPONENT_SOURCES.md` for exact provenance and terms.

## Current trial-host boundary

`https://site-preview.132.145.25.168.sslip.io` is a **public** preview hostname. Account login/register/verify/reset flows use production's actual accounts backend. `GET /api/quizz` is authenticated/account-scoped and read-only; editing and game writes are blocked on this hostname. **Signing up here creates a real TADAZZ account**, not a disposable staging fixture. Do not perform load, purchase or fake-account tests against this backend.

The preview links editor actions to `https://tadazz.com/manager/quizz` / `.../$quizzId`. Because the domains differ, token storage is not shared, so users may be asked to log in again. This is a **known preview limitation**. On the final public domain, both the new Studio and existing editor should be mounted under the same origin and share a verified session.

## Production migration gates

1. Confirm all layouts in both approved HTMLs at desktop/tablet/phone, including guest and authenticated states.
2. Confirm real account login, registration email verify and password reset using authorized test accounts (not yet completed in this preview).
3. Confirm account tenant isolation and role checking on the server; automate read/write authorization regression.
4. Connect real quiz editor and management actions _on the same production origin_ only after full feature parity; retain current editor routes for deep links.
5. Migrate results/import/export/events; leave runtime control routes untouched.
6. Enable billing UI only after approved Paddle live integration, pricing/content audit and end-to-end checkout verification.
7. Roll out behind a feature flag, then switch homepage with an explicit rollback plan; remove redundant old screens only after all old operations are accessible.

**No original editing, live game, presenter, database or telephony files were modified by this UI integration work.**
