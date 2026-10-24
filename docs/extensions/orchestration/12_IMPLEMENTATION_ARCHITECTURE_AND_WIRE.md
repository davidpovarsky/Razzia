# LOCKED IMPLEMENTATION ARCHITECTURE / WIRE CONTRACTS v2

Implementation code is written by agents only. This doc is the controlling contract. Earlier CONTRACTS.md is superseded where conflicting.

## Workspace packaging: one additive workspace package

Tomer FIRST adds 'extensions' to pnpm-workspace.yaml as one additional package, creates extensions/package.json name @razzia/extensions, type module, private true, subpath exports pointing to .ts/.tsx source; adds @razzia/extensions: workspace:* in packages/web/package.json and packages/socket/package.json, adjusts pnpm-lock.yaml only via pnpm install --frozen-lockfile after lock regeneration using pnpm install --lockfile-only. Existing packages/common untouched. Extension package has dependencies @razzia/common:workspace:*, zod:catalog:, React peer compatible with packages/web, react-dom, lucide-react, motion; devDependencies vitest/tsx/typescript as required. Do not add an unnecessary UI framework.
Exports REQUIRED: @razzia/extensions/core, /gameplay, /media, /presentation, /telephony, /testkit, /editor, /locales, /server. Each exports through its own index.ts; NO importing /src deep paths between modules.
Root pnpm build and pnpm test remain baseline-compatible; extensions tests via explicit pnpm --filter @razzia/extensions test. Root package does not implicitly run extension tests unless configured by Tomer after acceptance.
Tomer supplies extensions/vitest.config.ts, and correct tsconfig paths/aliases for package typings. Do not manually edit other agents' package.json or root lockfile.
Antigravity agents start module coding AFTER Tomer bootstrap commit is fast-forwarded into all clean worktrees. All shared scripts and docs remain integrator-owned.

## Shared types (owned by Eitan extensions/src/core)

Export quizExtrasV1Schema via Zod with strict objects. Exact data:
QuizExtrasV1 = {
schemaVersion:1; revision:number; quizId:string; baseDigest:string;
questionIds:string[]; // index aligns to original validated quiz.questions array
leaderboard:{mode:'upstream'|'everyN'|'selected'|'categoryEnd'|'manual'; everyN?:number; afterQuestionIds?:string[]};
teams:{enabled:boolean; teams:Array<{id:string;name:string;color:string}>; autoAssign:'roundRobin'};
audio:{cues:Record<CueId,{source:'default'|'media'; url?:string; volume:number; enabled:boolean; loop:boolean}>};
perQuestion:Record<string,{answerVisuals?:Array<{answerIndex:number;display:'text'|'image'|'both';url?:string;alt:string}>;reveal?:{effect:'none'|'blur'|'pixelate'|'tiles'|'zoom';durationMs:number;trigger:'automatic'|'manual';audience:'manager'|'all'};interlude?:{kind:'title'|'image'|'video'|'countdown';title?:string;url?:string;durationMs:number;advance:'auto'|'manual';audioCue?:string}}>;
}
Question IDs must be unique UUIDs and align with canonical Questions; perQuestion keys must refer to IDs in questionIds. Default missing sidecar creates in-memory defaults, writing only on explicit enhanced Save. Digest sha256(JSON.stringify(canonical validated quiz)) under deterministic key ordering; server and client should request digest, not recompute differently. If digest mismatch, HTTP 409 and preserve original. Media URLs must pass safe media ref validator (root-relative /media/... or allowed HTTPS URL), no javascript/data/file URL. Alt required when image display.

## Composite REST API (Tomer HTTP hook, Eitan logic)

