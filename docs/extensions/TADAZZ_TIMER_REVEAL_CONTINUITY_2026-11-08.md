# Timer / results music continuity — current user correction, 8 November 2026

This supersedes the pre-timer music split documented in the earlier scene-audio repair. The user explicitly rejected that added transition: **play the configured timer music from question entrance, including the card-reveal animation**. Do not reintroduce a separate question bed before `votingOpen`.

The ShowView policy hook is restored to `descriptor?.kind ?? scene.kind`; `votingOpen` is not used to delay timer music. The previous note cleanup, round-wing removal, scene ownership and intro-exit fixes remain.

## Results fix

Before this repair the inactive background element acquired Cutie only when the result scene began. A natural first-question Edge run (no autoplay override) observed loading/playing delay at that boundary, followed by only the short results hold. The original recording also played at a low 0.3 element gain.

AudioCuePlayer now buffers the configured results track in its existing inactive audio element during voting, once room media access is ready. It never plays that inactive element. At reveal it reuses the same buffered element instead of replacing its source and triggering another request. Preloading respects the results media/mute setting and does not replace the active timer track. Cancelled crossfade handles are cleared before selecting a preload target.

The approved Cutie recording alone has a 2.5 source gain calibration (configured 0.3 -> actual 0.75, capped at 1). Master volume, mute, pause and reveal ducking still apply. Other music and SFX gains are unchanged. The actual recording and all tenant settings remain unchanged; no extra license adaptation is introduced. Original music still follows the result scene on top-pick.

## Verification and release

- Ten focused audio tests passed; web TypeScript and production build passed.
- Real Edge browser with normal autoplay policy: one real phone vote, full natural first-question timer, no manual result-screen advance. A forced 4-second music response delay verified preload starts 23.823 seconds before reveal; Cutie began advancing 124ms after the result selection and reached 0.75 gain. Timer music played from the initial card entrance. Results then transitioned to the original top-pick bed. No browser errors.
- Redacted evidence: `docs/extensions/qa-evidence/tadazz-scene-audio-repair-20261108/natural-reveal.json`; detailed local samples: `work/natural-reveal-proof/samples.json`.
- A read-only spectator and UI inspection observed the user's actual production game/config without creating a host or changing its state. Its paused top-pick screen was left intact. No user game was advanced, restarted or unpaused.
- Production frontend: `/assets/index-BfBef6_q.js`, verified through public HTTPS after atomic deployment to both accounts.
- Release image: `tadazz:timer-reveal-continuity-20261108-final`, `sha256:bc085e16a5299a5df16db030922c17ec8cbb5904ddf1b4f205cdb077f44b58dd`.
- Node process/container/gateway start times and both tenant/base file hashes unchanged. Both sidecars remain revision 10. No backend/gateway/peer source was built or deployed.
- Restricted rollback index and release report: `/home/ubuntu/tadazz-repair-20261108/timer-reveal-continuity/`.

Refresh the existing host page and replay question 1 to load this bundle; no new game or phone reconnection is required.
