# Tomer Bootstrap Handoff (V3)

## Overview

- **Agent:** Tomer (Backend / Core / Integration)
- **Phase:** Wave 1 — Step 1: Workspace Package Bootstrap and Shared V1 Contracts
- **Branch:** `agent/tomer/wave1`
- **Workspace:** `C:/Users/DAVID/Code/Razzia-worktrees/tomer`

---

## 1. Package Architecture & Subpath Exports

Created the additive `@razzia/extensions` workspace package under `extensions/` with strict subpath exports:

- `@razzia/extensions` -> `./src/index.ts`
- `@razzia/extensions/core` -> `./src/core/index.ts`
- `@razzia/extensions/gameplay` -> `./src/gameplay/index.ts` (bootstrap placeholder)
- `@razzia/extensions/server` -> `./src/server/index.ts` (bootstrap placeholder)
- `@razzia/extensions/editor` -> `./src/editor/index.ts` (Maya placeholder)
- `@razzia/extensions/media` -> `./src/media/index.ts` (Maya placeholder)
- `@razzia/extensions/presentation` -> `./src/presentation/index.ts` (Maya placeholder)
- `@razzia/extensions/locales` -> `./src/locales/index.ts` (Maya placeholder)
- `@razzia/extensions/telephony` -> `./src/telephony/index.ts` (Noam placeholder)
- `@razzia/extensions/testkit` -> `./src/testkit/index.ts` (Roni placeholder)

Workspace dependencies wired to:

- `packages/web/package.json` (`@razzia/extensions: workspace:*`)
- `packages/socket/package.json` (`@razzia/extensions: workspace:*`)
- `pnpm-workspace.yaml` (added `"extensions"`)
- `pnpm-lock.yaml` (regenerated and frozen)
- Root `tsconfig.json` & `vitest.config.ts` aliases configured for seamless development.

---

## 2. Core V1 Contracts (`extensions/src/core/**`)

Fully implemented shared schemas and utilities according to `12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md`:

1. **`QuizExtrasV1` & Sidecar Schemas (`quiz-extras.ts`, `constants.ts`):**
   - Strict Zod schemas enforcing `schemaVersion: 1`, `revision: number` (>= 1), `quizId: string`, `baseDigest: string` (64-char hex), and unique `questionIds: UUID[]`.
   - `leaderboardExtrasSchema`: modes `upstream` | `everyN` | `selected` | `categoryEnd` | `manual`. Requires `everyN` when in `everyN` mode. Validates `afterQuestionIds` against `questionIds`.
   - `teamsExtrasSchema`: `enabled: boolean`, `autoAssign: 'roundRobin'`, unique team IDs, team count 2..12 when enabled.
   - `audioExtrasSchema`: 9 cues (`start`, `showQuestion`, `answersMusic`, `answerPressed`, `revealResults`, `leaderboard`, `podium1`, `podium2`, `podium3`) with volume bounds, loop, and safe media URL checks.
   - `perQuestionExtrasSchema`: keyed strictly by question UUIDs. SuperRefine asserts all keys exist in `questionIds` (preventing orphan records).
   - Default factory `createDefaultQuizExtras(quizId, questionIds, baseDigest)` creates valid schema defaults.

2. **Safe Media Reference & Alt Validation (`media.ts`):**
   - `isSafeMediaUrl` / `safeMediaUrlSchema`: enforces root-relative `/media/...` (with no directory traversal `..`) or valid `https://` URL. Strictly rejects `javascript:`, `data:`, `file:`, `vbscript:`, or insecure protocols.
   - `answerVisualSchema`: requires non-empty `alt` text and a valid media URL when `display` is `image` or `both`. Preserves text answers when visual is disabled.
   - `questionRevealSchema`: effect (`none` | `blur` | `pixelate` | `tiles` | `zoom`), durationMs (250..15000), trigger (`automatic` | `manual`), audience (`manager` | `all`).
   - `interludeSchema`: kind (`title` | `image` | `video` | `countdown`), durationMs (1000..30000), advance (`auto` | `manual`), optional audio cue and safe URL.

3. **Deterministic Canonical Base Digest (`digest.ts`):**
   - `canonicalJsonStringify`: recursively sorts object keys in lexicographical order, ignoring undefined/function values to guarantee deterministic serialization.
   - Pure-TypeScript standard SHA-256 (`sha256Hex`): 100% portable FIPS 180-4 implementation running synchronously in Node and browser without filesystem or native dependencies.
   - `computeCanonicalBaseDigest` & `verifyBaseDigest`: matches `node:crypto` byte-for-byte.

