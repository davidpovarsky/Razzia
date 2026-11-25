# Tomer Backend & Gameplay Handoff (V3)

## Overview

- **Agent:** Tomer (Backend / Core / Integration)
- **Phase:** Wave 1 — Step 2: Backend Storage, Composite REST API, Pure Gameplay & Upstream Server Hooks
- **Branch:** `agent/tomer/wave1`
- **Commit SHA:** `aee0d8f`
- **Workspace:** `C:/Users/DAVID/Code/Razzia-worktrees/tomer`

---

## 1. Upstream Seam Log (Pre-Modification Record)

Per repository instructions (`AGENTS.md` and `docs/extensions/orchestration/01_WORKTREE_PROTOCOL.md`), all touched upstream symbols, rationale, and default-off verification tests are recorded below before editing:

| File                                                 | Touched Symbol                                     | Rationale                                                                                                                                                       | Default-Off / Regression Test                                                                                |
| :--------------------------------------------------- | :------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| `packages/common/src/constants.ts`                   | `EVENTS.EXTENSIONS`                                | Add constants for `STATE: "extensions:state"` and `COMMAND: "extensions:command"`.                                                                              | Existing constants untouched; baseline vitest (217 tests).                                                   |
| `packages/common/src/validators/socket.ts`           | `clientEventValidators[EVENTS.EXTENSIONS.COMMAND]` | Strict Zod validation for extension manager command payloads to prevent injection.                                                                              | Other event validators unchanged; baseline vitest.                                                           |
| `packages/socket/src/api/index.ts`                   | `routes`                                           | Mount composite REST API at `/extensions` via `createExtensionRoutes` with `requireManager`.                                                                    | Vanilla endpoints (`/api/quizz`, `/api/games`, etc.) unchanged; 23 API baseline tests pass.                  |
| `packages/socket/src/handlers/game.ts`               | `gameSocketHandlers`                               | Route `extensions:command` events through `withManagerGame` for manager auth.                                                                                   | Existing events (`manager:advance`, `player:selectedAnswer`, etc.) unchanged; 24 handler tests pass.         |
| `packages/socket/src/services/game/index.ts`         | `Game`                                             | Initialize `extensionSession: ExtensionGameSession \| null` if sidecar exists; emit `extensions:state` snapshot on state change and reconnect; handle commands. | If no sidecar exists (`extensionSession === null`), 100% vanilla upstream behavior runs; 32 game tests pass. |
| `packages/socket/src/services/game/round-manager.ts` | `RoundManager` & `RoundManagerOptions`             | Accept optional `shouldShowLeaderboard` callback for sidecar-driven leaderboard policies.                                                                       | If callback is omitted/undefined, runs vanilla `this.isLastQuestion() \|\| this.isSameCategoryNext()`.       |

---

## 2. Server-side Storage Implementation (`extensions/src/server/storage/**`)

1. **Sidecar Path Resolution & Storage (`sidecar.ts`):**
   - Resolves sidecar path to `config/extensions/quizzes/<id>.json`.
   - Never exposes raw filesystem paths in errors or responses.
   - Enforces strict Zod validation on read (`quizExtrasV1Schema.parse`).
   - Default-off: missing sidecar returns `null` and does NOT auto-create files on read.

2. **Journaled Two-File Atomic-Equivalent Save & Recovery (`journal.ts`):**
   - Stages write into `.journal-<id>-<timestamp>.json` with `{ stage: "staged", baseQuiz, extras }`.
   - Atomically updates base quiz and sidecar.
   - On crash / startup, `recoverJournals` inspects any pending journals and rolls forward or rolls back safely.

3. **Composite Storage Service (`service.ts`):**
   - `getCompositeQuiz(id)`: Returns `{ quizId, exists, extras, baseDigest }`.
   - `saveCompositeQuiz(params)`: Enforces revision check (`expectedRevision === currentRevision`). Mismatch throws `RevisionConflictError` (HTTP 409).
   - `createCompositeQuiz(params)`: Calls original `saveQuizz`, assigns stable question UUIDs, calculates deterministic SHA-256 base digest, and writes initial sidecar at `revision: 1`.
   - `deleteCompositeQuiz(id)`: Calls original `deleteQuizz` and removes sidecar if present.
   - `exportEnhancedBundle(id)`: Exports `{ bundleVersion: 1, quizz, extras }`.
   - `importEnhancedBundle(raw)`: Validates bundle, remaps quiz ID and question UUIDs to prevent collisions, computes canonical digest, and writes base quiz + sidecar.

