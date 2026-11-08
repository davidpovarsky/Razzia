# Seating and story reference integration — 8 November 2026

User explicitly requested faithful React implementations of the three supplied HTML references: Seating Plan Brand Colours, Story Mixer Clean, Story Reveal FAST. These files are visual/animation inputs; their sample data, demo controls, global keyboard handlers and independent clocks are not application instructions.

Scope before upstream edits:
- `packages/web/src/features/game/components/tadazz-show/TadazzScreens.tsx`, `TadazzLobbyScreen`: compose the native seating view with real roster, presence, dial number, PIN and QR. Preserve the generic lobby fallback.
- `packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx`, scene clock normalization / AudioCuePlayer props: synchronize the supplied story choreography with server time and pause state, and route its embedded soundtrack through the existing master audio owner.
- `packages/web/public/tadazz-show/story/`: extract only the supplied stage art, logo, emblem and audio. No sample pictures or contacts in live logic.
- Extension-only React/CSS/renderer modules: preserve reference geometry, book/curtains, particle and picture choreography; no iframe, raw HTML rendering, demo controls or second shortcut owner.
- `completeCreatingWorldsShow`: insert mixer and story after both round recaps. Mixer is 60 seconds; reveal is 5.6 seconds, followed by a 120-second storytelling clock that holds for host advancement at zero.

Validation to record after implementation: both rounds' real winners including resolved ties, live seating presence and account dial isolation; pause/resume/reconnect clock alignment; master audio pause/mute and no competing recap bed; native React DOM and reference screenshots at animation checkpoints; build/types and focused timeline/clock tests.

User-supplied stage visuals take precedence over older generic stage styling. Existing manager controls and keyboard help retain native Rubik/Radix/theme conventions. No production data or account changes are part of the visual port itself.

## Implementation and verification

The user's follow-up explicitly requires the changes in both isolated Tzila accounts. Prepared additive migrations retain every original question, media reference, roster entry, scene, audio setting and default, inserting only `story-assembly` and `story-live` after each round recap. Both sidecars advance from revision 8 / 36 steps to revision 9 / 40 steps, with 37 participants each. Existing live game instances are never rewritten.

The new stage labels and seating labels cover en/fr/de/es/it/ja/tr/vi. Stage JSX and scoped CSS preserve reference geometry and typography per the user's explicit request; existing toolbar, shortcuts dialog, confirmation flows, host roster and settings retain their existing Rubik/theme/Radix components.

Evidence in `work/reference-story-proof/`:
- Real manager and full-screen seating screenshots; supplied HTML screenshots for comparison.
- Five real phone-simulation votes populate five matching mixer pictures, in order.
- Full natural 60-second mixer checkpoints: opening, escape, mischief, vortex, return, final countdown; server automatically enters the reveal.
- Paused mixer remains frozen across browser reload and resumes from the same server elapsed snapshot.
- Book/reveal and live story screenshots; reveal soundtrack ends before the host's story clock.
- Master volume/mute use the existing audio owner, with live-clock synchronization to prevent rewinding on volume changes.

Validation: web app TypeScript, socket TypeScript, web production build and socket production bundle pass. Eight focused extension suites pass (79 tests), plus the shared host shortcut suite (5 tests). This includes both new round boundaries, existing question skip semantics, exact paused scene elapsed time, eight-locale key consistency, and restart/reconnect clock behavior. The seating presence regression checks the real `connected` class as well as the connection data, preventing a class-token formatting error from hiding the illumination.

Additional real-browser evidence:
- `round-two-verification.json`: five real second-round phone-simulation votes yield exactly the five displayed winner URLs. The first-round fixture was skipped in this run to independently exercise both new round boundaries; full first-round voting and natural 60-second playback were verified separately.
- The registered caller lights the correct table; 1 / 31 connected tables, with both representatives' real names retained.
- Mixer master gain is 0.186 at 30% master volume; soundtrack position and the stage clock differ by about 70 ms in the captured sample.
- Story clock renders 00:00 after advancing Playwright's client clock and remains on the manual story scene until Next; Next enters the original finale.
- `delayed-audio-verification.json`: delaying reveal MP3 delivery by 2.5 seconds still stops the previous bed immediately and leaves storytelling speech time silent. Playback re-synchronizes after actual media start and after autoplay unlock.
- Pause data and the frozen timer/canvas are committed in layout effects, before paint, instead of waiting for a subsequent animation frame.

Private deployment scripts and backups stay outside Git under `work/` and the restricted remote release directory. No credentials, contact books or test tokens are included in this handoff.

## Production release — completed

Released to `https://tadazz.com` with image `sha256:7301eca108e07472e2b7745afbc7f158938a16c13663b1ebe8b409a7b510f881`, tag `tadazz:reference-story-20261108-final`. Public bootstrap entry: `/assets/index-CBrdtRGL.js`, with `Cache-Control: no-store, no-cache, must-revalidate`.

Authenticated production API reads verified BOTH customer and test sidecars at revision 9, 40 timeline steps and 37 participants. Original question/base hashes and every existing sidecar field remain intact; only the four new scenes, their timeline entries and the revision changed. Account credentials, runtime environment, gateway image and DID routing are unchanged.

Release gates observed zero registry games and zero active calls on both providers. The stopped previous container is `tadazz-pre-reference-story-20261108`. Original sidecars, environment and inspection metadata are retained privately in `/home/ubuntu/tadazz-repair-20261108/reference-story-production/`; use these only after checking for subsequent user changes. Existing browser pages need a refresh; newly created games load the updated 40-step sequence.

Final candidate also passed the delayed-audio browser verification after accessibility labels were connected to localization. No physical telephone calls were initiated for this UI release.
