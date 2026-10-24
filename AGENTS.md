# Razzia downstream extension rules — MANDATORY (V3)

## Canonical instructions

Read docs/extensions/orchestration/00_START_HERE.md, 01_WORKTREE_PROTOCOL.md, 10_LOCKED_PRODUCT_DECISIONS.md, 11_RESEARCH_VERIFIED.md, 12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md, 13_FILE_OWNERSHIP.md, 14_ENGINEERING_ACCEPTANCE_CASES.md and your exact V3 PROMPT file before coding. Also consult docs/extensions/WORKING_RULES.md, PRODUCT_SPEC.md, ARCHITECTURE.md, DESIGN_LANGUAGE.md, CODE_AUDIT.md, CONTRACTS.md, INTEGRATION_POINTS.md, ACCEPTANCE_MATRIX.md, REVIEW_DECISIONS.md as historical reference. When role/ownership/process rules conflict, V3 orchestration controls; frozen V1 product/wire schemas remain binding.

## Agents and execution

Exactly THREE active independent Antigravity conversations: Tomer (backend/contracts/integration), Maya (web/editor/presentation/audio), Noam (telephony). Roni optional independent QA only after integration. Eitan/Yael/Dana dormant; their responsibilities consolidated. No research tasks delegated to coding agents; no subagents unless the owner explicitly asks. All agents use separate pre-existing worktrees, never main checkout.

## Fork protection

This is a fork of Ralex91/Razzia; origin davidpovarsky/Razzia, upstream Ralex91/Razzia. Preserve upstream behaviour and keep changes additive, modular and OFF by default. For this approved V3 project scope, Tomer MAY make minimal necessary upstream hooks under packages/socket/** and packages/common/**, and Maya MAY make minimal necessary upstream hooks under packages/web/src/**, each recording exact file/symbol/rationale/test in their OWN handoff BEFORE editing. No other upstream paths or unrelated refactors. Noam edits only extensions/src/telephony/**.

## Safety

Do not push, deploy, merge to main, buy telephone services, expose public tunnels, alter credentials/system settings or edit Asana without explicit request. Local role commits and Tomer's reviewed cherry-picks into his own branch are permitted. Do not run destructive Git commands. Keep telephony provider-neutral; local simulation only, no real Yemot account or number. No Hebrew/RTL or native/tablet-specific work now. All new user-facing text must cover existing en/fr/de/es/it/ja/tr/vi via i18next. Reuse upstream Rubik, Tailwind, Motion and visual conventions. Run tests and report actual evidence; never claim green from historical baseline alone.
