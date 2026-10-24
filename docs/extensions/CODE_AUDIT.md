# Code audit and dependency map (source-grounded)

Baseline: 5161eb7022144ee26d46a5f94cdbc714ec8b560d, branch feat/modular-extensions-planning, Razzia 4.0.1.
Inventory: SOURCE_INVENTORY.txt contains the TypeScript/TSX source/test file paths discovered in packages. This is a static code audit, not a claim of manual line-by-line runtime verification of every file.

## Package boundaries

- packages/common/src/constants.ts: fixed event/question/mode constants.
- packages/common/src/types/game/{index,status,socket}.ts: wire and domain types.
- packages/common/src/validators/{quizz,game,socket}.ts: Zod validation and legacy normalization.
- packages/socket/src/api/index.ts: Hono API route composition.
- packages/socket/src/api/routes/{quizz,games,media,auth,results}.ts: HTTP endpoints.
- packages/socket/src/services/config.ts: JSON quiz persistence and result storage.
- packages/socket/src/services/{auth,registry,io}.ts: JWT, active game registry, singleton IO.
- packages/socket/src/app.ts: Hono mount, Socket.IO auth, validation and handler registration.
- packages/socket/src/handlers/game.ts: player/manager event authorization and dispatch.
- packages/socket/src/services/game/{index,player-manager,round-manager,cooldown-timer}.ts: game lifecycle, connection/player identity, timed steps.
- packages/socket/src/services/scoring/{round,single,multi,estimation}.ts: point calculation and ranking.
- packages/web/src/features/questions/{index,single,multi,estimation}: static question component registry.
- packages/web/src/features/quizz/{contexts,components}: react-hook-form editor, answer input, media library.
- packages/web/src/features/game/{components,contexts,stores}: host/player presentation and socket stores.
- packages/web/src/i18n.ts: Vite glob of locales and i18next init.
- packages/e2e/tests: browser tests for editor, game, media, results, settings, reveal and branding.

## Verified architectural constraints

1. Quiz Zod schema in common/validators/quizz.ts:33-88 is fixed. Zod object parsing strips unknown keys by default. Both config.ts:getQuizz and updateQuizz use parsed result, so extension metadata inserted into quiz JSON is not retained automatically.
2. Question.answers is string[] (common/types/game/index.ts:65-84). Rich answers must preserve this for legacy and phone DTMF; represent image metadata separately.
3. Editor uses react-hook-form + zodResolver(quizzValidator), with QuizzFormValues {gameMode,subject,questions} (quizz-editor-context.tsx:27-81). Saving extension settings through existing form requires deliberate adapter.
4. Question registry is static object in web/features/questions/index.ts:31-40; do not assume dynamic registration.
5. Game statuses are a fixed const and status map (common/types/game/status.ts:8-82). Adding a new status cascades into server and host/player switch logic; minimize changes.
6. RoundManager has private steps array built in constructor (round-manager.ts:84-109), with hard-coded reveal and leaderboard and category-based skip. runStep:238-256 and newQuestion:269-340 drive synchronized timing.
7. Game's RoundManager instance is constructed in socket/services/game/index.ts. Game is instantiated in api/routes/games.ts; runtime registry is in-memory. Game persistence and multi-instance scale cannot be assumed.
8. Selected answers are authenticated Socket.IO events: handlers/game.ts:118-122; validators/socket.ts; RoundManager.selectAnswer:521-568. Identity maps to socket.id; duplicate submissions rejected. Points derive from server Date.now() or answer order, not client timestamps.
9. Socket.IO server in socket/app.ts:69-133 validates JWT from handshake and routes events through handler list. Never allow telephony to bypass authorization by writing directly to game internals.
10. HTTP quiz routes are manager-protected (api/routes/quizz.ts); media routes are manager-protected and enforce size/type constraints.
11. Existing game settings schema in common/validators/game.ts:27-37 includes generatedUsernames, answersOnly and autoAdvance only. Cadence needs versioned extension settings or approved schema hook.
12. i18n.ts imports ./locales/_/_.json eagerly; downstream namespaces need a registration entrypoint. Do not patch all upstream locale JSON files.
13. Existing media question field supports image/video/audio, but per-answer media is not present in domain or status payload.
14. The UI uses Rubik, Tailwind v4, Radix, Lucide, motion/react, use-sound. Sounds are currently imported at component level; global cue configuration needs a small adapter or explicit wrapper.

## Architectural hazards to address before implementation

- No durable shared state for live games across process restarts; avoid assuming horizontal scaling.
- Per-call Socket.IO connection for hundreds of PSTN callers needs load measurement and resource budget.
- Idempotency must be enforced in bridge before forwarding, with question epoch and session identifiers.
- Reconnect and identity require stable JWT clientId, distinct from volatile socket.id.
- Sidecar metadata must be atomically versioned and bound to stable question identity, not array index alone, or reordering/deletion will corrupt attachments.
- Existing results format lacks team breakdown and interlude history; use versioned extension result sidecar.
- Auth, error, and locale namespaces must not be bypassed by new UI.
- No approval has been given for upstream edits; all candidate hooks remain proposals.