Mount manager-authenticated Hono extension routes at /api/extensions with requireManager from packages/socket/src/api/middleware.ts. Exact paths:
GET /api/extensions/quizzes/:id => 200 {quizId,exists,extras:QuizExtrasV1|null,baseDigest} or 404.
PUT /api/extensions/quizzes/:id => body {expectedRevision:number|null,quizz:QuizzValidated,extras:QuizExtrasV1} => 200 {quizId,revision,baseDigest}; 409 on revision/digest conflict, 400 validation, 401/403 auth; base and sidecar journaled with recovery.
POST /api/extensions/quizzes => {quizz,extras} => 201 {quizId,revision:1}; ID minted by original saveQuizz.
DELETE /api/extensions/quizzes/:id => deletes base+sidecar after manager auth, 204 (verify original delete still works).
POST /api/extensions/import => {bundleVersion:1,quizz,extras} => 201 {quizId,revision:1} ; base legacy import unchanged.
GET /api/extensions/export/:id => {bundleVersion:1,quizz,extras}.
Manager UI uses this composite endpoint when enhanced editing enabled; vanilla quizz endpoints remain operational. Independent injection of stale revision and IO failures must fail closed, never corrupt quiz JSON.

## Game events / host state

Existing GAME.STATUS payload unchanged when no sidecar. New versioned event string 'extensions:state' is server->clients (manager and joined players only), with wire envelope:
{v:1,gameId:string,seq:number,epoch:number,questionId?:string,phase:'lobby'|'prepared'|'question'|'answers'|'responses'|'leaderboard'|'interlude'|'finished',startedAt:number,extras:{...minimal relevant current question/team scores/leaderboard/reveal/interlude/audio}}.
Never send solutions to player before result reveal. Always authenticate client/room before subscribing, and return latest snapshot on reconnect. seq monotonically increases per game, prevent duplicate transitions; epoch increments at each new question. Client skips older seq and cancels timers on stage change. Game over/leave disposes subscription and timers.
Manager->server action string 'extensions:command' union:
{v:1,gameId,action:'SHOW_LEADERBOARD'|'SKIP_INTERLUDE'|'REVEAL_MEDIA'|'ASSIGN_TEAM',payload,requestId:string}.
Tomer defines Zod strict validators and manager role/room auth in existing Socket.IO handler validation; no anonymous command injection. Team assignment allowed only in SHOW_ROOM. Answer through original player:selectedAnswer, not new bypass channel.

## Workstream interfaces

Eitan exports extension storage adapters accepting injected getPath/updateQuizz/saveQuizz/deleteQuizz and pure ID/digest/journal utilities. Eitan not allowed to import packages/socket internal modules; Tomer wires injected functions in integration seam.
Yael exports pure functions shouldShowLeaderboard(policy,query), projectTeamScores(teamAssignments,players), assignRoundRobin/assignManual validation; no socket/web coupling. Readonly player snapshots; no mutation.
Dana exports pure interlude state machine and audio cue resolver and React AudioCuePlayer only in own module; server stage scheduling authority remains Tomer; no direct global SFX constant mutation.
Maya exports EditorEnhancementPanel, RichAnswerCard, RevealMedia, TeamLeaderboardPanel, InterludePreview as React components accepting typed contracts and callbacks, not direct imports from game internals. External display data always sanitized.
Noam exports MockProvider and YemotApiTranslator (documented read protocol), TelephonyBridge orchestrator with injected transport, authenticated Razzia SocketClient adapter; browser keypad simulator page consumed by Maya/Tomer integration through composition.
Roni exports deterministic fixtures, tests, QA scripts, including E2E tests which Tomer integrates after root suite freeze.
Tomer is SOLE upstream hook editor: web editor save/header/pages, server API mount/game lifecycle/RoundManager, common socket validators/status only if required by design, page game overlay/mount, i18n resource injection, sound callers and media renderer slots. Preserve original behaviour with flags off.

## Security

Original manager auth required. Mock provider simulator browser route requires manager session to simulate participants; if phone players simulate anonymously, they still get per-call session tokens using original auth. Provider signature verifier is injected; synthetic MockProvider uses HMAC-SHA256, rejects replay, timing skew >120s and non-HTTPS real URLs. Never claim Yemot has documented HMAC; real adapter is disabled by default with explicit ENABLE_REAL_TELEPHONY=false, not in .env until user buys service.
Strong mutex/idempotency per (callId,gameId,epoch), event TTL 10 minutes. Throttle input 10 digits/sec/call, cap 1000 sessions local, validate 6-digit room code. No raw caller numbers in logs. If unknown webhook auth, refuse processing outside mock mode.