4. **Stable Question UUID Lifecycle (`questions.ts`):**
   - Stable UUID generation via RFC 9562/UUIDv7.
   - `reorderQuestionIds(questionIds, fromIndex, toIndex)`: reorders question UUID array; attachments in `perQuestion` remain pinned to the UUID.
   - `duplicateQuestion(questionIds, perQuestion, targetIndex)`: generates a fresh UUID, deep-clones attachments, inserts after target index without collision.
   - `removeQuestion(questionIds, perQuestion, targetIndex)`: removes target question UUID and cleans up its `perQuestion` record (zero orphans).
   - `remapQuestionIds(sourceQuestionIds, perQuestion)`: remaps all question UUIDs to fresh IDs for safe bundle imports.

5. **Revision Checks (`revisions.ts`):**
   - `validateRevision` & `assertRevisionMatch`: checks expected against stored revision, throwing typed `RevisionConflictError` on 409 mismatch. Allows `null` expectedRevision for unversioned/initial writes.
   - `nextRevision`: monotonic integer increment.

6. **Wire State Envelopes & Manager Commands (`state.ts`, `commands.ts`):**
   - `extensionStateEnvelopeSchema`: wire envelope `{ v: 1, gameId, seq, epoch, questionId?, phase, startedAt, extras }` for `extensions:state`.
   - `extensionCommandSchema`: discriminated union for `extensions:command`:
     - `SHOW_LEADERBOARD`
     - `SKIP_INTERLUDE`
     - `REVEAL_MEDIA`
     - `ASSIGN_TEAM`
   - Strict validation preventing unknown command injection.

7. **Enhanced Bundle Import/Export (`bundle.ts`):**
   - `enhancedBundleSchema`: `{ bundleVersion: 1, quizz, extras }`.
   - `createEnhancedBundle` & `isEnhancedBundle`.

---

## 3. Test Evidence & Validation

All tests, builds, linting, formatting and dependency verification executed with Node 24 (`v24.22.1`) and pnpm `11.24.0`:

### A. Extension Tests

```
$ pnpm --filter @razzia/extensions test
 RUN  v5.0.3 C:/Users/DAVID/Code/Razzia-worktrees/tomer/extensions

 ✓ src/core/core.test.ts (25 tests) 29ms
 ✓ src/core/imports.test.ts (3 tests) 4ms

 Test Files  2 passed (2)
      Tests  28 passed (28)
   Duration  663ms
Exit code: 0
```

### B. Root Vitest Suite (Baseline Compatibility)

```
$ pnpm test
 RUN  v5.0.3 C:/Users/DAVID/Code/Razzia-worktrees/tomer

 Test Files  17 passed (17)
      Tests  217 passed (217)
   Duration  2.52s
Exit code: 0
```

### C. Workspace Build

```
$ pnpm build
Scope: 5 of 6 workspace projects
packages/socket build: Done (rolldown)
packages/web build: Done (vite build, 2919 modules transformed)
Exit code: 0
```

### D. Linting (Oxlint)

```
$ pnpm lint
$ oxlint
Found 0 warnings and 0 errors.
Finished in 3.6s on 252 files with 233 rules using 12 threads.
Exit code: 0
```

### E. Code Formatting (Prettier)

```
$ pnpm format
$ prettier --check . --log-level warn
Exit code: 0
```

### F. Frozen Lockfile Verification

```
$ pnpm install --frozen-lockfile
Scope: all 6 workspace projects
Already up to date
Done in 465ms using pnpm v11.24.0
Exit code: 0
```

---

## 4. Modified & Added Files

### Shared / Package Files

- `pnpm-workspace.yaml`
- `packages/web/package.json`
- `packages/socket/package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `vitest.config.ts`

### Extensions Package (`extensions/`)

- `extensions/.gitignore`
- `extensions/package.json`
- `extensions/tsconfig.json`
- `extensions/vitest.config.ts`
- `extensions/src/index.ts`
- `extensions/src/core/index.ts`
- `extensions/src/core/constants.ts`
- `extensions/src/core/media.ts`
- `extensions/src/core/digest.ts`
- `extensions/src/core/questions.ts`
- `extensions/src/core/quiz-extras.ts`
- `extensions/src/core/revisions.ts`
- `extensions/src/core/state.ts`
- `extensions/src/core/commands.ts`
- `extensions/src/core/bundle.ts`
- `extensions/src/core/core.test.ts`
- `extensions/src/core/imports.test.ts`
- `extensions/src/editor/index.ts`
- `extensions/src/gameplay/index.ts`
- `extensions/src/locales/index.ts`
- `extensions/src/media/index.ts`
- `extensions/src/presentation/index.ts`
- `extensions/src/server/index.ts`
- `extensions/src/telephony/index.ts`
- `extensions/src/testkit/index.ts`

### Documentation / Handoff

- `docs/extensions/orchestration/handoffs/tomer/BOOTSTRAP.md`
