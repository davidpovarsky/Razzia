# LOCAL DEVELOPMENT READINESS — Windows 11 (2026-10-24)

## Scope and evidence

Read-only inventory performed on machine david_and_goldy against the actual cloned Razzia 4.0.1 repository. No packages installed, services started, credentials created, or upstream code modified. This report distinguishes command availability from functioning service readiness.

## Confirmed hardware

- Windows 11 Pro x64, build 26300; Intel i7-9750H, 6 cores/12 threads; 15.7 GiB RAM; ~4.5 GiB free at inspection.
- C: 475.5 GB total, 49.4 GB free. G: 200 GB total, 6.6 GB free.
- Recommendation: preserve at least ~25 GB headroom on C; avoid putting Docker images or large load-test recordings on G. Do not delete data automatically.
- Development ports 3000/3001/5173 were not listening at inspection; 9222 was occupied (Chrome remote debugging or another local process, identity not established).

## Installed and verified

- Node 22.17.0 (NOT compatible with repository requirement Node 24+).
- npm 10.9.2, pnpm 11.24.0 (meets documented 10.16+), corepack 0.33.0.
- Git 2.52.0.windows.1; GitHub CLI 2.96.0; VS Code installed.
- Docker CLI 29.7.2, Docker Compose v5.4.0, Docker Desktop installed BUT Linux Engine unavailable, com.docker.service stopped. WSL2 installed; Ubuntu and docker-desktop distributions stopped. No Docker requirement for daily Node development.
- Python 3.12 and 3.10, uv, bun, Scoop, Chocolatey, winget available; none essential for core Razzia.
- Google Chrome and Microsoft Edge installed. Playwright browser caches exist at LOCALAPPDATA/ms-playwright (Chromium 1217 and 1248, headless shells). Exact browser revision compatibility with repository Playwright version NOT confirmed until dependencies installed.
- Antigravity installed and running, Codex processes running, .codex/skills and .gemini/antigravity/skills present. Shell commands 'codex' and 'antigravity' absent from PATH; not evidence apps are missing.
- No node version manager found (fnm/nvm/Volta/mise/nvs). Node 24 can be provisioned in a project-local isolated runtime; prefer not to overwrite Node 22 globally.

## Repository state

