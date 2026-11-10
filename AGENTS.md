# Razzia downstream extension rules — MANDATORY (V3)

## Current scoped initiative — Tadazz platform UI, 10 November 2026

For the design-system initiative, follow
[the canonical mandate](docs/extensions/plans/TADAZZ_DESIGN_SYSTEM_UI_UNIFICATION_AGENT_PROMPT_2026-11-10.md),
[phase checkpoint](docs/extensions/plans/TDS_PROGRESS.md) and
[naming/scope policy](docs/extensions/plans/TDS_POLICY.md) first.
Use the [live catalog and component import guide](docs/extensions/plans/TDS_CATALOG.md)
for new platform UI, and run `pnpm --dir extensions ui:check` at each checkpoint.
This scope uses one sequential primary session and its isolated scoped worktree.
The old requirement to match original Razzia visuals applies to the frozen
editor and legacy compatibility surfaces; it does not govern new site, customer
Studio or host platform UI. Those use the governed Tadazz system. Show palettes
and cinematic choreography remain independently owned by the selected theme.

The content editor is strictly read-only, including indirect typography, CSS,
portal, routing and provider effects. No editor migration is authorized.
All `packages/**` sources are protected for this initiative; old P0 role-hook
permissions below do not authorize new upstream edits. First prove a downstream
composition alternative; any unavoidable seam needs exact pre-edit ledger and
separate explicit owner approval. Do not bypass this by build-time source
rewrites, global aliases or hidden DOM mutation. Run the freeze guard every phase.

The owner explicitly requested updates to the existing Asana parent and thirteen
phase tasks after each significant verified phase. Follow the checkpoint format
and keep incomplete phases and the release-gated parent open. No push, merge,
deployment, provider/billing change or customer-data migration is authorized.
The historical P0/V3 instructions below apply only where compatible with this
new scope. Preserve all existing data/wire IDs, logos, licenses and eight locales.

> **CURRENT P0 OVERRIDE (26 Oct 2026, Tomer one-agent):** The user's supplied `TADA_ONE_AGENT_TOMER_COMPLETE_P0_2026-10-26.md` is the active P0 execution instruction. BEFORE ANY P0 UI implementation, **MUST READ** `docs/extensions/orchestration/P0_ONE_AGENT_UI_FIDELITY_2026-10-26.md` and `docs/extensions/DESIGN_LANGUAGE.md`, then the actual current React components/CSS referenced there. All new interface components and typography must match original Razzia/Rubik/theme conventions. For this P0, the explicit single-agent and live private pilot instructions supersede older V3 three-agent/offline-only/ownership restrictions; preserve all other safety rules. Do not ask for Maya/Noam. This override applies only to the supplied P0 scope.

## Canonical instructions

Read docs/extensions/orchestration/00_START_HERE.md, 01_WORKTREE_PROTOCOL.md, 10_LOCKED_PRODUCT_DECISIONS.md, 11_RESEARCH_VERIFIED.md, 12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md, 13_FILE_OWNERSHIP.md, 14_ENGINEERING_ACCEPTANCE_CASES.md and your exact V3 PROMPT file before coding. Also consult docs/extensions/WORKING_RULES.md, PRODUCT_SPEC.md, ARCHITECTURE.md, DESIGN_LANGUAGE.md, CODE_AUDIT.md, CONTRACTS.md, INTEGRATION_POINTS.md, ACCEPTANCE_MATRIX.md, REVIEW_DECISIONS.md as historical reference. When role/ownership/process rules conflict, V3 orchestration controls; frozen V1 product/wire schemas remain binding.

## Agents and execution

Exactly THREE active independent Antigravity conversations: Tomer (backend/contracts/integration), Maya (web/editor/presentation/audio), Noam (telephony). Roni optional independent QA only after integration. Eitan/Yael/Dana dormant; their responsibilities consolidated. No research tasks delegated to coding agents; no subagents unless the owner explicitly asks. All agents use separate pre-existing worktrees, never main checkout.

## Fork protection

This is a fork of Ralex91/Razzia; origin davidpovarsky/Razzia, upstream Ralex91/Razzia. Preserve upstream behaviour and keep changes additive, modular and OFF by default. For this approved V3 project scope, Tomer MAY make minimal necessary upstream hooks under packages/socket/** and packages/common/**, and Maya MAY make minimal necessary upstream hooks under packages/web/src/**, each recording exact file/symbol/rationale/test in their OWN handoff BEFORE editing. No other upstream paths or unrelated refactors. Noam edits only extensions/src/telephony/**.

## Safety

Do not push, deploy, merge to main, buy telephone services, expose public tunnels, alter credentials/system settings or edit Asana without explicit request. Local role commits and Tomer's reviewed cherry-picks into his own branch are permitted. Do not run destructive Git commands. Keep telephony provider-neutral; local simulation only, no real Yemot account or number. No Hebrew/RTL or native/tablet-specific work now. All new user-facing text must cover existing en/fr/de/es/it/ja/tr/vi via i18next. Reuse upstream Rubik, Tailwind, Motion and visual conventions. Run tests and report actual evidence; never claim green from historical baseline alone.
