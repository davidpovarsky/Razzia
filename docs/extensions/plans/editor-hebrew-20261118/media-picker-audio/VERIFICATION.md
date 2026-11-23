# Editor audio preview ownership — verified follow-up

## Result

The shared MediaLibrary hook, legacy CardAudioConfig and ThemeAudioOptions now retain exact audio-instance ownership. Replacing or stopping a preview relinquishes the old reference before pause/reset, detaches onended/onerror, and ignores queued callbacks or late play-promise completion from the old instance. Current errors release the current owner and remain recoverable. Legacy card/source changes also reset the visible playing-slot indicator. Theme generation checks remain intact alongside the exact-instance guard.

Only these three editor production files changed. The live AudioCuePlayer, ThemeInstallationPreview, dictionaries, schemas, media backend and catalog behavior are unchanged. This is a separate follow-up after isolated host-roster commit 8b89326870f85b8e47ebe2624eb428a074aee5bb. Narrow Asana regression: 1220673878134459.

## Executed before/after proof

| Surface                | Actual before-fix failure                                                                                                                              | Final result                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Shared MediaLibrary    | After switching cues, queued old ended/error/rejected-play callbacks cleared the newer active icon; two prerequisite checks passed before the failure. | 11 lifecycle checks pass.                                                     |
| Legacy CardAudioConfig | Old callbacks cleared the newer slot; moving to the other actual editor question left the old Stop indicator visible after audio cleanup.              | Five owner/error/stop/unmount checks plus two card/source-change checks pass. |
| ThemeAudioOptions      | After changing the actual controlled media source and starting the new preview, a queued prior-source onended removed the new Stop button.             | Seven source/owner/completion/rejection/unmount checks pass.                  |

The final 25 checks have zero page errors. Real React, QuizzEditorProvider, StudioEditorProvider, TanStack Query, i18n, actual native controls and application styles are mounted through the isolated Vite app. The Audio implementation is controlled to schedule otherwise timing-sensitive stale callbacks deterministically; the empty media HTTP response is intercepted. These receipts establish lifecycle/UI behavior, not audible playback, media decoding, a live multiplayer game or physical-device acceptance.

Evidence: before.json, configs-before.json, after.json, configs-after.json, the executable fixture/browser scripts and screenshots in this directory. Receipts record original and final production-source SHA-256. The shared picker before/after active icon and legacy card/source screenshots were visually inspected. Assertions cover no mount autoplay, switch/rewind, same-cue stop, detaching handlers, current ended/error/rejected play, actual dialog close, card/source change, unmount and late completion after unmount.

The legacy fixture initially selected the default modern theme and raced the provider's initial extras creation. Those setup receipts are retained separately; the final baseline waits for the real provider initialization and selects the valid legacy defaults. A first post-fix unmount assertion ran before React committed the state update; the final harness waits for the actual component to disappear before checking cleanup. The old-ownership/card-change failures happen before that later harness assertion and remain unchanged. No product assertion was removed.

## Final static gate

At 2026-11-18T15:54:55.0880612Z, actual web tsconfig.app.json no-emit check, strict typed Oxlint with denied warnings, repository Prettier write/check and both final browser drivers all exit 0 (gates.json). The initial formatter invocation named an uninstalled tool and the first lint run found one missing blank line; those records are retained separately. The installed repository Prettier gate was then run successfully. No type/lint guard was weakened.

## Reproduce

In an isolated checkout, copy fixture.tsx and fixture.html to packages/web/media-picker-audio-proof.tsx and packages/web/media-picker-audio-proof.html. Start the installed Vite from packages/web with --host 127.0.0.1 --port 3186 --strictPort, using Node 24. Run browser.mjs after and browser-configs.mjs after from this directory with the repository Playwright package and installed Microsoft Edge. The temporary web entry files are QA-only and are not part of the product bundle. The before source is available at the parent isolated commit; preserve the same final valid fixture and assertions when reproducing.

Integration and deployment remain the coordinator's separate release boundary.
