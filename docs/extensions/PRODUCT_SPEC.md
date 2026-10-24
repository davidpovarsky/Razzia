# Product specification — UK-first Razzia extensions

## Goal

Build a polished live multiplayer quiz experience preserving Razzia 4.0.1, with optional teams, rich image answers, image-reveal effects, interludes, customizable audio, flexible leaderboards and PSTN DTMF participation.
Audience: primarily UK, including basic/kosher phones. A UK number and UK carrier accessibility are future production requirements. Initial telephony pilot provider: Yemot HaMashiach; this is a provisional choice, not proof of live-DTMF capability.

## In scope

1. Leaderboard timing: every N questions, on selected questions, after a category/round, manual override; retain current default.
2. Teams: independent players grouped into teams, configurable scoring aggregation and team leaderboard; future optional captain/consensus mode requires separate approval.
3. Image answers: text, image or both; upload/library selection; accessible labels; backwards-compatible question schema.
4. Image questions and reveal: existing media plus pixelation, tile reveal, zoom-out, blur; timing, manual/auto control and synchronized host view.
5. Interludes: title cards, countdowns, image/video, transitions and optional sound between questions; presenter controls and reliable reconnect state.
6. Audio: replaceable sound cues, per-cue preview, volume/mute, theme presets, safe media validation.
7. Telephony: provider-neutral bridge with room code, participant identity, DTMF 1-4, first-answer semantics, reconnect, latency logging, idempotency, session security and load testing. No provider-specific logic inside Razzia.
8. Editor: clear integrated UI for all features, preview and validation; preserve original layout/design.

## Explicitly out of scope now

- Hebrew/RTL localization.
- Tablet-specific UI work.
- Deploying paid UK telephone numbers or production carrier onboarding.
- Changes to original Razzia branding or general redesign.

## Open decisions (must not guess)

- Yemot UK DTMF webhook delivery, simultaneous call capacity, pricing and commercial terms.
- Caller anonymity/privacy retention and phone-number storage.
- Fair scoring for PSTN vs web; event timestamps and anti-cheat policy.
- Team scoring mode, voting behavior and handling disconnections.
- Actual E2E browser validation and 100+ concurrent call stress tests.
