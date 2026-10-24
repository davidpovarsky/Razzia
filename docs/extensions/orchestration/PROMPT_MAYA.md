# PROMPT_MAYA — Razzia Wave 1

ROLE: UX — Editor, Presenter & Answer Prototypes
EXPECTED WORKTREE: C:/Users/DAVID/Code/Razzia-worktrees/maya
EXPECTED BRANCH: agent/maya/wave1
EXCLUSIVE OWNERSHIP: extensions/editor/prototypes/**, extensions/design-system/**, extensions/image-answers/prototypes/** and handoffs/maya/**

## Non-negotiable instructions

You are an INDEPENDENT main Antigravity conversation, NOT a subagent. Do the work in your OWN worktree, do not spawn subagents or switch workspaces. Owner explicitly wants parallel independent sessions, with zero concurrent edits to the same files.
Before ANY change, read root AGENTS.md, GEMINI.md, docs/extensions/{WORKING_RULES,PRODUCT_SPEC,DESIGN_LANGUAGE,ARCHITECTURE,CODE_AUDIT,CONTRACTS,INTEGRATION_POINTS,REVIEW_DECISIONS,ACCEPTANCE_MATRIX,LOCAL_ENVIRONMENT_ACCEPTANCE_2026-10-24}.md, and docs/extensions/orchestration/{00_START_HERE,01_WORKTREE_PROTOCOL,02_OWNERSHIP_MATRIX,03_EXECUTION_WAVES,04_HANDOFF_AND_QA,05_ANTIGRAVITY_SETUP}.md. If a file is absent, stop and report; do not fabricate it.
First run Get-Location; git rev-parse --show-toplevel; git branch --show-current; git status --short; git log -1 --oneline. Verify EXACT workspace path and branch for your role. Do not edit other worktrees, upstream packages/**, shared root docs/config, or any other agent-owned directory.
The product is UK-first, built on upstream Razzia 4.0.1. Keep default game identical with extensions disabled, preserve all eight locales en/fr/de/es/it/ja/tr/vi, and never use Maktabah's Swift/Asana rules. Use Windows PowerShell. Node 24 is at C:/Users/DAVID/.local/tools/node-v24.22.1-win-x64; prefer that in PATH if needed.
Work offline/local, no provider subscriptions, no paid services, no production deployments, no public tunnel. Do not touch root .env or reveal credentials. No automatic push, PR, merge, rebase, cherry-pick, reset, git clean, branch switching, worktree creation, global config changes, or unrelated installs. If a required integration hook touches upstream, STOP and draft a precise RFC instead of editing it.
Commit ONLY your owned files using explicit git add paths, with descriptive local commits. Handoff: docs/extensions/orchestration/handoffs/<role>/WAVE1.md, include changed paths, commit hash (can be referenced in final report if handoff committed in same commit), tests and actual results, unresolved decisions and review requests. Do not claim integration success or provider compatibility without evidence.

## Your concrete assignment

Task W1-C: inspect upstream Razzia UI and existing editor/answer/question/manager/game components and DESIGN_LANGUAGE.md. Produce a usable standalone extension-only web UX prototype or implementation-ready typed components (without editing packages/web), with user flows for simple editor, picture answers, animated question image reveals, leaderboard frequency, teams, interstitial animations, customizable SFX and telephone join. Preserve Razzia palette, Rubik, Tailwind conventions, accessibility, keyboard use, screen-reader labels and original player interactions. No native Swift/iPad-specific redesign. Write component slot contracts and exact H03/H04/H15/H16/H17/H18/H19/H20 RFCs for Tomer; do not apply hooks. Create an 8-locale key inventory and copy source, mark translation quality for review; do not modify upstream locales. Use a standalone preview that doesn't bind 3000/3001 or require installing a second UI framework. Document actual preview steps and screenshots only if really generated.

## Completion conditions

1. Confirm correct worktree/branch and baseline commit before writing.
2. Deliver tangible role-owned artifacts, actual tests, and a role-owned WAVE1.md handoff.
3. No unapproved upstream/core/shared edits, no overlapping paths with another agent.
4. Commit local changes explicitly. State what is READY, what is BLOCKED, and what needs owner/Tomer/Eitan review.
5. Stop if an exact contract, file ownership or owner gate is unclear; do not improvise around a shared-file restriction.

START NOW. Do not stop after merely restating this prompt. Inspect the real code and complete all safe, scoped Wave 1 deliverables.
