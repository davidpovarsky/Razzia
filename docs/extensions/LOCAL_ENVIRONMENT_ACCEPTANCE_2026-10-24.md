# Local development environment acceptance — 2026-10-24

## Result: baseline ready for extension development

Machine: david_and_goldy, Windows 11 Pro, Intel i7-9750H, ~16 GB RAM.
Repo: C:/Users/DAVID/Code/Razzia
Branch: feat/modular-extensions-planning
Baseline commit: 5161eb7022144ee26d46a5f94cdbc714ec8b560d
Upstream tracked files changed: **none** (git diff --name-only HEAD empty at final check).
No cloud server, telephone account, public tunnel, real phone number or Docker daemon needed.

## Installation verified

- Node.js v24.22.1 installed at C:/Users/DAVID/.local/tools/node-v24.22.1-win-x64. Official SHA256 archive verified: d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5.
- Machine-wide Node.js v22.17.0 retained.
- pnpm v11.24.0; pnpm install --frozen-lockfile completed with exit code 0; 352 packages installed, lockfile supply-chain check passed (465 entries).
- Root .env created with unique random 64-character manager password and 64-character JWT secret; stored only in gitignored .env, not in this report. IMPORTANT: the initial generated file was detected to have empty values, immediately regenerated correctly and live authentication was re-tested successfully.
- Chrome/Playwright: @playwright/test v1.64.0, existing local Chromium sufficient; no browser download necessary.
- Docker CLI/Compose installed but Docker engine stopped. Not required.
- Repository-local Git core.autocrlf=false, core.eol=lf set; existing tracked files normalized to LF to meet project's lint rules, with **zero content differences** in Git after refresh. Do not re-enable global CRLF conversion for this repo.
- Untracked planning documents AGENTS.md, GEMINI.md and docs/extensions/*.md formatted using Prettier; no tracked upstream code changes.

## Baseline tests — measured

| Check                                      | Result | Evidence                                                                  |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------- |
| pnpm build                                 | PASS   | exit 0; rolldown socket and Vite web production bundles built             |
| pnpm test                                  | PASS   | 17 files, 217/217 tests passed; exit 0                                    |
| pnpm lint                                  | PASS   | 230 files, 233 rules, 0 errors and 0 warnings; exit 0                     |
| pnpm format                                | PASS   | exit 0 after formatting untracked docs and normalizing tracked CRLF       |
| pnpm --filter @razzia/e2e test --workers=1 | PASS   | 46/46 Playwright Chromium E2E passed in 1.8 minutes; exit 0               |
| Local server                               | PASS   | pnpm dev; socket port 3001 and Vite port 3000 running                     |
| GET /api/health                            | PASS   | {status:'ok'}                                                             |
| GET /manager                               | PASS   | HTTP 200                                                                  |
| POST /api/auth/manager                     | PASS   | authenticated with actual generated .env password, manager token returned |
| GET /api/quizz                             | PASS   | authenticated quiz list returned 1 sample quiz                            |
| Git tracked diff                           | PASS   | empty                                                                     |

**Important environment finding:** First lint attempt failed with 18,432 CRLF-only violations and Prettier failed on 324 files. Root cause was Git for Windows global core.autocrlf=true. Resolved by setting _repository-local_ core.autocrlf=false/core.eol=lf, normalizing tracked working files, and refreshing Git index. Rerun lint/format green. Do not revert local Git setting.

## Running now

- Dev process started via scripts/local/Start-Razzia.ps1 (Desktop Commander terminal session PID 18348 at verification time).
- Web: http://localhost:3000/
- Manager: http://localhost:3000/manager
- Socket health: http://localhost:3001/api/health
- Credentials: open gitignored .env locally. Do not print/share credentials.
- Run smoke: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local\Smoke-Razzia.ps1
- Run all baseline checks: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local\Verify-Razzia.ps1
- Run E2E only AFTER stopping dev (E2E owns 3000 and 3001 and clears packages/e2e/.config, not root config/).

## Outstanding risks / deferred by design

1. Razzia Vite dev binds 0.0.0.0:3000 and socket binds IPv6 wildcard :::3001. Thus these servers are running **on the local PC** but also reachable over some local/Tailscale interfaces depending on firewall. No public tunnel was configured. For strict loopback isolation, add a local-only launch mode or inbound firewall restrictions before testing with sensitive content. Do not use real personal data until isolated.
2. Telephony is NOT yet implemented or tested. Build a provider-neutral adapter + mock webhook/DTMF simulator in the next agent phase; do not mistake browser E2E for phone E2E.
3. Real UK phone network routing, DTMF carrier compatibility, provider signing and latency remain production-only acceptance gates.
4. Docker and SIP/Asterisk are intentionally not started/installed; unnecessary for first local-only phase.
5. Vite build can regenerate packages/web/src/route.gen.ts; check git status and avoid accidental commits of generated differences.
6. Never commit .env, config/, node_modules or E2E test data.

## Next workstream

1. Read AGENTS.md, GEMINI.md, docs/extensions/PRODUCT_SPEC.md, ARCHITECTURE.md, CONTRACTS.md, INTEGRATION_POINTS.md, UPSTREAM_TOUCHES.md, WORKING_RULES.md, DELIVERY_PLAN.md, AGENT_ASSIGNMENTS.md and ACCEPTANCE_MATRIX.md.
2. Treat this report as baseline evidence, not a product feature acceptance report.
3. Preserve upstream default behavior when all extensions disabled.
4. Implement only the first approved integration seam, with independent QA and repeated green baseline.
5. Implement phone adapter and local DTMF/mock-webhook simulator, test replay, idempotency, stale answers, disconnects, parallel players, latency and parity with browser gameplay.
6. Do not purchase a server or phone service, expose public ports, or deploy production without explicit approval.
