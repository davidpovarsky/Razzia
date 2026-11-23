# NOAM — PROVIDER-NEUTRAL LOCAL TELEPHONY (V3)

Start ONLY after Tomer bootstrap commit and coordinator's Sync-AgentBranches.ps1 have completed. Open C:/Users/DAVID/Code/Razzia-worktrees/noam in Antigravity Local Mode, branch agent/noam/wave1. Keep SAME chat through implementation and integration fixes.

Read root AGENTS.md/GEMINI.md and docs/extensions/orchestration/00,01,10,11,12,13,14. You implement/test/debug, NOT research or redesign. No web browsing, subagents, paid provider signup or public tunnels. Verify git root/branch/status/commit before edits.

EXCLUSIVE OWNERSHIP: extensions/src/telephony/** and docs/extensions/orchestration/handoffs/noam/** ONLY. Do not edit packages/**, root config/lockfiles, shared core or other modules.

IMPLEMENT:

1. TelephonyProvider interface, TelephonyBridge orchestrator, per-call/room/question epoch state, injected transport and provider adapter registry. Pure MockProvider signs synthetic events with HMAC-SHA256; verify timing skew <=120s, replay TTL 10min, 1000 session cap, per-call digit throttle, redacted logs, no real caller numbers. Strict PIN validation six digits.
2. Local keypad simulator (browser component within your module or CLI) with real authenticated Razzia flow: POST /api/auth/session -> POST /api/games/join with inviteCode/username + Bearer session -> Socket.IO path /ws auth token -> PLAYER.LOGIN ticket -> GAME.SUCCESS_JOIN -> PLAYER.SELECTED_ANSWER with gameId,data.answerKeys:[zero-based index]. 1..4 maps to 0..3; only SELECT_ANSWER accepted; server scoring clock authoritative. Mock injected transport for isolated tests. Do not bypass socket auth or directly call RoundManager.
3. Yemot type=api GET/POST callback parser and read prompt response translator, optional hangup. Real Yemot stays DISABLED and unverified: no documented provider-signed HMAC, UK number, real DTMF streaming, concurrent-call capacity or commercial costs established. Synthetic mock HMAC is NOT evidence of real provider auth. No real webhook exposure.
4. Unit/integration tests PHONE01-05 and SEC02: valid join, answer, duplicate/replay/out-of-order/late epoch, invalid PIN, cross-room isolation, reconnect, wrong ticket, unsupported multi-choice/estimation/survey/>4 options, 100 synthetic concurrent participants with p50/p95 and failures. Local-only, no competing dev servers.
5. Export public @razzia/extensions/telephony API for MockProvider, YemotApiTranslator, TelephonyBridge, RazziaSocketClient and simulator. Provide exact integration usage and expected inputs to Tomer. No editing server or web modules.

Write tested code and logical local commits. Document imports, protocol tests, simulated load, exact commit hashes, and unverified carrier constraints in docs/extensions/orchestration/handoffs/noam/TELEPHONY.md. No push/merge/deploy. Continue SAME conversation for defects found during Tomer integration.
