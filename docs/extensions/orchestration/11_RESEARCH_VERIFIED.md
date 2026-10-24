# VERIFIED EXTERNAL RESEARCH — OWNER-SUPPLIED ENGINEERING INPUT

Prepared by ChatGPT 2026-10-24 from current official vendor documentation. AGENTS MUST NOT RE-RESEARCH. This is not proof of real provider account/UK line capability.

## Antigravity concurrency and rules

Official rules: https://www.antigravity.google/docs/rules/
Verified: workspace-root AGENTS.md and GEMINI.md are persistent always-on rules; .agents/rules/*.md need valid YAML frontmatter trigger (always_on/model_decision/glob/manual). 24,000-byte per file limit; global rules also active. Avoid installing irrelevant Maktabah global rules; project rules and first prompt explicitly override where possible.
Official project/worktree docs: https://antigravity.google/docs/projects/
Verified: Projects offer Local Mode (directly edits current folder) and New Worktree Mode (creates separate new worktree); parallel sessions editing same Local Mode folder CAN overwrite one another. Our seven existing physical worktrees are already separate: choose EACH ROLE FOLDER as project workspace with Local Mode; DO NOT ask Antigravity to create yet another worktree. The 7 conversations need to keep exact folder->branch mapping and commit to preserve code.
Git official: https://git-scm.com/docs/git-worktree
Verified: branches/worktrees share common Git repository metadata/object store and cannot safely have the same branch checked out in two places; edits/working trees are isolated. No agent may switch/change another branch, merge, rebase or reset without integrator control.
Installed on PC: Antigravity.exe v2.26.0.0; seven clean worktrees created at 2665872a923375172499e9176f71c16276f85ce0; Node 24.22.1 project-local; pnpm 11.24; 217+46 green test baseline.

## Yemot HaMashiach

OFFICIAL DOC: https://f2.freeivr.co.il/topic/56/

- Module configure type=api and api_link=https://YOUR-REACHABLE-HTTPS-HOST/route; default sends HTTP GET; api_url_post=yes config switches to POST. Local localhost cannot be called by Yemot servers.
- Default callback includes ApiCallId (per-call identifier), ApiPhone (caller PII), ApiDID, ApiRealDID, ApiExtension, ApiTime (epoch seconds). Do not retain ApiPhone.
- Optional hangup callback has hangup=yes, ApiHangupExtension; configured via api_hangup_link.
- Server can answer with read=<message-to-play>=<data-collection-parameters>; documented example read=f-...=MOP,,4,4,Digits,yes . After entry, collected data is sent back to the server; read can create a request-response dialog (not an unrestricted continuous streaming DTMF event subscription).
- Example api_000 settings accept digit length and timeout. The confirmation defaults can be overridden; investigate? NO. The local mock models explicit one-digit answer and immediate submission; live performance cannot be asserted.
- SECURITY: docs list User-Agent yemot-core-api/1.0; this is NOT cryptographic caller authentication. No verified signed-webhook/HMAC method documented. Real provider gate requires trusted authentication strategy, TLS, nonce/rate limit and vendor verification. Synthetic signed MockProvider is different from Yemot.
- Platform developer-management API at https://www.call2all.co.il/ym/api/ (https://f2.freeivr.co.il/topic/55/) is a DIFFERENT API from IVR module type=api. Do not confuse them.
- Research did NOT prove UK number availability, simultaneous channel limit, data residency, service prices, live DTMF latency or how Trix is hosted; these remain explicitly outside local release and cannot be decided by agents. No agent should contact a provider or buy an account.
- Yemot terms may require purchased units for certain commercial/API services: https://www.yemot.co.il/אודות/ . Treat pricing as unverified for the future, irrelevant to free local stage.

## Socket.IO and Razzia actual protocol

Source: packages/socket/src/api/routes/auth.ts, games.ts, handlers/game.ts; packages/web/src/features/game/contexts/socket-context.tsx; packages/socket/src/services/game/round-manager.ts

- POST /api/auth/session with empty/optional token creates session JSON {token,clientId,role,expiresAt}.
- Socket.IO connects to http://localhost:3001 with path /ws and auth:{token}; token must match REST session. Player join: POST /api/games/join JSON {inviteCode,username}, Authorization Bearer <token> returns gameId and join ticket.
- Emit EVENTS.PLAYER.LOGIN payload {ticket}, then wait for EVENTS.GAME.SUCCESS_JOIN. During SELECT_ANSWER phase emit EVENTS.PLAYER.SELECTED_ANSWER {gameId,data:{answerKeys:[0]}}. The index is ZERO-based.
- RoundManager.selectAnswer checks acceptingAnswers, socket identity, duplicate submission and scores using server Date.now, not provider event timestamp. Bad/fake direct calls bypass checks if they invoke internals; bridge MUST use signed/verified client login flow.
- Vite development currently binds 0.0.0.0 (Wi-Fi/Tailscale visible), while socket listens on wildcard; local-only test, no public tunnel; no real personal data.

## Design and localization

Source: packages/web/src/index.css, branding.ts, components, packages/web/src/features/game/utils/constants.ts.
Rubik Variable; primary #ff9900; dark brown #1a140b; answer colours #e69f00 #56b4e9 #3dbfa0 #cc79a7; Tailwind v4; Radix/Lucide/Motion; use-sound and upstream audio assets.
Source: packages/web/src/i18n.ts uses Vite eager import.meta.glob("./locales/_/_.json"), 8 languages and 5 namespaces. Extension resources should be registered before i18n init, not by editing all 40 upstream files.
