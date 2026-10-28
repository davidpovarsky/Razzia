# TADA Studio — Show Import/Export Recovery Acceptance Report

**Author:** Tomer (Integration & Backend Engineer)  
**Date:** 2026-10-28  
**Worktree:** `C:\Users\DAVID\Code\Razzia-worktrees\tomer`  
**Branch:** `agent/tomer/wave2`  
**Baseline Commit:** `762dd73ed1bf526837c93b0711a19ea396d88d1b`  
**Execution Mode:** Single Agent (NORMAL mode, no subagents)  
**Target Asana Task:** `1219978038914440` (TADA Studio | Show Import/Export Recovery and Lossless Acceptance)  

---

## 1. Executive Summary

This deliverable fulfills the complete recovery and hardening requirements for Tada Studio Show Import and Export across both JSON (`.tada.json`, `.bundle.json`, `.json`) and multi-sheet Excel (`.xlsx`) authoring formats.

All reported defects have been systematically reproduced, verified with unit/integration tests, hardened against security vulnerabilities, and validated with Playwright end-to-end browser tests:
1. **Unsafe Media URLs:** Completely blocked across all cards, answers, scenes, audio cues, legacy quizzes, and server bundle endpoints with hardened regex and validation functions.
2. **Lossless Settings & Audio Volume:** Audio cues (including non-default `volume: 0.37`) and teams configuration (even when `enabled: false`) are preserved losslessly.
3. **Reference Integrity:** Bidirectional remapping maps human card keys (`Q01`, `Q02`) to freshly minted question UUIDs on import and restores card keys on export, eliminating orphaned leaderboard UUIDs.
4. **Blank Template vs Playable Sample:** `TADA_Show_Template_v1.xlsx` (11,371 bytes) and `SAMPLE.xlsx` (26,404 bytes) are physically distinct with differing SHA-256 hashes. Test file-writing side effects have been eliminated. Formula injection across all sheets is detected with exact cell coordinates (`Sheet!ColRow`).
5. **Privacy by Default:** Shareable export mode strips phone roster participant PII (`participants: []`) while retaining invite-only configuration.
6. **Manager UI & Upstream Hooks:** Export as Friendly Tada JSON (`export-tada-json-${q.id}`) has been added alongside Excel, Enhanced, and Legacy export buttons, using original Razzia design tokens, Rubik typography, and 100% synchronized translations across all 8 languages.

---

## 2. Gate Verification Matrix

