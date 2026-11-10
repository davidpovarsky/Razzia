# Google Antigravity instructions — Razzia V3

## Tadazz design-system scope — 10 November 2026

For this initiative the current scoped section in [AGENTS.md](AGENTS.md),
[canonical specification](docs/extensions/plans/TADAZZ_DESIGN_SYSTEM_UI_UNIFICATION_AGENT_PROMPT_2026-11-10.md),
[policy](docs/extensions/plans/TDS_POLICY.md) and
[progress](docs/extensions/plans/TDS_PROGRESS.md) control over historical P0/V3
visual, worktree and role instructions below. One primary sequential agent,
isolated branch, Tadazz platform UI for site/Studio/host; existing content editor
and its appearance/behavior remain frozen. Show themes stay independent.
All upstream source is protected: no new `packages/**` edits without separate
explicit approval of the exact seam. Old hook grants do not transfer here.
No source rewrite/alias/DOM workaround may circumvent that boundary. Update the
existing Asana phase task descriptions with tested evidence and exact commits.
No push, merge, deploy, production writes, provider changes or data migrations.
Run `node extensions/qa/tds-boundary.mjs` every phase; do not claim editor parity
from source hashes alone after runtime styling changes.

> **CURRENT PRIORITY: TOMER ONE-AGENT P0 (26 Oct 2026).** Use the user's supplied `TADA_ONE_AGENT_TOMER_COMPLETE_P0_2026-10-26.md` as controlling execution prompt. **MANDATORY FIRST READ:** `docs/extensions/orchestration/P0_ONE_AGENT_UI_FIDELITY_2026-10-26.md`, `docs/extensions/DESIGN_LANGUAGE.md`, original `packages/web/src/index.css`, `main.tsx`, `branding.ts` and existing UI component implementations. ALL added host/player/editor/roster/import UI MUST reuse the existing Razzia design system, Rubik typography, theme tokens and component primitives. Ignore contradictory historical V3 three-agent handoffs/ownership for this scoped P0 only; no other worktrees/subagents. Other safety rules remain.

Canonical repository instructions: AGENTS.md and docs/extensions/orchestration/00_START_HERE.md, 01_WORKTREE_PROTOCOL.md, 10_LOCKED_PRODUCT_DECISIONS.md, 11_RESEARCH_VERIFIED.md, 12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md, 13_FILE_OWNERSHIP.md, 14_ENGINEERING_ACCEPTANCE_CASES.md. Read these and the exact V3 role prompt before coding. Old seven-agent documents and prompts are retired.

Use THREE independent persistent conversations, each in its existing LOCAL worktree: Tomer backend/core/integration; Maya frontend/media/audio; Noam telephony. Roni optional after integrated code. Do not create Antigravity subagents or extra worktrees. Agents write code and tests, not research reports.

Minimal upstream hooks are authorized for this scope ONLY in each role's exclusive paths: Tomer packages/socket/** and packages/common/**, Maya packages/web/src/**. Record exact touched symbol and default-off regression test in own handoff before editing. Preserve old Razzia behaviour. No pushes, production deployment, real telephony, credentials or shared system changes.

Start with PROMPT_TOMER_01_BOOTSTRAP.md. After his bootstrap commit and coordinator branch sync, continue SAME Tomer chat with PROMPT_TOMER_02_BACKEND_AND_INTEGRATION.md and start Maya/Noam with their V3 prompts.
