# Full-show V3 implementation ? 18 November 2026

Owner authorization covers production deployment and private ChatGPT connection. This scoped implementation owns new MCP V3 contracts, projection, resource, SDK consumer and downstream renderer adapter. Frozen packages/** and OAuth cryptographic internals remain unchanged.

V3 uses a separate preview_show tool and ui://tadazz/full-show/v3.html resource. It selects only one current frame using the actual issuer-owned draft repository. It never forwards raw authoredShowJson, future card text, source keys, notes, OAuth credentials, roster or real player data to the iframe. Solutions appear only in a selected results frame. Every selection rechecks grant/owner and exact revision after asynchronous asset admission.

The UI reuses existing native Classic Stage/Razzia primitives and ScenePresenter. Exact resource bytes and physical renderer-source build ID are deployment prerequisites; native asset metadata alone grants no rights. Asset delivery callback is mandatory and must verify actual deployment assets, provenance and live issuer authority. Private/customer media is unavailable until qualified separately. No full-show acceptance claim is made before source/SDK/browser tests and final production verification.


## Qualified Windows milestone ? 2026-11-18

The working tree (uncommitted on initial e1482c4) now passes 18/18 actual OAuth issuer/repository and MCP SDK selection/projection/title-CAS tests and 16/16 real Chromium/Edge + WebKit AppBridge/browser cases. Both native theme families rendered all 28 authored chapters through existing native components; screenshots cover opening, question, voting lock/reveal, transition and closing. Title changes preserve cards, summary refresh uses the actual repository, and cancellation/context teardown and digest tamper fail closed. The opaque sandbox retains only allow-scripts; explicit SDK action buttons replaced blocked form submission.

Browser receipt: `full-show-v3-browser-1794978618074/receipt.json`. HTML SHA256: `7fe4264d1ce2e57997f4d6d6c5dd049f86800de6a55bf04c94d228b09e6fe6fa`; renderer build ID: `89d09feec599b08a137d71c72e3d8f0d7772d845fee818a35cc740c77e06c9f6`. Every physical source and all 77 public assets remained byte-identical throughout the run. Browser code received no actual OAuth token, native session, raw authored show, private note, or future question source. No external network was used: exact reviewed public bytes were intercepted locally under a strict CSP, without unsafe-eval.

Both scoped TypeScript checks pass. Prettier passes all owned files. Exact e1482c4 baseline files were byte-compared against Git before lint: 268 historical diagnostics became 50, with zero added diagnostics (`full-show-v3-lint-baseline.json`, `full-show-v3-lint-delta.json`). This is a scoped no-new-diagnostics result, not a claim that repository-wide lint is clean.

Remaining gates: final immutable Linux build and the same browser receipt against its exact artifact; private ChatGPT installation/host qualification; richer semantic edits/undo/reconnect; reviewed pictures/background/audio selection; genuine user-gesture audio playback; all-eight-locale browser qualification; polished control focus/appearance. Current V3 supports selected text questions with at most five choices, native opening/transition/closing scenes and title edits. It intentionally denies question media/answer images/estimation and leaves audio muted. No production or package-source mutation was performed by this engineering task.
