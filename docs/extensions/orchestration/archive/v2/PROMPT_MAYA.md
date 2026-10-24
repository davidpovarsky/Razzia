# FINAL EXECUTION PROMPT V2 — MAYA

ROLE: Enhanced editor, image answers, reveals and UI
WORKSPACE: C:/Users/DAVID/Code/Razzia-worktrees/maya
BRANCH: agent/maya/wave1

MANDATORY: This is a CODING/TESTING/EXECUTION assignment, NOT a research/architecture assignment. The owner/ChatGPT has completed the research and frozen decisions in 10_LOCKED_PRODUCT_DECISIONS.md, 11_RESEARCH_VERIFIED.md, 12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md, 13_FILE_OWNERSHIP.md, 14_ENGINEERING_ACCEPTANCE_CASES.md. READ ALL FIVE fully, plus root AGENTS.md, GEMINI.md and 01_WORKTREE_PROTOCOL.md, before touching files. When these v2 docs conflict with older plans or PROMPTs, v2 prevails. Do not browse web, research vendors, compare alternatives, write an RFC instead of code, or redesign. If a detail is genuinely impossible, show failing repro/test and escalate to Tomer; implement all other tasks. Work exclusively in your precreated worktree and branch; verify path/branch/status first. Do not edit packages/**, pnpm-workspace.yaml, pnpm-lock.yaml, extension root package files, global settings, other roles' files, real .env, or shared planning docs. No push, merge, cherry-pick, rebase, git clean/reset or public network exposure. No Asana. Implement runnable code and unit tests with explicit commits and actual test evidence. Always maintain backward compatibility when extensions disabled. Handoff is role-owned WAVE1.md with tests, changed paths, hash, unresolved reproducible blockers. Do not stop after a plan; code and test.
IMPORTANT STAGING: Tomer MUST complete the package/bootstrap commit first. If your worktree has not received that commit yet, do NOT install/edit shared config or guess paths. Ask user/Tomer to update your branch via coordinated fast-forward while your worktree is clean. Once updated, begin coding immediately.

## Exact coding assignment

IMPLEMENT extensions/src/editor/** and extensions/src/media/** using existing React, Tailwind v4, Rubik, Lucide and Motion. Typed EditorEnhancementPanel with quiz-level sections (leaderboard, teams, audio), per-question picture answers/reveal/interlude, media picker using callbacks from host existing /api/media, accessible preview and rich answer card, answer visual rendering with alt text, and RevealMedia with none/blur/pixelate/tiles/zoom and server epoch sync. Use props/callbacks and extension public APIs; no direct editing upstream forms or imports of another agent's deep path. Reuse 4 answer colours and existing UI tokens. Support all 8 locales via provided translation keys and i18next namespace; Tomer will register. Handle save errors/conflicts visibly; do not auto-overwrite sidecar. Tests MEDIA01-03, editor reorder association, reduced-motion and alt text, preview behaviour, invalid media URL. Provide exact component exports to Tomer for integration. No design research; code now.

## Mandatory verification

1. Print git root, branch, baseline hash, status; verify exclusive ownership from 13_FILE_OWNERSHIP.md.
2. Implement all owned deliverables as actual TypeScript/React/Node code and tests; no placeholders presented as finished.
3. Run targeted test/typecheck/format/lint commands supported by bootstrap, fix errors until green. If E2E needs occupied ports, do not disrupt; report coordination needed.
4. git diff --check; git status --short; git add ONLY owned paths; git commit with role prefix; no push.
5. Write docs/extensions/orchestration/handoffs/maya/WAVE1.md with exact tests/exit codes, changed files, commit hash, concrete remaining integration needs and unresolved blockers. Finish with a concise Hebrew report to owner.

START CODING NOW once bootstrap is available. No research, no new architecture proposals, no subagents.
