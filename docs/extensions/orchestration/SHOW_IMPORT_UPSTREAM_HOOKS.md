# Upstream Hooks Audit: TADA Studio Show Import/Export (JSON & Excel)

**Author:** Tomer (Integration & Backend Engineer)  
**Date:** 2026-10-28  
**Worktree:** `c:\Users\DAVID\Code\Razzia-worktrees\tomer`  
**Branch:** `agent/tomer/wave2`  
**Execution Mode:** Single Agent (NORMAL mode)

---

## 1. Scope and Policy Adherence

Per project governance rules (`GEMINI.md`, `AGENTS.md`, and `docs/extensions/orchestration/13_FILE_OWNERSHIP.md`):
- All core authoring schemas, converters, Excel workbook generators/parsers, preflight validators, and storage integrations reside strictly under `extensions/**`.
- Minimal necessary upstream hooks in `packages/web/src/**` are authorized to expose user affordances in the Manager interface without modifying Razzia design language or altering existing card type selector positions.
- Telephony simulator ports (3000/3001/38991) and upstream server endpoints (`/api/quizz`, `/api/games`, etc.) remain completely untouched and backward-compatible.

---

## 2. Upstream Files Touched

### 2.1 `packages/web/src/features/manager/components/configurations/ConfigManageQuizz.tsx`

| Metric / Aspect | Details |
|---|---|
| **Symbols Touched** | `ConfigManageQuizz`, `handleImportFileSelect`, `handleCommitImport`, `handleExportXlsx`, `handleExportTadaJson`, `handleDownloadTemplate`, `downloadBlob`, `downloadBuffer` |
| **Rationale** | Connects the Manager Quizz management tab to the blank multi-sheet Excel generator/template (`generateTadaShowWorkbookBlankTemplate`), authoring preflight validator modal, `.xlsx` row export action, and Friendly Tada JSON (`.tada.json`) export action with shareable privacy mode (`includePrivateRoster: false`). |
| **Default-Off & Non-Breaking** | When no import is initiated, vanilla quiz management remains 100% identical. Legacy JSON export (`handleExportLegacy`) and legacy import (`importQuizz`) remain fully operational. |
| **Design Language Fidelity** | Reuses original Razzia `Button`, `AlertDialog`, `SkeletonRows`, Lucide icons (`FileCode`, `FileDown`, `FileSpreadsheet`, `Upload`), and Rubik font tokens. Does NOT alter any question editor toggle group or navigation structure. |

### 2.2 `packages/web/src/features/manager/components/configurations/ShowImportModal.tsx` (New Component)

| Metric / Aspect | Details |
|---|---|
| **Symbols Touched** | `ShowImportModal`, `Props` |
| **Rationale** | Provides the modal dialog displaying show metadata, card count breakdown, ordered timeline table, and non-blocking warnings / blocking validation errors prior to persisting changes to disk. |
| **Default-Off & Non-Breaking** | Modal only renders when opened by a user file upload event. If user clicks "Cancel", zero mutations occur on server or local storage. |
| **Design Language Fidelity** | Built with Radix `AlertDialog` and Razzia `Button` primitives, matching theme colors (`bg-card`, `border-border`, `text-foreground`, `bg-accent`), rounded radii, and Rubik typography. Fully responsive at 1024px and 1280px viewports. |

### 2.3 `packages/web/src/features/quizz/components/studio/studio-editor-context.tsx`

| Metric / Aspect | Details |
|---|---|
| **Symbols Touched** | `syncToExtras` |
| **Rationale** | Preserves show-level authoring metadata (`authoring?: { showNote?: string }`) across in-memory Studio state transitions, card additions/deletions/reorders, and editor saves. Prevents show-level notes from being dropped when saving edits in Studio. |
| **Default-Off & Non-Breaking** | If `(prev as QuizExtrasV2).authoring` is undefined (e.g. legacy quizzes), `authoring` remains undefined. Base `quizz.subject` remains unaltered. |
| **Design Language Fidelity** | Pure non-visual context state synchronization hook. |

### 2.4 `packages/e2e/tests/wave1-show-import-acceptance.spec.ts` (E2E Test Suite)

| Metric / Aspect | Details |
|---|---|
| **Symbols Touched** | Acceptance test suite `TADA Studio Show Import/Export Acceptance (JSON + Excel)` (tests `IMPORT01` through `IMPORT06`) |
| **Rationale** | Verifies end-to-end functionality across manager viewport rendering (1024/1280), template download, JSON and Excel preflight dialogs, zero writes on cancel, editor redirection, Hebrew note persistence across save/reload, per-question interlude roundtrip, and rejection of invalid `targetKey` / malformed `interludeJson`. |
| **Default-Off & Non-Breaking** | Isolated E2E test file run under `playwright.wave1-acceptance.config.ts`. No interference with vanilla tests. |

---

## 3. Regression Test Coverage

1. **Vanilla Quiz Management:** Vanilla tests in `packages/web/src/features/quizz` and `packages/socket/src/api/api.test.ts` pass without regressions (287/287 root tests green).
2. **Localization Parity:** Added 31 matching keys across all 8 supported languages (`en`, `de`, `es`, `fr`, `it`, `ja`, `tr`, `vi`) verified by `extensions/src/locales/locales.test.ts`.
3. **Storage Sidecar Orphan Integrity:** Fixed `importEnhancedBundle` to safely remap `afterQuestionIds` within `leaderboard.mode: "selected"`.
