# Execution schedule — ACTIVE V3, three persistent chats

## Gate A — Tomer only (PROMPT_TOMER_01_BOOTSTRAP.md)

Implement `@razzia/extensions` workspace and public exports, working TS/Vitest tooling, strict V1 shared contract schemas and isolated contract tests under `extensions/src/core/**`; document integration API and deliver a bootstrap commit. Update pnpm manifests/lockfile with minimal changes. No upstream behavioural hooks yet. Run unit/build/lint/format. **STOP** and return bootstrap hash; this is the only required serial setup stage.

## Gate B — Coordinator sync (no agent coding concurrently)

Verify Maya/Noam worktrees clean. Run `Sync-AgentBranches.ps1` to fast-forward those two branches to Tomer's bootstrap hash. Check shared contract imports resolve. Do not sync unused dormant worktrees.

## Wave 1 — Three simultaneous conversations (same windows across all waves)

- **Tomer (PROMPT_TOMER_02_BACKEND_AND_INTEGRATION.md, existing chat):** persist question IDs/sidecar revision and bundle import/export; composite manager API; scoreboard cadence and team assignment/aggregation; authoritative game stages/interlude policy, versioned status events, manager authorization, reconnect; server integration tests and backward-compatibility.
- **Maya (PROMPT_MAYA_01_UI.md, new chat):** entire web implementation—editor integrated save with extension API; image answer previews; media reveal effects; lobby teams/leaderboards; interlude views, sound controls and management; eight locales and accessible player/manager UI; web-focused tests.
- **Noam (PROMPT_NOAM_01_TELEPHONY.md, new chat):** provider-neutral telephony event bridge, offline mock provider, Yemot read-loop response translator (live disabled), simulated keypad participant using authentic session/join-ticket/Socket.IO flow, replay/rate-limit security and simulated concurrency tests.

Agents commit working milestones to THEIR OWN branches. Do not stop work because another role's code isn't available; test via versioned types + injected mocks and document integration wiring needed.

## Wave 2 — Controlled integration

Maya and Noam finish code/tests and provide explicit hashes. Tomer reviews changed path allowlists, type/API compatibility and tests; cherry-picks their commits into the Tomer integration branch. Tomer owns backend + integration adapters; Maya/Noam fix their own module defects in same chats and provide follow-up commits. Tomer runs full baseline + extension tests, then one serialized E2E/browser play on local Windows, covering Wi-Fi iPhone/iPad and mock phone participants (when available).

## Gate C — Acceptance

Pass build/typecheck/lint/format, original 217 unit/46 Playwright baseline (counts can evolve), extension feature unit/integration/E2E, eight-language parity, auth/replay/race tests and simulated 100-phone sessions. Record actual results. Preserve user data and main workspace. All external cloud or real telephone requirements remain separate, unverified and unpaid.

## Gate D — Optional independent QA (Roni)

Only if useful after Gate C: run `Prepare-QA.ps1` while Roni clean, open a **single temporary** Roni conversation with `PROMPT_RONI_OPTIONAL_QA.md`; examine integrated source, add independent regression/security/E2E tests in QA-owned files, return defects. Tomer/Maya/Noam fix in their original conversations; rerun. Do not launch Roni before integrated code exists.

### Never

No new chats per wave. No unrelated design/R&D. No seven-agent sprint. No new Razzia forks or extra worktrees. No conflicting test servers, default-branch merges, push, deployment, production phone line or paid subscription without owner approval.
