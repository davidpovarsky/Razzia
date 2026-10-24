# Git worktree and concurrency protocol — mandatory

## Isolation

Each independent Antigravity conversation MUST open only C:/Users/DAVID/Code/Razzia-worktrees/<role> as its workspace. Never open the main C:/Users/DAVID/Code/Razzia project in two coding sessions.
Every worktree has its own branch agent/<role>/wave1. Git shares object database and refs, NOT working files. Committed work survives IDE restarts; uncommitted files stay in that worktree but are not safely transferable.
On start: pwd/Get-Location; git rev-parse --show-toplevel; git branch --show-current; git status --short; git log -1 --oneline; verify expected path/branch. Abort on mismatch.
On finish: run scope tests, git diff --check, git status --short; stage ONLY explicitly owned files using git add <paths>; commit with role prefix; report hash, changed paths, test evidence, pending decisions.
Do not use git add -A / git add .; never commit .env, node_modules, config/ secrets, build artifacts, .config/, Playwright reports, or logs with personal data.

## Shared resources are NOT isolated by worktree

Git worktrees share repository refs, Git hooks/config, and can collide on branch operations. All agents must NOT change refs outside own branch; Tomer exclusively handles branch management and integration.
The main PC has 16 GB RAM and ~45 GB free at audit. Do not run seven installs, dev servers or Playwright suites concurrently. A shared pnpm store saves disk, but each worktree has its own node_modules. Keep dev server in main workspace on 3000/3001. Tests needing these ports must be serialized by Tomer, after stopping dev and with user consent.
Do not change root .env, shared local server, Windows firewall, system PATH, Docker state or global Antigravity settings. Copy only minimal LOCAL dummy .env when needed; never share manager password or JWT secret in docs/chats.
Set repo-local core.autocrlf=false and core.eol=lf in each worktree; do not run broad formatter over upstream. Only format touched owned files.

## Cross-agent communication

Never assume a separate Antigravity chat knows what another chat did. Communicate through commits, role-owned handoff files, explicit commit hashes and a read-only handoff index curated by Tomer.
An agent cannot modify another agent's worktree, role documents, branch or integration branch. Do not use cherry-pick/merge/pull/rebase/reset --hard/clean -fd. Request Tomer to integrate after approval.
If an upstream hook is needed: stop feature integration, create role-owned RFC with file/symbol, proposed minimal diff, no-hook alternatives, regression tests, risk; hand to Eitan and Tomer, then request owner approval. Only Tomer edits approved shared hook files in integration branch.

## Recovery

On restart: reopen same worktree folder and same Antigravity conversation; verify branch and git status. If chat state is missing, use role prompt + handoff + commits. If status unexpected, do not overwrite; record and ask Tomer.
