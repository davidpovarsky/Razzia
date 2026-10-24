# Google Antigravity instructions — Razzia V3

Canonical repository instructions: AGENTS.md and docs/extensions/orchestration/00_START_HERE.md, 01_WORKTREE_PROTOCOL.md, 10_LOCKED_PRODUCT_DECISIONS.md, 11_RESEARCH_VERIFIED.md, 12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md, 13_FILE_OWNERSHIP.md, 14_ENGINEERING_ACCEPTANCE_CASES.md. Read these and the exact V3 role prompt before coding. Old seven-agent documents and prompts are retired.

Use THREE independent persistent conversations, each in its existing LOCAL worktree: Tomer backend/core/integration; Maya frontend/media/audio; Noam telephony. Roni optional after integrated code. Do not create Antigravity subagents or extra worktrees. Agents write code and tests, not research reports.

Minimal upstream hooks are authorized for this scope ONLY in each role's exclusive paths: Tomer packages/socket/** and packages/common/**, Maya packages/web/src/**. Record exact touched symbol and default-off regression test in own handoff before editing. Preserve old Razzia behaviour. No pushes, production deployment, real telephony, credentials or shared system changes.

Start with PROMPT_TOMER_01_BOOTSTRAP.md. After his bootstrap commit and coordinator branch sync, continue SAME Tomer chat with PROMPT_TOMER_02_BACKEND_AND_INTEGRATION.md and start Maya/Noam with their V3 prompts.
