# Extension contracts — v1 DESIGN (NOT IMPLEMENTED)

Contract authority: Eitan. These TypeScript-like shapes specify intended boundaries; none are claimed as current upstream exports.

## 1. Extension registration

ExtensionModuleV1 = { id: string; apiVersion: 1; dependencies?: string[]; register(ctx: ExtensionContextV1): void; dispose?(): Promise<void> }.
ExtensionContextV1 = { registerEditorPanel(slot, component); registerGameOverlay(slot, component); registerRoundPolicy(policy); registerQuestionRenderer(kind, renderer); registerAudioCue(cue); registerLocale(namespace, language, resources); registerResultEnricher(enricher) }.
Registration is deterministic, duplicate IDs rejected, failures isolated, features gated. No dynamic execution of untrusted code.
No generic all-powerful registry exposed to runtime; separate typed interfaces for web/server.

## 2. Quiz metadata and question identity

ExtensionQuizV1 = { schemaVersion: 1; quizId: string; revision: number; questionBindings: Array<{ questionId: string; sourceFingerprint: string; positionHint: number }>; features: { leaderboard?: LeaderboardPolicyV1; teams?: TeamPolicyV1; interludes?: InterludeV1[]; audio?: AudioThemeV1 }; questionFeatures: Record<string, QuestionFeaturesV1> }.
QuestionFeaturesV1 = { answers?: AnswerVisualV1[]; reveal?: RevealEffectV1 }.
AnswerVisualV1 = { answerIndex: number; media?: MediaRefV1; altTextKey?: string; display: 'text'|'image'|'both' }.
MediaRefV1 = { url: string; kind: 'image'|'video'|'audio'; integrity?: string }.
Stable question IDs MUST be generated/maintained by extension editor and reconciled through explicit reorder/delete actions. Fingerprint/position only used for migration detection, never silent binding.
Store sidecar in config/extensions/quizzes/<quizId>.json (proposed path, subject to config path review), separate from upstream quiz JSON. Revision checked on save; atomic write/rename; delete cleanup and export/import tested.

## 3. Leaderboard

LeaderboardPolicyV1 = { mode:'upstream'|'everyN'|'selected'|'categoryEnd'|'manual'; everyN?:number; afterQuestionIds?:string[]; includeFinal?:boolean }.
Contract function shouldShowLeaderboard(ctx:{questionId:string;questionNumber:number;total:number;category:string|null;isLast:boolean;gameMode:string},policy): boolean.
Legacy default = upstream existing category/last-question skip semantics; survey remains unaffected unless explicitly designed.

## 4. Teams

TeamPolicyV1 = { enabled:boolean; assignment:'host'|'self'; scoring:'sum'|'average'|'topN'; topN?:number; includeDisconnected:boolean }.
TeamV1 = { id:string; name:string; members:string[]; colorToken?:string }.
TeamScoreV1 = { teamId:string; points:number; rank:number; memberCount:number }.
Team membership bound to stable player clientId, not socket.id. Server is authoritative; joining, leaving, changing teams and ties have deterministic policies. Original player leaderboard remains available.

## 5. Interludes and reveal

InterludeV1 = { id:string; afterQuestionId:string|null; type:'title'|'countdown'|'image'|'video'; payload:unknown; durationMs:number|null; advance:'manual'|'automatic'; audioCueId?:string }.
RevealEffectV1 = { type:'none'|'blur'|'tiles'|'pixelate'|'zoom'; durationMs:number; trigger:'auto'|'host'; options?:Record<string,unknown> }.
TimelineEventV1 = { id:string; gameId:string; epoch:number; type:'interlude'|'reveal'|'question'|'leaderboard'; payload:unknown; startedAt:number; durationMs?:number }.
All payloads MUST be discriminated, versioned Zod schemas before coding; unknown here intentionally marks pending per-type design. Late-joining clients receive current event snapshot and timing.

## 6. Audio

AudioCueV1 = { id:string; source:'upstream'|'uploaded'; media?:MediaRefV1; volume:number; enabled:boolean; loop:boolean }.
AudioThemeV1 = { id:string; cues:Record<string,AudioCueV1> }.
Client audio respects browser autoplay rules; no server playback assumption. Existing sound defaults unchanged.

## 7. Provider-neutral PSTN bridge

TelephonyProviderV1 = { id:string; verifyWebhook(request): Promise<VerifiedCallEventV1>; answerCall(callId,script):Promise<void>; hangup(callId):Promise<void>; health():Promise<ProviderHealthV1> }.
VerifiedCallEventV1 = { providerId:string; eventId:string; opaqueCallId:string; kind:'started'|'digit'|'ended'|'error'; digit?:string; providerTimestamp?:string; receivedAt:string }.
CallSessionV1 = { opaqueCallId:string; roomCode:string|null; participantClientId:string|null; state:'connecting'|'roomCode'|'joined'|'ended'; questionEpoch:number|null }.
BridgeAnswerV1 = { roomId:string; participantClientId:string; questionId:string; questionEpoch:number; answerIndex:number; idempotencyKey:string; receivedAt:string; providerTimestamp?:string }.
Digit mapping 1->answerIndex0 through 4->answerIndex3 for single-choice only; '*'/'#' reserved for menus/confirmation. Multi-choice/estimation must explicitly reject or offer a documented menu, never silently map incorrectly.
The bridge MUST use existing auth/join-ticket/Socket.IO flows where feasible, not forge socket IDs. Webhook verification, replay windows, per-call locks, rate limits, call termination cleanup, privacy retention and audit logs are required.
No verified Yemot realtime event delivery contract yet: implement an adapter only after a real signed/verified payload and UK call test. Provide simulated provider for contract tests.

## 8. Error, version and compatibility

Every contract has schemaVersion/apiVersion. Unknown major versions rejected with actionable errors; additive optional fields permitted. Existing quizzes and web-only sessions work with extensions disabled. All new UI keys exist in en/fr/de/es/it/ja/tr/vi.
