# Navigation timer, public participation and story music

User approved: restore the circular timer after Previous/Next; reuse recap music during story reading, preserving the mixer track; show a permanent connected-participant count on host and projector plus answered count during voting.

Upstream hooks recorded before editing:
- `packages/web/src/features/game/components/tadazz-show/TadazzShowView.tsx`: render a noninteractive aggregate footer for host/spectator; select configured recap music during story reading instead of its short ident; preserve mixer timing.
- `packages/socket/src/services/game/index.ts`, extension-session delegate: project connected participant count and connected respondents from existing `round.hasPlayerAnswered`; expose only numeric aggregates in extension snapshots, never roster contacts.

Extension changes: distinguish a timed clock at zero from an unlimited vote; ensure a late picture-options repaint cannot leave the adapter believing its timer is still painted; share the lobby count typography/surface for the footer; localize all new text in eight existing locales.

Preserve the other QA chat's uncommitted formatting and fixes. Test with isolated host/projector and simulated phone participants. No gateway changes. Frontend may be hot-copied; the new public aggregate needs a backend release, which must not reset an active user room.

## Result and verification

Timed voting previously selected `voting-open` whenever the remaining time reached zero, and a same-question options repaint could remove the clock while adapter mode remained `voting`. Timed/unlimited presentation now depends on the authored duration; zero stays a circular zero. The adapter tracks which voting scene is actually painted and restores it after a repaint instead of patching a nonexistent ring. A replay status missing `time` can recover its duration from authoritative start/end timestamps or remaining time; explicit unlimited voting stays unlimited.

The story-reading scene now uses the configured recap slot for its whole duration. It no longer selects the short 5.6-second reference ident; the separate 60-second story mixer retains its existing track and clock. Existing results, timer tracks and ending/reveal effects are preserved.

The public footer uses the existing `tz-x-pill` surface, inherited app typography and Lucide Users icon. It is visible for host, host presentation and spectator in all stages, with live numeric connected counts. During voting it also shows connected respondents / currently connected participants. A disconnected participant's answer no longer inflates that denominator; reconnecting restores the accepted answer without a duplicate vote. The server emits only `{connected, answered}` as an additive optional public snapshot field. No private roster payload is passed to the footer. All eight existing UI locales include the labels.

62 focused extension tests passed, including clock restoration, explicit unlimited votes, public aggregate projection, existing presentation transitions, music/timer-end policies and locale parity. Both web/socket TypeScript checks and production builds passed.

Real Edge host and an independent public projector context passed six questions through the first story boundary into round two, then restored question 6. Four Previous/Next cycles retained an actually running WAAPI circular sweep in both screens. Two simulated participants exercised live answers, duplicate rejection, disconnect/rejoin and count reset on replay. Recap and story reading both played the configured orchestral music, including after the old short-ident cutoff; mixer music remained unchanged. Eight UI languages and a 1000×700 host viewport passed. No page errors. Browser harness: `extensions/qa/tadazz-navigation-participation.cjs` (requires isolated loopback `NAV_QA_URL` and `NAV_QA_PHONE_SECRET`).

Screenshots and redacted evidence are in `qa-evidence/tadazz-navigation-participation-20261108/`: restored Q6 host/projector, voting counters, narrow host and story-reading screen. Visual inspection confirmed no overlap with timer/cards/story clock, matching the existing pill/color/type conventions.

## Production release

Both provider accounts returned zero real incoming calls immediately before deployment. No customer account room was active; one empty original test-account room had zero connected participants. The small backend update required replacing the game server and that empty test room. Gateway, credentials, DID mappings and all four tenant sidecar/base hashes were preserved. No real calls were made or terminated. The prior server container remains available for rollback.

Live image `sha256:f388db2965a467295cc2587a8660c0d02b7b54c4ab02f5c688677fadf665cdb9`, tag `tadazz:navigation-participation-20261108-final`, frontend `/assets/index-C1pz3ct5.js`. Public HTTPS bootstrap/JS/health verification passed with no-store HTML. Shared code applies to both accounts; no quiz/assets/roster copies were modified. Reopen the empty test game after refreshing. Peer uncommitted changes remain separate from the selective navigation commit.
