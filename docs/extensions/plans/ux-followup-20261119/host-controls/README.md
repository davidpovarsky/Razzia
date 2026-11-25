# Host music, participant roster and presentation parity verification

Verified locally on 19 November 2026 using the actual web app, isolated socket server and synthetic rooms. Release integration and production deployment are handled by the root task. Exact source hashes, Git head and execution summary are in `verification.json`.

## Implemented behavior

The ordinary host previously selected a different renderer from Audience Display and Present from Host. It now retains the same theme stage across these modes. Entering presentation mode changes host chrome and viewport. The public lobby consumes the server's public directory; it no longer constructs a public table list from the manager's private participant roster. The public-directory reader permits only display names, table numbers, connected table numbers and the public dial number.

The old Follow show menu was a music control. It now has a visible Music label, an Automatic option and localized explanatory help. An explicit music choice plays the configured recording for the current screen even when automatic choreography would reserve that cue. New screens return to the automatic choice. Mute and volume remain intact; deliberately choosing music resumes a manually paused track. Missing recordings show a clear error and disable the failed option, while another track can be selected.

The participant dialog prioritizes the list: one compact summary, search, one filter, Add Participant and a collapsed Manage List panel. Import, templates, export and the phone invitation policy remain available. Lobby rows show participant identity, connection state and actions; game activity is shown when applicable. The list has its own scroll area and adapts to narrow screens and RTL. Loading failures are visible and retryable, late responses do not overwrite newer presence snapshots, and Add cannot reuse a previous edit identifier.

Three missing explicit extension package exports were repaired after real Vite browser testing exposed unresolved context, poll-ranking and stage-fit imports.

## Verification

- Final real-browser run: **2 passed**, 74.4 seconds; `playwright.json` and `browser.log`.
- Actual native audio time advances, pauses and resumes. Manual results music plays in the lobby without advancing the game. Missing-track feedback, disabled selection and recovery are exercised. The allowed custom-media fixture serves real local MP3 bytes; native playback is not mocked.
- Creating Worlds host, audience and fullscreen public directory text is identical. Fullscreen retains exactly one host WebSocket and the same audio elements and playback position. Ordinary shows do not expose private roster names as public directories.
- Real roster API add and edit: 38 synthetic participants become 39; the edited participant and acknowledged invitation policy survive reload. Search and connection filters are checked.
- Modal and list bounds pass at 1440x900, 768x1024, 390x844 and 320x640, including no horizontal overflow and a usable list scroll area. Hebrew RTL was visually reviewed. A clipped 320px filter label found in the first screenshot review was corrected, and both browser cases passed again.
- Public directory and soundtrack policy: **20 tests passed**, including the preserved tracked Goldy/Tzila soundtrack fixture. Frontend public projection: **2 tests passed**.
- TypeScript passed for `extensions/tsconfig.json` and the actual `packages/web/tsconfig.app.json` project. Scoped lint passed with zero warnings and errors; the final browser test and config were linted again after fixture refinements. A formatting-only blank line was added to the test config after the successful browser run.

## Canonical evidence

- `browser-proof.json`, `verification.json`, `playwright.json`
- `host-directory-controls.png`, `host-directory-fullscreen.png`, `audience-directory.png`
- `roster-1440x900.png`, `roster-768x1024.png`, `roster-390x844.png`, `roster-320x640.png`, `roster-320-hebrew.png`
- `audio-public-units.log`, `public-lobby-unit.log`, `product-lint.log`, `test-lint.log`

All participants, phone numbers and rooms used by this focused suite are synthetic. No production customer room was opened or changed. Both owned QA ports, 3260 and 3261, were closed after Playwright completed. Preliminary failed setup runs are retained under `work/host-followup-20261119/preliminary-browser-diagnostics`; they are not release evidence.

## Final manual screen identity hardening

After the two-case browser run above, a small explicit identity contract was added: the actual authored scene ID now scopes a manual music choice separately from the automatic cue identity. Automatic audio continuity remains unchanged. An expired manual choice is cleared, so returning through history cannot revive it.

The focused regression passed **1 out of 1**. It selects manual music, verifies that a rerender of the same screen retains the choice, advances to a different authored screen with the same game, question, epoch, phase, soundtrack slot and automatic audio group, and verifies a return to Automatic. The automatic audio identity remains exactly equal across both screens. Returning to the first screen does not revive the expired override. This isolated state-lifetime fixture uses autoPlay=false; the earlier browser evidence remains the proof of native audible playback.

Typed lint passed on all four changed files with zero warnings and errors. TypeScript passed for both extensions/tsconfig.json and packages/web/tsconfig.app.json. No full browser rerun was needed for this narrow hardening change. The earlier two-case browser result and its source hashes are retained explicitly as historical evidence; verification.json also records the refreshed final source hashes.

Final receipts: manual-scope-playwright.json, manual-scope-browser.log, manual-scope-checks.json, manual-scope-lint.log, manual-scope-extension-types.log, and manual-scope-web-types.log. Both owned QA ports, 3260 and 3261, were closed after the regression completed. Product files are frozen for the root task's source commit and release.
