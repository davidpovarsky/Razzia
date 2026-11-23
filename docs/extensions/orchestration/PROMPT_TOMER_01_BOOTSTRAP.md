# TOMER — STEP 1: BOOTSTRAP ONLY (V3)

Workspace: C:/Users/DAVID/Code/Razzia-worktrees/tomer
Branch: agent/tomer/wave1

You are an implementation agent, not a researcher. Read root AGENTS.md and GEMINI.md and orchestration docs 00, 01, 10, 11, 12, 13, 14. V3 ownership overrides prior seven-agent plans; locked product/API contracts stay unchanged. Do not browse, research, design new architecture, delegate or create subagents. Write working code and tests. Do not push/deploy, change system settings, or stop the user's running server.

FIRST verify git root, branch, clean status and commit. If unexpected, stop.

IMPLEMENT NOW:

1. Add one pnpm workspace package @razzia/extensions and correct subpath exports core/server/gameplay/editor/media/presentation/telephony/locales/testkit. Set tsconfig, Vitest and source entrypoints. Minimal empty entrypoint placeholders for Maya/Noam only during bootstrap, with no feature code. Add only necessary workspace dependencies to packages/web/package.json, packages/socket/package.json, pnpm-workspace.yaml, pnpm-lock.yaml.
2. Implement strict shared V1 Zod schemas and TypeScript contracts in extensions/src/core/** exactly per 12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md: QuizExtrasV1, safe media refs, alt validation, stable question UUID mapping for reorder/duplicate/delete, deterministic canonical base digest, revision checks, extension state envelope and manager command schema. No server-only filesystem dependency in core.
3. Test schema rejection, defaults, legacy fallback, unsafe URLs, deterministic digest, question identity, type exports, package imports. Run pnpm install --frozen-lockfile, extension tests, root unit/build/lint and targeted format checks. Fix until green; report actual commands and exit codes.
4. Write docs/extensions/orchestration/handoffs/tomer/BOOTSTRAP.md with exports, tests, changed files and commit hash. Stage only owned paths; commit locally as build(extensions): bootstrap shared contracts for three agents.

STOP AFTER BOOTSTRAP COMMIT. Do NOT start backend or integration until the coordinator has fast-forwarded Maya and Noam and sends you PROMPT_TOMER_02_BACKEND_AND_INTEGRATION.md in this SAME chat. No additional research.
