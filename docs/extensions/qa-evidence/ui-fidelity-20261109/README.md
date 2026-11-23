# Native Razzia layout and fixed TADAZZ branding — 9 November 2026

> Follow-up, 9 November 2026: all twelve retained failures below are now resolved. See [native controls and complete regression evidence](../native-controls-20261109/README.md) for classification, the real invalid-save focus repair, 21/21 legacy and 22/22 UI browser cases. The results and public deployment described below remain historical; this follow-up did not replace that running lab.

Runtime source: `4d8fa98065e7a05bcf2d98fb356dad9c4d249ba7`. Isolated branch `codex/upstream-cleanup-theme-engine-20261108`. The final documentation commit does not change this runtime. All game/browser/type/build verification ran on Oracle, with no Windows game or browser launch.

Staging: https://theme-lab-v2.132.145.25.168.sslip.io/manager . Eight persisted three-question examples: quiz and survey for Classic, Razzia Original, Cosmic Night v2 and Jade Studio v2. Credentials stay outside Git. Original production and the previously handed-over lab were neither replaced nor restarted; their container identity/image/start time match before and after. Only the new loopback 3289 staging container was recreated for the persistence proof.

## Changes requested by the user

1. Product identity: the real colored TADAZZ! bitmap is a compiled product constant. Both brand resolution paths ignore alternate manifest logo assets. Every game layout and opening uses it. Cosmic/Jade v2 media has no baked replacement wordmark; historical v1 theme definitions remain resolvable for existing saved selections.
2. Original family: Razzia Original is a trusted code-backed family using the real native game states, QUESTION_REGISTRY answer components, Rubik, answer colors, sound assets and byte-exact original background. It is not a decorative approximation of the cinematic stage. Downstream media, scenes, teams, roster and audio remain available.
3. Platform controls: top toolbar, bottom audio/status/room controls use common Button/Select and native spacing/type. Themes skin the game surface and projection; no theme font or skin is applied to the editor or operator controls.
4. Responsive layout: normal host and player views use fluid native content at viewport width. Only cinematic audience/explicit host projection uses the fixed 16:9 stage. Razzia Original continues to use native components even in projection. Native touch panning is restored while that layout is mounted. Fullscreen has a stable viewport target, cancels late enter requests after Escape, and keeps room-local mute/volume/pause preferences.
5. Source parity: actual original components were compared with `5161eb7`. Button and source background are unchanged. Single/multi/numeric answer contracts and the original five-choice limit are preserved. The Studio Add card path now inherits the previous question category as original addQuestion does; current per-card quiz/survey and composite saving remain intact.

## Actual checks

- 365 root + 622 extension unit tests: 987 passed. Five TypeScript projects and production build passed.
- Current interface suite: 20 passed, 0 failed/skipped/flaky, across Chromium and WebKit mobile/iPad viewport emulation. All four families, portrait/landscape, real answer images, fifth-choice scoring, single/multi/numeric types, pause, roster, timeline scenes, editor theme isolation, public read-only QR and projection/audio lifecycle are covered.
- Native editor regression: one passed with original all-question-type/field/save assertions, adapting only the current Add card and numeric-label selectors. It exposed and then verified the category inheritance repair. Web/e2e type checks and build passed again for that repair.
- Public HTTPS runtime: all eight saved examples exercised through actual host + iPad-emulated player + public display, vote and results. Independent browser proof confirms host lobby/voting reload, player reload/rejoin, no duplicate player and successful scoring.
- Real container replacement retained all eight saved IDs using the host volume mounted at `/app/config`. Public browser rechecked eight rows, four selectable families, Rubik and editor isolation after replacement. 994 source inputs were hash verified for the final canonical Dockerfile build.

## Limits and retained failures

The untouched legacy editor/manager/flow suite yielded **8 passed, 12 failed**. Its original report is retained. Failures include historical Add question/A-B answer selectors, global survey assumptions, immediate import without the added preview, and old host controls/reconnect expectations. This patch does not claim the entire historical suite is green or establish exhaustive upstream behavior parity. The current reload path and all-question-types save were explicitly retested through the new UI; the real category gap found during this comparison was fixed. Remaining historical tests need migration and any remaining behavior differences need separate review.

WebKit uses browser/mobile emulation, not a physical iPad. Chromium verified actual fullscreen entry/exit and fast cancellation; WebKit verified denial recovery. Whole-repository lint has an existing baseline and is not claimed green. Browser traces, authentication state, JWTs, environment files and staging passwords are excluded from this evidence.

Early remote launcher attempts without compiled preview assets and initial public harness assumptions were corrected; final results above are from the completed runs, not those failed attempts. See summary.json and the compressed reports for actual counts.
