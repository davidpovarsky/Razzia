# Inline card consumer contract — G1 draft

Source task 1220547840245944; base `470804357c7e65b3ebe1d60cc6850ab164d8147a`. This is the Site consumer boundary for review with the existing D/E owners, not a new engine, executable admission, ACL service or accepted full-show provider. Implementation plan and writer leases were read in full; the 16,461-byte plan matched SHA256 `69afca1c43779257e78a5988ffa672a307db745b36b597a4d8f7d745e159debe`.

## Source resolution

Tiles can send only `{kind:"published-demo",catalogueId}` or `{kind:"account-owned",quizId}`. Strict schemas reject caller account IDs, revisions, role, rights, asset URLs and extra keys. The trusted adapter resolves an immutable revision after authorization; source and requested identity/kind must match. Revision is opaque and bounded, never derived from a tile's title, generated timestamp, question count or arbitrary client counter. This structural binding is not itself authorization.

There is intentionally no default provider, registered renderer, mounted route, shared private cache or application integration in this checkpoint. All six catalogue entries are still illustrative, without reviewed licensed publication bindings. `QuizMeta` still has only id/subject. No card is promoted to a real published game.

The future authenticated adapter must reuse native session verification and account scoping, rejecting expired/revoked sessions, accounts-disabled mode and missing account scope before any read. Actual source anchors: `packages/socket/src/api/middleware.ts` (`readClaims`/`requireManager`), `services/auth.ts` (`verifyToken`), `services/account-scope.ts` (`withAccount`, `activeAccount`, `accountsEnabled`), `services/config.ts` (`getQuizzById`) and `services/config-scope.ts` (`resolveConfigFile`). The scope path helper falls back to the global tree when accounts are disabled or scope is absent; that fallback must never serve a private preview. Do not take an account ID from body/query as authentication.

The legacy quiz getter reads normalized quiz files without calling `initConfig`; initialization writes an example quiz and cannot be part of GET. A full immutable authored projection must also cover the real enhancements/theme/asset revisions under the existing storage/recovery authority. Hashing only the legacy quiz would not establish a full-show revision. The live-game/Registry-bound telephony authority is unsuitable for this consumer: preview must never create or depend on a room, PIN, manager game, player, phone, vote or score.

Public projection must come from an explicitly published/licensed immutable binding with approved assets and public visibility. It cannot reuse a private session, export a private quiz into the catalogue, or fall back across tenants. Account/private and public resolution and caching must remain separate. The new server route factory is not implemented before this actual trusted projection/admission seam is agreed; a mock route test would not demonstrate a mounted authenticated endpoint.

## Original engine and timeline authority

`GamePreviewProvider.open` lazily resolves source and returns either a truthful unavailable reason or a session from the original reviewed D/E provider. It does not mount or start media. The provider must perform compiled-pin, theme/asset-rights and revision validation before returning a session, and revalidate access when required during use. Candidate V2 data alone cannot grant admission. The current `preview-resolve.ts` returns unavailable, seek unavailable and no executable pin; `manifest.ts` has no accepted pins. This consumer does not change either.

`GamePreviewSession` delegates mount, snapshot/subscription, play/pause/replay/chapter/media commands and disposal. Its snapshot uses the existing `DemoClockSnapshot`; there is no alternate timer, timeline compiler, director, stage JSX or audio owner here. Mount is explicitly muted. Optional sound is not implemented. Provider cancellation must revoke original stage/audio ownership immediately, and disposal must resolve only after teardown. No arbitrary executable, media URL or raw authored/customer object enters a tile.

Chapters are immutable provider projections in complete authored order with authored key/phase/title, duration policy and seek policy. They are not generated from a question counter. Unknown/manual/infinite duration stays unknown; no imaginary total seconds. Current-card coverage is distinguishable from full-show coverage and cannot grant chapter seeking. An unavailable core plan cannot be promoted by the UI. Media time validation accepts only finite measured duration and real seekable ranges; actual media seek must still be performed and acknowledged by the original provider. This checkpoint does not implement `seeked` or deterministic full-show reconstruction.

## Consumer request and gesture ownership

One coordinator lease owns activation. It aborts the prior lease immediately, waits for disposal before admitting another stage, and fails closed on disposal failure. UI async requests have a separate cancellation generation so stale returned results cannot overwrite the current UI; this does not replace the engine's own transition/audio generation protection.

The pure hold machine arms at 450 ms for primary mouse/touch/pen input, cancels movement over 10 px, accepts explicit cancellation and ignores nested/secondary actions. Ordinary click remains unsuppressed; one recognized-hold click is consumed. A new real pointer gesture clears an unused suppression token. Release leaves activation open; disposal clears its timer. Its only timer is for recognizing a gesture, not playing a show. Actual DOM event subscriptions, pointer capture for scrubbing, canonical buttons, keyboard focus/Escape, route cleanup, tilt suspension, scoped CSS and layout stability remain later UI integration work; unit cancellation inputs are not browser/device evidence.

Dedicated eight-language resources live under this feature without touching accepted Site translations. Registration is deferred; importing resources alone does not mutate the application's i18next state. The test uses an isolated real i18next instance with fallback disabled. It proves key/interpolation availability, not native-language editorial review or browser layout acceptance.

## Remaining decisions and gates

- Existing SB-07/D/E owners: provide the genuine accepted source/admission/full-show timeline/playback port, capability matrix, paused reconstruction and seek completion semantics. This task consumes it rather than compiling/reimplementing it.
- Manager composition: actual authenticated read-only projection/root binding and published-demo provenance. No endpoint is mounted here.
- Legacy TDS guard already fails on 12 inherited protected hashes; exact current bytes equal the supplied base for all 12. No protected source or guard was edited. Question `1220548013179058` records this baseline discrepancy; task-only lease checks do not relabel the historical guard PASS. UI/style implementation is held under the plan's guard stop rule while independent contracts/logic tests continue.
- G2, integrated G3/G4, real G5 browser/stage parity/tenant isolation/side effects/performance/editor acceptance, physical iPad and G6 review/release are not complete. Nothing is published, merged or deployed by this task.