| Gate | Requirement | Verification Method | Status |
|---|---|---|---|
| **S01** | Safe Media URLs: Only `https:` and `/media/`; strictly reject `javascript:`, `data:`, `file:`, `ftp:`, `http:`, `//`, `\`, `%2e`, whitespace. | `media.test.ts` (9 tests), `show-authoring.test.ts`, `show-import-preflight.test.ts`, `storage.test.ts` | **PASS** |
| **D01** | Lossless Settings: Strict discriminated union for `leaderboard`, `team`, `audio`, `roster`. Non-default audio volume (`0.37`) and disabled teams (`enabled: false`) preserved. Reject unknown scopes/properties & non-empty `extraJson`. | `show-authoring.test.ts` (13 tests) | **PASS** |
| **D02** | Privacy by Default: Export defaults to shareable mode (`roster.participants: []`), omitting PII. Private opt-in preserves roster. | `show-authoring.test.ts`, `wave1-show-import-acceptance.spec.ts` | **PASS** |
| **R01** | Bidirectional Reference Remapping: `leaderboard.afterQuestionIds` remaps human card keys (`Q01`, `Q02`) to native question UUIDs on import and back to card keys on export. Orphan UUIDs rejected. | `show-authoring.test.ts`, `storage.test.ts`, `studio-timeline-schema.ts` | **PASS** |
| **X01** | Blank Template & Security: Distinct `TADA_Show_Template_v1.xlsx` (0 cards) vs `SAMPLE.xlsx` (10 cards). Zero test side-effects. Formula injection rejection with exact coordinate (`Sheet!ColRow`). | `show-workbook.test.ts` (11 tests), `wave1-show-import-acceptance.spec.ts` | **PASS** |
| **L01** | Legacy Format Compatibility: Normalize legacy quizzes missing `gameMode`, validate legacy question media, synthesize V2 extras in-memory on export without sidecar disk mutation. | `show-import-preflight.test.ts`, `storage.test.ts` | **PASS** |
| **U01** | Manager UI & Upstream Hooks: "Export as Tada JSON" button (`export-tada-json-${q.id}`) with `FileCode` icon; blank template download button; zero mutations on cancel; 8-language localization parity. | `locales.test.ts` (9 tests), `wave1-show-import-acceptance.spec.ts` (4 tests) | **PASS** |

---

## 3. Physical Artifacts & SHA-256 Hashes

| File | Size (Bytes) | SHA-256 Checksum | Description |
|---|---|---|---|
| `docs/extensions/show-import/TADA_Show_Template_v1.xlsx` | 11,371 | `9f4f5b6484351a2fe05202d8ff13944e0624f231e023785088f9b14b1adfb4ae` | Blank multi-sheet authoring template with 6 sheets, headers, notes, and 0 questions/cards |
| `docs/extensions/show-import/SAMPLE.xlsx` | 26,404 | `e064880b111db5e2d0d573f6200abb0d0461ece22360f9560e635eb2e68283cc` | Playable 10-card demonstration workbook matching `SAMPLE.tada.json` |
| `docs/extensions/show-import/SAMPLE.tada.json` | 4,032 | `5d6b8b7e28328ca1e8a09cf3a5eece2a0d17eeae4b98625902dcab2412803b9b` | Canonical friendly authored show sample JSON with all 10 card kinds |

---

## 4. Test Evidence & Commands Executed

### 4.1 Extensions Package Verification
```powershell
pnpm --filter @razzia/extensions test
```
**Result:** 23 test files passed, 225 tests passed (100% green).
- `src/core/show-authoring.test.ts` (13 tests)
- `src/core/show-workbook.test.ts` (11 tests)
- `src/core/show-import-preflight.test.ts` (6 tests)
- `src/server/storage.test.ts` (14 tests)
- `src/media/media.test.ts` (9 tests)
- `src/locales/locales.test.ts` (9 tests)
- `src/telephony/telephony.test.ts` (27 tests)
- `src/server/real-telephony-e2e.test.ts` (4 tests)

### 4.2 Monorepo Root Verification
```powershell
pnpm test
```
**Result:** 20 test files passed, 287 tests passed across `packages/common`, `packages/socket`, and `packages/web` (100% green).

### 4.3 Static Typecheck
```powershell
pnpm -r exec tsc --noEmit
```
**Result:** Clean exit (code 0), 0 type errors across all packages and workspaces.

### 4.4 Web & Socket Production Builds
```powershell
$env:NODE_OPTIONS="--experimental-strip-types"; pnpm --filter @razzia/web build
pnpm --filter @razzia/socket build
```
**Result:** Both packages built cleanly with Rolldown / Vite.

### 4.5 Playwright Acceptance E2E (Wave 1)
```powershell
$env:NODE_OPTIONS="--experimental-strip-types"; pnpm --filter @razzia/e2e test --config playwright.wave1-acceptance.config.ts wave1-show-import-acceptance.spec.ts
```
**Result:** 4 passed (21.8s)
- `IMPORT01`: Manager import area renders original design tokens, template download, and export affordances at 1024 & 1280 viewports (1.6s)
- `IMPORT02`: Import friendly .tada.json with preflight preview, warnings, and editor opening with ordered cards & media (3.7s)
- `IMPORT03`: Import multi-sheet Excel (.xlsx), export as Tada Excel (.xlsx), and verify zero writes on cancel (4.3s)
- `IMPORT04`: Export as Friendly Tada JSON (.tada.json) and verify unsafe URL error blocking (2.6s)

---

## 5. Visual Proof & Screenshots

All screenshots generated by the automated test suite in `packages/e2e/test-results/show-import-acceptance/`:

1. `01_manager_manage_quizz_1280.png`: Manager quiz tab at 1280px viewport displaying Create, Import, Download Template, and per-row Export affordances (`export-enhanced`, `export-xlsx`, `export-tada-json`, `export-legacy`).
2. `02_manager_manage_quizz_1024.png`: Manager quiz tab at 1024px viewport confirming responsive alignment without overflowing buttons or clipped text.
3. `03_preflight_dialog_1280.png`: Preflight modal at 1280px displaying format badge (`Tada Show JSON (.tada.json)`), card counts, timeline table, and remote media warning.
4. `04_preflight_dialog_1024.png`: Preflight modal at 1024px confirming clean scrollable dialog layout.
5. `05_imported_show_editor_1280.png`: Studio question editor opened immediately after importing `SAMPLE.tada.json`, with preserved question selector header rows.
6. `06_imported_xlsx_editor_1280.png`: Studio question editor opened after importing `SAMPLE.xlsx`, confirming multi-sheet workbook import parity.
7. `07_unsafe_media_rejection_dialog.png`: Preflight modal displaying the error alert banner blocking dangerous media URLs (`javascript:alert(...)`), with the "Import Show" commit button fully disabled.

---

## 6. Asana Task & Handoff Declaration

- **Task ID:** `1219978038914440` (TADA Studio | Show Import/Export Recovery and Lossless Acceptance)
- **Status:** **INCOMPLETE** (left open per policy for independent QA verification by Roni / external review)
- **Role Tag:** `[תומר | INT] [MAIN_SESSION]`
- **Push / Merge / Deploy:** None. Working branch remains `agent/tomer/wave2`. All changes committed to a single local commit.
