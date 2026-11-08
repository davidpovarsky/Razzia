# Scene audio and presentation cleanup — 8 November 2026

User authorized removing the imported technical note under question 3, removing extra Z wings from round launches, repairing soundtrack playback across the show, and deploying both accounts.

## Upstream hook, recorded before editing

`packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx`, `audioPolicy` memo: pass the authoritative resolved `scene.kind` for question/voting/results as well as authored scene kinds into the existing extension policy. The extension's broad `question` phase spans question presentation, voting and results; the base round status can also lag an authored scene. Selecting music from the resolved visible scene prevents a stale phase/cue from replacing the current scene's bed. One argument change only, no wire or schema changes. Verify with audio-policy regression tests and an actual ten-question browser run with positive-volume advancing media.

Imported provenance notes remain in source quiz data but are hidden from audience rendering. Intentional authored notes remain visible. Only round-launch wing nodes and their animation are removed; finale decorations retain their shared styles.

The single presenter audio owner retains voting variation, results Cutie music, original top-pick bed, existing SFX, master mute/volume and timed story music. Async resume completions/timers are guarded against changing a later track.

Additional upstream hook recorded before editing: the existing opening/lobby exit effect in `TadazzShowView` also clears `openingMusicActive` when the authoritative scene leaves the lobby, even if the visual intro was already skipped. Otherwise the intro's 12-second priority can mask the round/question bed after a fast host start. Keep the natural intro duration unchanged while the lobby remains active. Verify an immediate skipped-intro start in the isolated real browser.

Full ten-question browser audit found that resolved `voting` scenes also contain the pre-timer question entrance. Additional hook recorded before editing: route that entrance through the `question` music policy until `votingOpen` becomes true, and include `votingOpen` in the memo dependencies. Voting variation begins at the real voting start, rather than masking the question presentation bed. Verify positive-volume question-bed samples for each question, then voting/results/top-pick playback.

## Deployment

Final frontend deployed atomically for both accounts at `/assets/index-Cqg_UlTa.js`; no restart/reload of Node, container or telephone gateway. Both tenant sidecars remain revision 10 and their base quiz/config file hashes are unchanged. Existing room, vote, roster and telephony state is preserved. Release image `tadazz:scene-audio-repair-20261108-final`, `sha256:9ebbb1d01a6322a297df48432d60ba03270a39e7735b454f41260b09c6635a13`. Running immutable container base remains `7301eca108e0…`, with this frontend hot-copied over it. Rollback index and deployment report are in `/home/ubuntu/tadazz-repair-20261108/scene-audio-repair-v2/`. The initial cleanup repair was deployed first at `index-KZOCxtA1.js`; the final version adds the independently verified pre-timer question bed.

26 focused tests (audio policy + full show) passed, then the updated audio policy's 9 tests passed again after connecting authoritative question/voting/results kinds. Web TypeScript and production build passed. Authenticated production reads verified all 10 configured audio files return actual audio bytes for each of the two tenants. Source import notes are hidden by audience renderer only; stored quiz data is unchanged.

## Browser evidence

Real browser against isolated Oracle candidate: all ten questions across two rounds passed positive-volume, advancing-time music checks for voting (original/Epic on configured questions), Cutie results and original top-pick bed. All ten question entrances have audible question-bed samples (33–39 samples each, 369 total). Both round launches have no extra wing nodes; question 3 result screenshot has no imported provenance note. Pause/resume verified on question 3. Lobby, round launches, recaps, both story mixer/reveal scenes and finale passed actual playback checks. Story reveal deliberately stops music after 5.6 seconds for spoken storytelling; this remains intentional. No browser errors.

Evidence: `work/all-scenes-audio-proof/verification.json`, `question-entrances.json`, `audio-samples.json`, `round-1.png`, `round-2.png`, `q3-results-clean.png`. Separate skipped-opening quick-start regression passed in `work/fast-start-audio-proof/verification.json`: intro cannot mask round or voting music. No changes to the existing reveal SFX or timer sound assets.

Conditional tie branch also passed in a separate real browser game: two distinct phone participants voted differently, producing a real tie; the tie screen played the configured boss-battle bed at positive volume/advancing time, with no browser errors. Evidence `work/tie-audio-proof/verification.json` and `tie-audible.png`. Redacted machine-readable summaries are retained under `docs/extensions/qa-evidence/tadazz-scene-audio-repair-20261108/`.

Test portability follow-up: the preserved voting-configuration regression now loads tracked `extensions/fixtures/audio/tzila-soundtrack.json`, containing only audio settings, rather than an untracked local `work/` quiz export. No roster, account or contact data is included. This test-only change requires no frontend deployment.