- Path: C:/Users/DAVID/Code/Razzia; branch feat/modular-extensions-planning.
- No node_modules, root .env, root config, or build output present at inspection.
- docs/extensions and AGENTS.md/GEMINI.md are untracked planning documents. No tracked upstream file modifications.
- Razzia README.md and .github/CONTRIBUTING.md explicitly require Node 24+ and pnpm 10.16+.
- pnpm-lock.yaml exists; prefer frozen lockfile install. pnpm-workspace.yaml includes packages/*, catalogs and native build allowlist.
- Root scripts: pnpm dev; pnpm build; pnpm test; pnpm test:e2e; pnpm lint; pnpm format.
- Development endpoints: web localhost:3000, socket localhost:3001. Socket.IO /ws, HTTP /api. Vite config binds host 0.0.0.0; for strictly local-only usage configure Windows firewall and/or host binding to loopback. Do not expose public tunnels.
- .env.example keys: MANAGER_PASSWORD, JWT_SECRET, WEB_PORT, SOCKET_PORT. .env and config are gitignored.
- Source config storage: config/quizz, config/results, config/media, config/branding. Razzia creates config on first run.
- For stable local login during restarts, generate a random >=32 character JWT_SECRET locally; keep secrets out of docs and git. For a fully isolated ephemeral test, leaving it empty is supported but invalidates sessions on restart.
- E2E tests use packages/e2e/.config, delete/reseed it on start, and use 3000/3001; NEVER put important quizzes there. Run e2e with dev servers stopped.
- Playwright Chromium browser is required by repo e2e project; Python Playwright CLI on PATH is not the JS @playwright/test dependency.

## Minimum necessary setup (requires user approval)

1. Install isolated Node.js 24 runtime or an approved Windows Node version manager, without disrupting existing Node 22 projects. Verify node -v >=24 and package-manager resolution in project shell.
2. In project root, run pnpm install --frozen-lockfile under Node 24. Resolve only actual dependency errors; avoid pnpm update.
3. Create gitignored .env from .env.example with a unique local manager password and random JWT secret; no real credentials in reports.
4. Run pnpm build, pnpm test, pnpm lint, pnpm format; record exact exit codes and failures.
5. Run pnpm dev and verify GET localhost:3001/api/health, browser localhost:3000, manager localhost:3000/manager, editor, quiz creation, web player join, score and reconnect.
6. With dev stopped, run pnpm --filter @razzia/e2e exec playwright install chromium only if required revision is missing; run pnpm test:e2e. E2E test runner launches its own servers and deletes ONLY packages/e2e/.config.
7. Keep dev content in config/ and separate extension simulator fixtures in tests/fixtures/; snapshot config before destructive experiments.
8. Docker Desktop is optional for later packaging/production parity; enable only on demand after memory/disk check.

## Local-only telephone simulation architecture (no paid provider or PSTN)

- Stage 1: browser keypad simulator using the real HTTP session->join-ticket and authenticated Socket.IO client path, emitting player:selectedAnswer only during SELECT_ANSWER. It is a protocol-level simulation, NOT a real telephone call.
- Stage 2: mock provider webhook emulator (localhost HTTP) sends signed/invalid/replayed/duplicated digit and call lifecycle events to provider adapter; record timings, idempotency, error and reconnect. Use generated test IDs only; no real telephone numbers.
- Stage 3 optional: local SIP/Asterisk + softphone if realistic call/audio/IVR testing is later needed; adds RAM/WSL/Docker cost and does not validate UK carrier/Yemot routing.
- No Twilio, Yemot subscription, phone number, ngrok/cloudflared, paid server, public DNS, SSL certificate, Postgres or Redis needed for stages 1-2.
- UK PSTN delivery, real DTMF transport, provider API quirks, network latency and pricing cannot be certified locally. Gate production deployment on a later real end-to-end provider test.
- Use deterministic latency injection (0/100/250/500/1000ms), disconnects, timeouts, replay and parallel sessions in simulator; compare fairness with browser players. Avoid claims of equivalent real-carrier latency.

## Recommended optional tools (not prerequisites)

- Node.js 24 version manager (fnm/Volta) for multiple projects.
- Docker Desktop running + WSL2 for container release smoke tests only.
- Playwright Trace Viewer, VS Code JS debugger, Chrome/Edge DevTools (already accessible through browser tooling).
- k6 or Artillery for later load testing; prefer install as project dev dependency after approval, not global install.
- FFmpeg for transcoding custom audio/video later; not needed for base game or keypad simulator.
- Local HTTPS via mkcert only if a feature explicitly requires secure context; no reason to expose publicly now.
- SIP tools only if a full simulated audio call is requested; do not preinstall.

## Risks and decisions

- Node 24 mismatch is blocking direct launch.
- Docker daemon not running, but optional.
- Available RAM at check ~4.5 GB; avoid running Antigravity + multiple Playwright workers + Docker simultaneously without checking pressure.
- Existing E2E default workers=3 and fullyParallel=true. For constrained machine, run with --workers=1 during initial smoke tests, without editing upstream config.
- Existing root clean script uses rm -rf, which is Unix-specific and should not be run on Windows PowerShell without verifying shell environment.
- Local Vite host 0.0.0.0 is not strictly localhost-only; bind to 127.0.0.1 or firewall-block inbound access for development.
- API /api/auth/manager currently documented without rate limiting; do not expose dev server to the internet.
- All phone-provider adapters remain simulated and cannot be considered production verified.
- Approval needed before installing/upgrading tools, writing .env, starting services or running tests that delete fixture data.

## Source pointers

README.md; .github/CONTRIBUTING.md; docs/configuration.md; docs/testing.md; docs/http-api.md; docs/websocket-protocol.md; package.json; pnpm-workspace.yaml; packages/e2e/playwright.config.ts; packages/e2e/utils/constants.ts; packages/web/vite.config.ts; packages/socket/src/app.ts; packages/socket/src/services/config.ts.
