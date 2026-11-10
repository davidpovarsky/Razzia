# TADAZZ static React design preview (Oracle server, 2026-11-10)

## External review links

- Marketing: https://site-preview.132.145.25.168.sslip.io/site
- Studio (guest or logged in): https://site-preview.132.145.25.168.sslip.io/site/studio
- Log in: https://site-preview.132.145.25.168.sslip.io/site/login
- Create account: https://site-preview.132.145.25.168.sslip.io/site/signup

The website runs directly on the **existing Oracle TADAZZ server**. This is
an isolated **static file_server** route in the existing Caddy service, not a
Docker container, new Node service, or second game installation.

## Deployment map

- Host DNS: `site-preview.132.145.25.168.sslip.io` using sslip.io dynamic DNS
- Site content: `/srv/tadazz-site-preview/current` -> `releases/20261110-auth-v3`
- Site config: `/etc/caddy/tadazz-site-preview-20261110.caddy`
- Existing Caddyfile imports that file with one top-level `import` line.
- Tracked source: `docs/design-reference/CADDY_SITE_PREVIEW.caddy`
- Source build: `packages/web/tadazz-preview.html` +
  `packages/web/src/tadazz-standalone-preview-main.tsx` +
  `packages/web/tadazz-preview.vite.config.ts`
- Build command from `packages/web`: `vite build --config tadazz-preview.vite.config.ts`
- Compiled site: `dist-site-preview/tadazz-preview.html` copied to `index.html`,
  plus _only_ `assets/` and `tadazz-design-reference/` from compiled output.
- Current standalone deployment was built from this worktree; only 20 UI/asset files are served.
- Version-3 archive SHA-256:
  `1f357d32475d667450de91ada51d1eab903f4c5b34030d6a3d50d08a6ccd67dd`.
- Production `https://tadazz.com` still uses its original Caddy site block and game services.
- The website is static, but the staging host now selectively proxies account APIs
  and account-scoped **read-only quiz metadata** to the existing production backend.

## Public preview security & API integration

- The preview pages are **public**; account and quiz data require real authentication.
- Account operations use the live production account service. **Creating an account
  here creates a real TADAZZ account**, not a test fixture. No email or password
  has been used during automated testing.
- GET allowed: `/api/auth/mode`, `/api/accounts/me`, `/api/quizz`.
- POST allowed: `/api/auth/session`, `/api/auth/logout`,
  `/api/accounts/login`, `/api/accounts/register`, `/api/accounts/verify`,
  `/api/accounts/resend`, `/api/accounts/forgot`, `/api/accounts/reset`.
- Every other API route is blocked. No quiz writes, game launches, telephony
  mutations or checkout on this preview hostname.
- Real Manager sessions load their **own** quizzes via existing backend tenant
  scoping; new/edit links open the original editor at `https://tadazz.com`,
  which may request another login because browser storage is per origin.
- The catalogue and fake single-round result percentages are **samples**, not
  production template inventory or real audience votes.
- Original HTML files and source JS are **not** deployed here.
- `X-Robots-Tag: noindex, nofollow, noarchive` is sent, but this is **not**
  an authentication control.
- Hover.dev free snippet commercial reuse terms still need independent review.
- Hostname relies on third-party sslip.io DNS, valid while Oracle IP is unchanged.

## Verified externally (2026-11-10)

- Public marketing, Studio, login and signup HTML routes all returned HTTP 200.
- `/api/auth/mode` returned real `accountsEnabled:true` and `/api/quizz`
  without authorization returned HTTP 401 (expected).
- POST `/api/quizz` and GET `/api/billing/config` returned 404 (blocked).
- Site-to-login-to-registration-to-Login flow and manager-owned quiz list were
  tested in Chromium mobile emulation using an **intercepted, mocked** login
  and game-list response; no real account was created or modified.
- Real browser tests also verified mobile Account/Sign-out navigation, the
  illustrative demo results and zero browser JavaScript errors.
- The original production game remains available at `https://tadazz.com`.
- No live credential login, verification email, real create/edit or checkout
  end-to-end test was performed (these remain release blockers).
- Old Windows Cloudflare tunnel and Node preview server were stopped.

## Rollback

Remove the single preview import line from `/etc/caddy/Caddyfile`, validate
Caddy configuration, reload Caddy, and optionally remove this preview's
files and Caddy snippet. Never change existing `tadazz.com` site blocks.
