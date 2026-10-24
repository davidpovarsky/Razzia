# Antigravity setup — Windows

Detected installed/running: C:/Users/DAVID/AppData/Local/Programs/antigravity/Antigravity.exe (2.26.0.0). Another separate installation "Antigravity IDE" exists; use the currently running Google Antigravity, not unrelated copies.
For EACH role:

1. Open Antigravity Agent Manager or IDE and choose Open Folder / Open Workspace.
2. Choose EXACT path C:/Users/DAVID/Code/Razzia-worktrees/<role>. Do not choose C:/Users/DAVID/Code/Razzia and do not let Antigravity create a SECOND worktree for this same role.
3. Create a NEW conversation in that role workspace. Paste the full PROMPT_<ROLE>.md from this directory as first message. Keep one dedicated conversation per role; rename it "Razzia W1 - <Role>".
4. Select your preferred available model/agent mode in Antigravity UI; model choices are not a dependency of this handbook. If terminal approval is requested, allow only task-scoped safe commands.
5. At the end ask the agent to produce role-owned handoff + local commit and report hash; do NOT ask it to merge to main.
6. Return to Tomer conversation only when all first-wave handoffs are ready. Tomer checks and coordinates integration after owner approval.
   Rule-loading: root AGENTS.md and GEMINI.md are canonical project-local instructions. Do not rely on automatically loaded custom rules being identical across IDE versions. Explicitly include their paths in the first prompt. We do not modify global ~/.gemini/config/GEMINI.md, because it contains Maktabah/Swift instructions irrelevant to Razzia.
   Check Git isolation: every agent MUST print pwd and git rev-parse --show-toplevel before editing. If path differs, stop.
   Port rules: main local server stays on 3000/3001. Worktrees do not start competing servers by default. To preview UI, build standalone static prototypes or coordinate an exclusive preview port with Tomer.
   Source references: Google Antigravity documentation https://antigravity.google/docs ; Git worktrees https://git-scm.com/docs/git-worktree . Read current UI labels as they may differ by release.