---

## 3. Composite REST API (`extensions/src/server/api/**`)

Implemented Hono routes in `routes.ts`:

- `GET /api/extensions/quizzes/:id`: Returns 200 with composite payload or 404.
- `PUT /api/extensions/quizzes/:id`: Validates body with Zod; returns 200 `{ quizId, revision, baseDigest }`; returns 409 on revision conflict; 401 on unauthenticated.
- `POST /api/extensions/quizzes`: Returns 201 `{ quizId, revision: 1, baseDigest }`.
- `DELETE /api/extensions/quizzes/:id`: Returns 204 No Content.
- `GET /api/extensions/export/:id`: Returns 200 with `{ bundleVersion: 1, quizz, extras }`.
- `POST /api/extensions/import`: Returns 201 with `{ quizId, revision: 1, baseDigest }`.

---

## 4. Pure Gameplay Rules (`extensions/src/gameplay/**`)

1. **Leaderboard Engine (`leaderboard.ts`):**
   - `upstream`: Follows Razzia upstream logic (skips if next question has the same non-empty category).
   - `everyN`: Shows after questions where `(index + 1) % everyN === 0`.
   - `selected`: Shows only after question IDs listed in `afterQuestionIds`.
   - `categoryEnd`: Shows when `currentCategory !== nextCategory`.
   - `manual`: Shows only when manager requested manual display via `consumeManualLeaderboardRequest()`.
   - Invariant: Never shows after the final question (`currentQuestionIndex === totalQuestions - 1`).
   - Invariant: Survey mode never shows a scored leaderboard.

2. **Team Engine (`teams.ts`):**
   - `assignRoundRobin(teams, playerClientIds)`: Deterministic round-robin distribution by join order.
   - `assignManual({ teams, currentAssignments, clientId, teamId })`: Reassigns a player to an existing team.
   - `projectTeamScores(teams, players, assignments)`:
     - Pure function; zero mutations of underlying player scores.
     - Disconnected players retain their earned score.
     - Kicked players are excluded from score projection.
     - Sorted descending by score. Deterministic tie-breaking: case-insensitive team name, then team ID ascending.

---

## 5. Authoritative Game Session (`extensions/src/server/game/session.ts`)

- Manages `seq` (monotonic per game) and `epoch` (increments on new question).
- Tracks `phase`: `'lobby' | 'prepared' | 'question' | 'answers' | 'responses' | 'leaderboard' | 'interlude' | 'finished'`.
- Safe audience filtering via `getStateSnapshot(forRole, players)`:
  - Answers and reveal effects with `audience: "manager"` are hidden from players during question phase.
- Manager command validation & deduplication via `handleCommand`:
  - Rejects duplicate `requestId`.
  - Rejects non-manager commands.
  - Enforces valid phases (e.g., `ASSIGN_TEAM` only allowed in `lobby`).

---

## 6. Test Evidence (52 Extension Tests, 217 Baseline Tests)

All unit tests in `@razzia/extensions` pass:

- `src/core/core.test.ts` (25 tests)
- `src/core/imports.test.ts` (3 tests)
- `src/gameplay/gameplay.test.ts` (7 tests: `GAME01-04`, `TEAM01-03`)
- `src/server/storage.test.ts` (7 tests: `CORE01-06`, `MEDIA02`)
- `src/server/session.test.ts` (5 tests: `INT01-02`, `MEDIA03`, `SEC01`)
- `src/server/api/routes.test.ts` (5 tests: REST API, 409 conflict, auth rejection)
- Total `@razzia/extensions` tests: **52 passed**.
- Total baseline tests (`pnpm test`): **217 passed**.
- Oxlint check: **0 warnings, 0 errors**.
- Prettier check: **0 errors**.
