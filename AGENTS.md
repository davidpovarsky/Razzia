# Razzia downstream extension rules â€” MANDATORY

Read docs/extensions/WORKING_RULES.md, PRODUCT_SPEC.md, ARCHITECTURE.md, DESIGN_LANGUAGE.md, DELIVERY_PLAN.md, AGENT_ASSIGNMENTS.md, CODE_AUDIT.md, CONTRACTS.md, INTEGRATION_POINTS.md, ACCEPTANCE_MATRIX.md, and REVIEW_DECISIONS.md before any change.
For separate Antigravity conversations, read docs/extensions/orchestration/00_START_HERE.md, 01_WORKTREE_PROTOCOL.md, 02_OWNERSHIP_MATRIX.md, 03_EXECUTION_WAVES.md, 04_HANDOFF_AND_QA.md and your role's PROMPT_*.md. Every role must open its own pre-created C:/Users/DAVID/Code/Razzia-worktrees/<role> worktree. Do not open the main repository as a feature-agent workspace.
This is a fork of Ralex91/Razzia. origin is davidpovarsky/Razzia; upstream is Ralex91/Razzia. Preserve upstream and keep changes additive.
All agents, including Codex and Antigravity, MUST follow these documents. User instructions supersede these rules.
Do not implement features until a scoped task is approved. Do not silently broaden scope. Never push, merge, deploy, buy telephony, or change credentials without explicit permission.
Never modify upstream-owned files except the smallest reviewed integration hook proven unavoidable; record the exact diff and rationale in UPSTREAM_TOUCHES.md BEFORE editing.
All feature code goes under extensions/ in small cohesive modules; keep telephony provider adapters independent of the game. No duplicated upstream components.
No Hebrew or tablet-specific work now. Every new user-facing string must use i18next and cover the eight existing languages. Reuse upstream UI components, Rubik, Tailwind tokens, Motion and conventions.
Maintain passing upstream tests and add focused tests; report exact commands, failures and merge risks. Do not claim success without evidence.
Default: main agent acts directly. Named subagents only when the user explicitly requests TEAM execution. No Asana writes without user request.
