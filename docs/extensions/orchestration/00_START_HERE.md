# Razzia Antigravity execution — ACTIVE V3

> **P0 OVERRIDE — 26 Oct 2026:** This file's three-agent start order is historical for the current one-agent Tomer P0. The user's exact `TADA_ONE_AGENT_TOMER_COMPLETE_P0_2026-10-26.md` takes precedence. REQUIRED: read `P0_ONE_AGENT_UI_FIDELITY_2026-10-26.md` and `../DESIGN_LANGUAGE.md` before writing any frontend code. Build new features only in original Razzia UI components/typography. Tomer handles all P0 code in his existing worktree without requesting Maya/Noam. Old offline-only restrictions are superseded solely for the specifically authorized private live pilot; unrelated safety prohibitions remain.

**ACTIVE: three coding conversations.** The prior seven-agent V1/V2 task allocation is retired. The user wants research and design done in these documents, with agents doing **implementation, execution, debugging and tests**, not open-ended investigation or subagent orchestration.

## Start order

1. **First, and alone: Tomer.** Open `C:\Users\DAVID\Code\Razzia-worktrees\tomer` in Antigravity (existing folder, Local Mode), then paste the entire `PROMPT_TOMER_01_BOOTSTRAP.md`. He must implement the shared workspace, stable V1 public contracts and passing basic tests; then commit the bootstrap and stop at that gate.
2. **Then synchronize.** With Maya and Noam worktrees still clean and no agent running in them, run `scripts/orchestration/Sync-AgentBranches.ps1` from Windows PowerShell. The script fast-forwards **only** Maya and Noam to Tomer's bootstrap commit. Do not create new worktrees or copy files manually.
3. **Then start three conversations concurrently.** Continue in Tomer's **same existing conversation** by sending `PROMPT_TOMER_02_BACKEND_AND_INTEGRATION.md`. Open the existing `maya` worktree as a second Antigravity workspace/chat and send `PROMPT_MAYA_01_UI.md`. Open the existing `noam` worktree as a third and send `PROMPT_NOAM_01_TELEPHONY.md`.
4. **Integration.** When Maya and Noam have committed tested deliverables, Tomer reviews and cherry-picks exact hashes onto his integration branch, fixes integration-only code, and runs the full test matrix. No other agent merges or cherry-picks.
5. **QA (optional; only after integration).** If independent QA is desired, prepare the dormant `roni` worktree with `scripts/orchestration/Prepare-QA.ps1` AFTER integration checks, then open one temporary fourth chat with `PROMPT_RONI_OPTIONAL_QA.md`. Roni never runs in parallel with live integration tests.

## Exclusive file ownership

- **Tomer:** `packages/socket/**`, `packages/common/**`, `extensions/src/core/**`, `extensions/src/server/**`, `extensions/src/gameplay/**`, `extensions/src/integration/**`, shared package/lock/config, API, game engine and integration.
- **Maya:** `packages/web/**` except package dependency manifest reserved for Tomer's bootstrap, `extensions/src/editor/**`, `extensions/src/media/**`, `extensions/src/presentation/**`, `extensions/src/locales/**`.
- **Noam:** `extensions/src/telephony/**` exclusively.
- **Roni (dormant):** `extensions/src/testkit/**`, `extensions/qa/**`, and narrowly scoped QA test files after the owner activates him.

See `13_FILE_OWNERSHIP.md` for exceptions and exact gates. Two distinct Git worktrees guarantee separate working files; exclusive owners guarantee no overlapping edits when branches are integrated.

## Read order for each active agent

Read `AGENTS.md`, `GEMINI.md`, and these documents:
`00_START_HERE.md` -> `10_LOCKED_PRODUCT_DECISIONS.md` -> `11_RESEARCH_VERIFIED.md` -> `12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md` -> `13_FILE_OWNERSHIP.md` -> `14_ENGINEERING_ACCEPTANCE_CASES.md` -> `01_WORKTREE_PROTOCOL.md` -> your exact prompt.

Older documents `02_OWNERSHIP_MATRIX.md`, `03_EXECUTION_WAVES.md`, `04_HANDOFF_AND_QA.md` and `05_ANTIGRAVITY_SETUP.md` have been revised for V3. Older documents under `docs/extensions/` are reference material, not superseding instructions. Do not use the retired V2 agent prompts in `archive/v2/`.

## Invariants

- UK-first local development on Windows; no paid server, telephone number or provider account. Phone DTMF is simulated; real Yemot/UK carrier behaviour remains unverified.
- Preserve Razzia 4.0.1 default behaviour with extensions off, support eight existing languages (en/fr/de/es/it/ja/tr/vi), and reuse upstream UI tokens.
- Scope-limited, documented hooks in the owned upstream paths are approved for implementing THIS specified plan. No unrelated upstream refactors; log actual touch + tests in a role-owned handoff. Unexpected shared paths or security changes stop for owner review.
- No public tunnel, purchase, Asana change, push, deploy or merge to main without explicit request. Local role-branch commits and Tomer's reviewed cherry-picks onto his own integration branch are authorized.
- Baseline previously recorded: 217 Vitest and 46 Playwright E2E tests (plus build/lint/format); new implementation must rerun relevant tests and report actual counts.
