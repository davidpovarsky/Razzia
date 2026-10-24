# FINAL EXECUTION PROMPT V2 — TOMER

ROLE: Workspace bootstrap and only upstream integrator
WORKSPACE: C:/Users/DAVID/Code/Razzia-worktrees/tomer
BRANCH: agent/tomer/wave1

MANDATORY: This is a CODING/TESTING/EXECUTION assignment, NOT a research/architecture assignment. The owner/ChatGPT has completed the research and frozen decisions in 10_LOCKED_PRODUCT_DECISIONS.md, 11_RESEARCH_VERIFIED.md, 12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md, 13_FILE_OWNERSHIP.md, 14_ENGINEERING_ACCEPTANCE_CASES.md. READ ALL FIVE fully, plus root AGENTS.md, GEMINI.md and 01_WORKTREE_PROTOCOL.md, before touching files. When these v2 docs conflict with older plans or PROMPTs, v2 prevails. Do not browse web, research vendors, compare alternatives, write an RFC instead of code, or redesign. If a detail is genuinely impossible, show failing repro/test and escalate to Tomer; implement all other tasks. Work exclusively in your precreated worktree and branch; verify path/branch/status first. Do not edit packages/**, pnpm-workspace.yaml, pnpm-lock.yaml, extension root package files, global settings, other roles' files, real .env, or shared planning docs. No push, merge, cherry-pick, rebase, git clean/reset or public network exposure. No Asana. Implement runnable code and unit tests with explicit commits and actual test evidence. Always maintain backward compatibility when extensions disabled. Handoff is role-owned WAVE1.md with tests, changed paths, hash, unresolved reproducible blockers. Do not stop after a plan; code and test.
IMPORTANT STAGING: Tomer MUST complete the package/bootstrap commit first. If your worktree has not received that commit yet, do NOT install/edit shared config or guess paths. Ask user/Tomer to update your branch via coordinated fast-forward while your worktree is clean. Once updated, begin coding immediately.

## Exact coding assignment

YOU EXECUTE IN TWO STAGES. STAGE 0 NOW: create @razzia/extensions package and exports exactly as 12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md; add extensions workspace entry, package deps, tsconfig, vitest config, source module entrypoint placeholders with NO other agents' owned code. Update pnpm lockfile deterministically. Verify pnpm install --frozen-lockfile, pnpm test, pnpm build, pnpm lint, pnpm format; do not stop existing server or run E2E while it runs. Commit 'build(extensions): bootstrap typed workspace' locally, report hash and STOP before integration so other role branches can fast-forward cleanly. STAGE 1 AFTER ROLE HANDOFFS: cherry-pick vetted role commits into your integration worktree in dependency order; add minimal upstream hooks only YOU own: packages/socket/src/api/index.ts and game routes/handlers/RoundManager for extension metadata, event snapshots and manager commands; packages/web editor header/page, game presenter/answer renderer and i18n loading; package exports and route typing. Preserve existing base game unchanged when extras absent. Implement manager authenticated composite API, replay-safe provider bridge, team UI, audio/interludes, leaderboard policy, media reveal and editor persistence end-to-end. Run all 14_ENGINEERING_ACCEPTANCE_CASES.md plus 217+46 baseline after exclusive dev server window. Fix only your adapters and route defects; route role-owned bugs back to role. No push/deploy/real phone. In STAGE 0 do not invent new research or change product decisions. Coordinate worktree fast-forwards ONLY after all clean and user asks to proceed.

## Mandatory verification

1. Print git root, branch, baseline hash, status; verify exclusive ownership from 13_FILE_OWNERSHIP.md.
2. Implement all owned deliverables as actual TypeScript/React/Node code and tests; no placeholders presented as finished.
3. Run targeted test/typecheck/format/lint commands supported by bootstrap, fix errors until green. If E2E needs occupied ports, do not disrupt; report coordination needed.
4. git diff --check; git status --short; git add ONLY owned paths; git commit with role prefix; no push.
5. Write docs/extensions/orchestration/handoffs/tomer/WAVE1.md with exact tests/exit codes, changed files, commit hash, concrete remaining integration needs and unresolved blockers. Finish with a concise Hebrew report to owner.

START CODING NOW once bootstrap is available. No research, no new architecture proposals, no subagents.
