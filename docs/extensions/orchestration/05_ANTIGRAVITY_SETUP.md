# Antigravity setup on Windows — ACTIVE V3

- Installed Google Antigravity app has been seen on this PC. UI labels can vary. Use **Open Folder / Workspace** and open the pre-created folder for the agent. Where Antigravity asks about mode, choose **Local Mode** on that role's existing worktree. Never choose `New Worktree` for an already isolated role.
- Never open `C:\Users\DAVID\Code\Razzia` as a coding agent workspace. It is the original sample game/control checkout and can have a running dev server.
- Start **one** conversation named `Razzia - Tomer backend` in `C:\Users\DAVID\Code\Razzia-worktrees\tomer`; paste `PROMPT_TOMER_01_BOOTSTRAP.md` fully. Keep that conversation after bootstrap.
- When Tomer confirms bootstrap commit, run the documented local `Sync-AgentBranches.ps1` (no Maya/Noam edits yet). Then paste `PROMPT_TOMER_02_BACKEND_AND_INTEGRATION.md` into the **same Tomer conversation**.
- Start `Razzia - Maya frontend` with `PROMPT_MAYA_01_UI.md` in `...\maya`.
- Start `Razzia - Noam telephony` with `PROMPT_NOAM_01_TELEPHONY.md` in `...\noam`.
- Continue the SAME 3 conversations through fixes, delivery and integration; do not start new chats every phase.
- Roni is optional **after** integrated code and tests, and uses his existing `...\roni` worktree only after `Prepare-QA.ps1` has synchronized it.
- Agents must validate `git rev-parse --show-toplevel`, `git branch --show-current` and `git status --short` before edits. If wrong, STOP.
- Root `AGENTS.md` and `GEMINI.md` reference the V3 canonical docs. The first prompt tells each agent to read them explicitly; do not rely on auto-loading or unrelated global Maktabah/Swift instructions.
- Only scoped terminal permissions; never approve cleanup, force Git, public tunnel, system configuration changes or secrets disclosure. Node 24 is under `C:\Users\DAVID\.local\tools\node-v24.22.1-win-x64`.
- If you are using multiple Antigravity windows: confirm the title/workspace folder before each paste. These are **three independent main conversations**, not subagents.
