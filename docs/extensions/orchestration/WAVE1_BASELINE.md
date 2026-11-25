# Wave 1 Baseline Snapshot & Test Isolation

**Date:** 2026-10-26  
**Audited Commit:** `090ebf7b813867d69a5c568e3fdb6f722dee6a92`  
**Git Branch:** `agent/tomer/wave2`  
**Worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tomer`  
**Clean Working Tree:** Verified (`git status --short` clean, `git diff --check` clean)

---

## 1. Port Ownership & Live Pilot Processes

| Port | Protocol / State | PID | Command / Owner |
|---|---|---|---|
| **3000** | TCP Listen / Estab | 20948 | `node .../vite.js` (Razzia Web Dev Server) |
| **3001** | TCP Listen | 20968 | `node .../tsx src/index.ts` (Razzia Socket Backend) |
| **38991** | TCP Listen | 29508 | `node C:\Users\DAVID\Code\Tada-phone-pilot\tada-pilot-gateway.cjs` |

> **ISOLATION REQUIREMENT:**  
> The existing ports 3000, 3001, and 38991 belong to the active user session and live pilot.  
> Automated test suites (Playwright and integration) MUST NOT run against or terminate these processes.  
> Isolated testing must use alternate ports (e.g. `3010` for web, `3011` for socket) and ephemeral isolated configuration directories (`.config-wave1-test`).

---

## 2. Test Suites Baseline Status

- **Unit / Workspace Tests (`pnpm test`):** 20 test files, 282 tests passed (100% green).
- **Extension Tests (`pnpm --filter @razzia/extensions test`):** 17 test files, 173 tests passed (100% green).
- **Audio Logic Unit Tests (`node C:\Users\DAVID\Code\Tada-phone-pilot\tada-audio-logic.test.cjs`):** 11 tests passed (100% green).
- **TypeScript Typecheck (`pnpm -r exec tsc --noEmit`):** Clean exit code 0.
- **Oxlint (`$env:NODE_OPTIONS='--experimental-strip-types'; pnpm lint`):** 0 warnings, 0 errors across 324 files.
- **Workspace Build (`$env:NODE_OPTIONS='--experimental-strip-types'; pnpm build`):** Clean exit code 0.

---

## 3. UI Baseline & Reference Artifacts

Existing baseline screenshot captures in `packages/e2e/test-results/screenshots/`:
- `gate3-editor-conflict-modal.png`: Conflict resolution dialog and editor layout
- `gate3-editor-enhancements.png`: Three-column layout with inline enhancement panel (to be decoupled)
- `gate3-p0-host-players-modal.png`: Real host players & live connection modal
- `gate3-lobby-players-teams.png`: Lobby stage and player count
- `gate3-gameplay-reveal-leaderboard.png`: Scoring reveal and leaderboard stage
- `gate3-vanilla-feature-off.png`: Default upstream visual parity

All new Wave 1 UI implementations will maintain strict pixel and component fidelity to the original Razzia design language (Rubik Variable, native `ToggleGroup`, `Button`, `Input`, `Select`, `Card`, Radix primitives).
