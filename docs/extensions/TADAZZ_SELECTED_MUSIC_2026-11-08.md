# Approved soundtrack choices — 8 November 2026

- **Cutie Patootie**, Eric Matyas: results/percentage reveal background music in both Tzila and our isolated test game. Source: https://soundimage.org/wp-content/uploads/2025/07/Cutie-Patootie.mp3
- The existing results bed stays intact and plays in the following selected-answer spotlight (`top-pick`). The existing reveal sound effect remains unchanged.
- **Epic Main Menu Theme ~ Loop**, Cleyton Kauffman: voting timer on questions 2, 4, 7 and 9; other questions retain their existing voting music. Source: https://opengameart.org/content/epic-main-menu-theme-loop . CC0: https://creativecommons.org/publicdomain/zero/1.0/ . WAV transcoded to MP3 for delivery, no musical edits.
- **Balloons Forever**, Eric Matyas: saved, **inactive**. Candidate for future voting-timer variety on selected questions; never assigned to results reveal. Source: https://soundimage.org/wp-content/uploads/2026/05/Balloons-Forever.ogg

Soundimage tracks use the Soundimage International Public License, https://soundimage.org/sample-page/ . Required attribution: https://soundimage.org/attribution-info/ . Original recordings retained without edits; synchronized with the game. At the user's request, credits appear **only at the end of the game**, never during questions, timers or results. The end credit links to the complete source/license notice. Balloons Forever requires the same in-game credit before future activation.

Implementation uses existing results soundtrack and per-question `audioCues.answersMusic` configuration. An authored scene music override takes precedence over the global bed in AudioCuePlayer, while voting, timed story audio, pause/mute/master volume and reveal-effect ownership remain unchanged. No upstream hooks required.

## Asset integrity

- Cutie Patootie MP3 (32.306s): SHA256 `1c3cafcf431726d25105ed8346271a9e69e35bdb09d40e418c55d46b6272f80c`.
- Balloons Forever OGG (49.172s): SHA256 `63c963f6f90fe9aec17061089271038833dc161f9e08a3f40109eeb58f552b5a`.
- Epic Main Menu delivery MP3: SHA256 `36377deb75d643232d583e509126919ec8feeeb14a16dee734b1a9cbc778adf36`.

All three are served locally; gameplay does not request third-party audio servers.

## Release and verification

Deployed to both production tenant sidecars at revision 10. Native authenticated API reads verified both tenants still have 40 timeline steps and 37 participants. Live Node process, container start time and telephone gateway were unchanged; existing games/calls were not restarted. Existing open games retain their loaded settings; refresh and start a new game for the new soundtrack configuration.

- Release image: `tadazz:selected-music-20261108-final`, `sha256:d614dceb35f4ffd8f4ae4fa74c45ead84082d129d166f1013e2a52f27d08ff9f`.
- Live frontend entry: `/assets/index-DzacuN5V.js`. Hot-copied atomically over the running reference-story container; the running container's immutable base image remains `7301eca108e0…`.
- Web TypeScript check and production build passed; 7 focused audio-policy tests passed.
- Real isolated QA browser: question 1 original timer music; question 2 Epic timer music; both Cutie results → original spotlight; reveal SFX preserved; Balloons never played; no mid-game credits; no browser errors.
- Local browser evidence: `work/selected-music-proof/verification.json`, `q1-results.png`, `q2-results.png`. Restricted server backup and machine-readable deployment result: `/home/ubuntu/tadazz-repair-20261108/selected-music-release/`.
