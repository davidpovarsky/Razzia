# Git worktree safety — ACTIVE V3 (three coding conversations)

## Identity and isolation

Existing workspaces are separate real directories:

- Tomer: `C:\Users\DAVID\Code\Razzia-worktrees\tomer`; branch `agent/tomer/wave1`.
- Maya: `C:\Users\DAVID\Code\Razzia-worktrees\maya`; branch `agent/maya/wave1`.
- Noam: `C:\Users\DAVID\Code\Razzia-worktrees\noam`; branch `agent/noam/wave1`.
- Roni: `C:\Users\DAVID\Code\Razzia-worktrees\roni`; branch `agent/roni/wave1`; DO NOT OPEN until QA.
- Other old worktrees eitan/yael/dana remain untouched/inactive. Do not delete them automatically.

Each Antigravity conversation opens the existing role folder in **Local Mode**. Do not create another Antigravity worktree. First commands in every chat: `Get-Location`, `git rev-parse --show-toplevel`, `git branch --show-current`, `git status --short`, `git log -1 --oneline`. Abort on role/branch mismatch.

## Branch synchronization gates

- All role branches initially share the V3 planning commit.
- Tomer implements and commits workspace bootstrap on `agent/tomer/wave1`; no Maya/Noam coding yet.
- Coordinator runs `scripts/orchestration/Sync-AgentBranches.ps1` once after Tomer returns a successful bootstrap hash. Script checks BOTH Maya/Noam clean and uses `git merge --ff-only` to bring in Tomer's bootstrap. It is a local branch fast-forward, not merging to main.
- Then each role commits only its owned subtree. **Maya and Noam must never merge/rebase/cherry-pick/pull other role branches.**
- Tomer is the only integrator: after reviewing committed role outputs, he may `git cherry-pick <explicit-hash>` Maya and Noam changes onto `agent/tomer/wave1`. Each candidate must touch only the owner's files. He must not cherry-pick from uncommitted work.
- Do not re-run the bootstrap-sync script after Maya/Noam have begun coding. Cross-role interface changes go through versioned contract update and coordinated new milestone, not ad-hoc worktree pulls.
- The MAIN folder `C:\Users\DAVID\Code\Razzia` is the read-only planning/control and currently running development instance; do not use it as an Antigravity coding workspace.

## File/commit safety

No agent touches another's worktree or unowned files. Explicit `git add <owned-paths>`, not `git add -A`. One logical change per commit; log SHA, test evidence and unowned impacts in `docs/extensions/orchestration/handoffs/<role>/`. Preserve uncommitted changes in same worktree until explicitly resolved; never `git reset --hard`, `git clean -fd`, or force push.

No `.env`, credentials, `config/` personal data, `node_modules`, browser recordings, generated dist, or raw phone numbers in commits. Repo-local Git LF configuration must remain. Any approved change to upstream `packages/**` is role-owned, narrowly scoped, and recorded in the role handoff _before applying it_, with file/symbol, intended diff, reason and tests. The old shared `UPSTREAM_TOUCHES.md` must not be edited concurrently.

## Shared machine resources

The Windows PC has about 16 GB RAM; use Node 24 installed under `$HOME\.local\tools\node-v24.22.1-win-x64`. Install dependencies separately but **sequentially** in each worktree using pnpm frozen lockfile and shared pnpm store. Do not run three heavy builds at once. Noam runs mocked/isolated tests; Maya component tests; Tomer server tests. Only Tomer coordinates live integration, one Playwright suite and ports 3000/3001, after preserving any existing quiz data.

If a role lacks another module's implementation, code against the frozen public types and fake injected services rather than editing or importing another role's working files. Every exported integration boundary must be exercised with at least one contract test.

## Recovery

Reopen the same conversation and folder; verify current branch, staged/unstaged changes and commits. Git stores code; Antigravity chat stores conversation context; neither alone replaces handoff evidence. On mismatch, stop without destructive commands.
