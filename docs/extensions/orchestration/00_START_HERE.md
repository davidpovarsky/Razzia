# START HERE — FINAL V2 (2026-10-24)

SUPERSEDES prior 00_START_HERE.md, 02_OWNERSHIP_MATRIX.md, 03_EXECUTION_WAVES.md, 04_HANDOFF_AND_QA.md, and old PROMPT v1 content.
The owner explicitly requires ALL research and architecture decisions to be made by ChatGPT BEFORE agents run. Agents ONLY write code, run tests, debug and commit. NEVER delegate research or choose-your-own-architecture tasks.
Read in this exact order:

1. 10_LOCKED_PRODUCT_DECISIONS.md
2. 11_RESEARCH_VERIFIED.md
3. 12_IMPLEMENTATION_ARCHITECTURE_AND_WIRE.md
4. 13_FILE_OWNERSHIP.md
5. 14_ENGINEERING_ACCEPTANCE_CASES.md
6. 01_WORKTREE_PROTOCOL.md and 05_ANTIGRAVITY_SETUP.md (only isolation/setup mechanics)
7. Your own PROMPT_<ROLE>.md.
   Old documents under docs/extensions/ are historical context, NOT alternative instructions when inconsistent with V2.
   Seven physically separate worktrees at C:/Users/DAVID/Code/Razzia-worktrees/{eitan,noam,maya,roni,tomer,yael,dana}; separate branches agent/<role>/wave1. Never open main repo as coding workspace.
   FIRST OPEN TOMER only: he creates workspace @razzia/extensions and commits bootstrap. BEFORE starting other six, Tomer's bootstrap must be safely distributed to each clean role branch by Git fast-forward using scripts/orchestration/Sync-AgentBranches.ps1 (run from integration control; never while role agents editing). Then start all six parallel.
   If bootstrap branch update has not been completed, no feature agent may write code or alter package manifests; stop and request sync. Once synced, code immediately.
   Feature owners and implementation targets are 13_FILE_OWNERSHIP.md; all seven are CODERS/TESTERS, including Yael (teams/leaderboards) and Dana (interludes/audio).
   Only Tomer touches upstream packages/** or pnpm manifests. Feature agents write in exclusive extensions/src subtrees.
   Tomer integrates only after handoffs, reviews, actual tests and user confirmation. No push, live phone numbers, public server, production deploy, paid services or Asana changes.
   Original 217 unit / 46 browser E2E are baseline evidence, not evidence that new extensions work.
   Current plan commit is local only; changes to user project remain on Windows.
