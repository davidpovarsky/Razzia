# Complete music and milestone-SFX verification — 8 November 2026

User reported Q2 timer silence, missing percentage reveal effect and no isolated winning-picture effect; requires end-to-end verification, not only desired audio selection.

Baseline: three natural-timer questions in Edge, normal autoplay policy, all timer/results beds and percentage reveal clips played. Top-pick has no explicit audible cue: its visual `impact` is intentionally unmapped. Existing single decorative/reveal element can also be interrupted after its short protection window while a file is still loading. Epic is only loaded on entry to its first question.

## Upstream hook recorded before editing

`packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx`, `handleStageCue`: accept optional painted question metadata; allow a delayed same-question percentage cue while the authoritative timeline has already moved to top-pick, reject a different question or a current voting/restart scene, and assign a separate top-pick milestone identity. Preserve one reveal per question attempt. Test natural and rapid-end first three questions, then every question across both rounds with actual SFX playback assertions.

Extension scope: tag native cues with their originating painted question; add explicit winning-picture confirmation at its entrance; reserve separate preloaded audio elements for reveal and spotlight milestones so decorative transitions cannot replace them; prebuffer the approved Epic timer and retain the original timer as network-error fallback. Preserve peer paused-refresh changes in shared stage files. No backend/gateway restart or user-room controls authorized or needed for this frontend repair.

## User-supplied timer-end sound

The user subsequently supplied `Time-Running-Out-and-Buzzer-END-CLEAN.mp3` and explicitly required playback at the actual timer end, including manual termination. The 2.53-second, 25,974-byte file is copied unchanged to `packages/web/public/sounds/tadazz-timer-end-368edc1d9522.mp3`, SHA256 `368edc1d95220e8255c853850f02b447a128c06b59e1a8756fb02b6b9f4ab8e4`.

Additional ShowView hook: `timerEndTransition` tracks the live voting attempt and dispatches `timer-ended` once when the same question enters the authoritative server `responses` phase. It does not depend on animation completion or the browser countdown reaching zero. Manual and natural ends take the same path; a skipped question or refresh into results does not replay a buzzer. A real restart rearms it with the new epoch. The clip has its own preloaded channel and keeps mute/pause/master-volume behavior, while the percentage and winning-picture effects remain separate.

## Verification of the final candidate

Edge with its normal autoplay policy, a real isolated QA backend and one simulated phone participant completed all ten questions across both rounds. Five timers expired naturally and five ended through the host's End Timer button. Every question had advancing, positive-volume timer music, Cutie results music and the original winning-picture bed. All thirty critical effects (ten supplied timer endings, ten percentage reveals, ten winning-picture confirmations) dispatched, started and completed exactly once. Both recap/story boundaries and the finale had their expected music. Story-reveal speech silence after its authored 5.6-second audio remains intentional; this run skipped the long story holds after checking playback.

Redacted evidence: `qa-evidence/tadazz-scene-audio-repair-20261108/final-timer-end-10.json`. A separate earlier ten-question natural-timer run verified the reveal/spotlight repair before the user supplied the new ending recording: `natural-all-effects-10.json`.

Six focused unit files passed (25 tests); web TypeScript passed, and the production web build completed. The reproducible browser regression is `extensions/qa/tadazz-audio-flow.cjs`: set `AUDIO_QA_URL` to an isolated loopback QA endpoint and `AUDIO_QA_PHONE_SECRET`, then `AUDIO_STRICT=1 AUDIO_MIXED_END=1`. It rejects non-loopback endpoints. `AUDIO_FAULT_EPIC=1 AUDIO_RAPID=1 AUDIO_QUESTIONS=2` exercises original-timer fallback when the optional Epic recording fails.

The built frontend includes the collaborating QA session's pending paused-scene restoration, late question-option patch and localized streak display. Those shared source hunks are preserved and excluded from this audio commit. No pending backend or gateway changes are built or released here. Three class-name arrays preserve significant CSS spaces that a formatter had stripped in the shared stage components.

## Release safeguards

The ten-question mixed-end run used `/assets/index-Nb2L0Mft.js`, image `sha256:aa05b0d9c8baf85c7607baf3a66c3f03c7a460e46caef0fa80515a8da44dde01`.

The subsequent network-failure regression exposed an error-handler generation check that discarded an optional-track failure after a same-track state update. Its guard now checks active element plus track identity and reads current pause controls. After that fix, a two-question rapid-manual-end run with Epic forcibly aborted passed: the original timer played on Q2, and all six critical effects started/completed once. Evidence: `final-epic-fallback.json`. Final QA frontend `/assets/index-ovlfIJup.js`, image `sha256:fc2f60062f8326ad6b589085ef5c27b321978b3c3afdb5754d2ae7e74242253c`; 22 focused audio unit tests and web TypeScript/build passed again after this fix.

Release tag: `tadazz:complete-audio-e2e-20261108-final`, image `sha256:24897f170125b4fe60907484d4ed4446c901f152a20f6d4aee7ef135daeaf321`.

The deployment script first copies hashed JS/CSS and the new hashed sound, then atomically replaces the no-store HTML bootstrap. It checks the previous frontend version, verifies the sound's exact SHA256 over HTTP, health, unchanged main container start time/Node PID, unchanged gateway start time and unchanged sidecar/base hashes for both tenants. It never connects a production host, alters a DID or controls the user's active room. Deployment execution evidence is appended after the guarded operation succeeds.

Deployment succeeded. A preflight initially stopped before mutation because the collaborating QA session had already deployed its newer backend `3421959df72b…` and gateway `79aae5ceea06…`, including the earlier Nb2 frontend. After identifying that release, the guarded frontend update preserved both running services. The restartable final image is built on backend `3421959df72b…`, retaining its fixes. Main runtime image remains `3421959df72b…` with hot-copied frontend; container/Node/gateway identities and both tenant/base hashes were verified unchanged across this audio deployment. Public HTTPS verification confirmed the new bootstrap is no-store, references `index-ovlfIJup.js`, and serves the supplied MP3 as `audio/mpeg` with exactly the original hash/25,974 bytes. Evidence: `public-timer-end-release.json`. Both owners receive the shared frontend; no user game or real phone was manipulated by this audio session.
