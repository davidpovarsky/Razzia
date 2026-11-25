# Acceptance and QA matrix

Baseline and upgrade:

- Clean upstream tracked diff before approved hooks; extension-disabled behavior indistinguishable from baseline.
- Original pnpm test/build/lint/format and Playwright suites pass, with exact counts and logs; update baseline after each upstream sync.
- git fetch upstream; rehearsal merge into disposable worktree; report conflicts and touched lines, never auto-resolve blindly.
  Quiz data:
- Old quiz opens/plays/saves with no extension metadata loss.
- Sidecar save/load/export/import/reorder/duplicate/delete and interrupted write recover safely; revision conflicts rejected.
- Image answer labels and alt text validated; original text answer indices remain stable.
  Gameplay:
- Leaderboard every N, selected, category end, manual, final; default identical to upstream; survey semantics unchanged.
- Team ties, reconnect, disconnect, player moves, no-members and scoring aggregate deterministic.
- Interludes and reveal synchronized for late joins and reconnect, no double advancement; auto/manual timers cancel cleanly.
- Audio default identical; custom cues respect mute, volume, missing media, autoplay restrictions and accessible fallbacks.
  Telephony:
- Yemot adapter contract verified against official documentation and real inbound test; until then mark BLOCKED.
- UK call accessibility, DTMF accuracy, first-answer semantics, room code, disconnect/reconnect, invalid keys, replayed events, duplicate webhooks, spoofed callbacks and rate limits.
- Latency/fairness tested on web vs PSTN; do not promise sub-second latency before measurement.
- Load scenarios 10/50/100/250 simultaneous calls (subject to provider capacity) with metrics and rollback thresholds.
  Security/privacy:
- No secrets in repository, logs or screenshots; caller IDs redacted; webhook auth and per-room authorization.
- Media upload file validation, authorization and storage lifecycle.
  UX/localization:
- Original Rubik/color/spacing/animations; actual browser screenshots reviewed, no claim based solely on static code.
- Eight languages have full new key parity; no Hebrew or tablet-specific implementation.
  Release gates:
- Roni independent evidence; Dana security approval; Tomer upstream mergeability; owner approves hooks, deployment and provider spend.
