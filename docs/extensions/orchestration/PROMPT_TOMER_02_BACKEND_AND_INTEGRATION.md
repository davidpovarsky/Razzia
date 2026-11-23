# TOMER — STEP 2: BACKEND, GAMEPLAY AND INTEGRATION (V3)

Send to SAME Tomer Antigravity chat ONLY after bootstrap sync. Workspace C:/Users/DAVID/Code/Razzia-worktrees/tomer, branch agent/tomer/wave1.

Read root AGENTS.md/GEMINI.md and docs/extensions/orchestration/00,01,10,11,12,13,14. You are a coding/testing agent. No new research, subagents or architecture decisions. V3 owns packages/socket/**, packages/common/**, extensions/src/{core,server,gameplay,integration}/**, shared package manifests/lock/config. Maya owns packages/web/src/** and frontend extension modules. Noam owns telephony. Do not edit their code. Before work verify git root/branch/status.

IMPLEMENT AND TEST:
A. Server-side storage: strict sidecar schema at config/extensions/quizzes/<id>.json, injected original getPath/getQuizzById/updateQuizz/saveQuizz/deleteQuizz, stable question IDs, duplicate/delete/reorder, deterministic digest, journaled atomic-equivalent two-file save and crash recovery, revision 409 conflict, legacy defaults, enhanced bundle import/export. Tests CORE01-06 and MEDIA02.
B. Hono composite REST routes under /api/extensions/quizzes and /api/extensions/import/export. Exact wire contract in doc 12; manager auth, strict Zod, 400/401/403/404/409 as specified. Preserve existing /api/quizz. Never expose raw file paths.
C. Pure gameplay: upstream/everyN/selected/categoryEnd/manual leaderboards, no board after final, survey unchanged; 2..12 teams, round-robin, manual lobby reassignment, stable clientId, reconnect, kicked removal, deterministic team score ties. Tests GAME01-04 and TEAM01-03.
D. Minimal upstream server game hooks for authoritative extensions:state snapshots with monotonic seq, per-question epoch, safe audience filtering; extensions:command manager authorization and dedupe, server-timed interludes and reveal, reconnect snapshot. Preserve old Socket.IO events and disabled-feature behavior. Tests INT01-02, MEDIA03, SEC01-03. Log each upstream touched file/symbol/rationale/test in your own handoff BEFORE modifying.
E. Backend tests using fake web/phone clients; do not edit Maya or Noam code. Continue working while they implement against the frozen contracts.
F. INTEGRATION GATE only after Maya/Noam deliver local commits: inspect their exact hashes and changed paths, reject unowned changes, cherry-pick reviewed commits onto this Tomer branch. Integrate via your own adapters; report feature-owned bugs to original role for fixes in SAME chats. Never merge to main.
G. Run extension tests, full root unit/build/lint/format, serialized browser E2E on ports 3000/3001 only with coordinated exclusive use, iPhone/iPad LAN joins, 100 simulated phone participants, eight locales, security, reconnect and legacy quiz. Record ACTUAL results; don't claim real carrier verification.

Produce role-owned BACKEND.md and INTEGRATION.md handoffs with commit SHAs, test counts, known failures and paths. Make logical local commits. No push, deploy, paid services, or unrelated refactors. Continue SAME conversation for fixes.
