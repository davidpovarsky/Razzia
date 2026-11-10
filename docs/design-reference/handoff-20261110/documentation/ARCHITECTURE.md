# Extension architecture and integration boundaries

## Existing upstream

packages/common: question schema, statuses, socket types.
packages/socket: game state, RoundManager, player manager, scoring, Socket.IO.
packages/web: React/Vite, i18next, manager/editor/player UI, static question registry.
Do not claim these registries are pluggable today. A small, reviewed hook may be required.

## Downstream target

extensions/core: versioned contracts, registration and feature flags.
extensions/leaderboard: timing policy and presenter controls.
extensions/teams: team identity, aggregation, leaderboard.
extensions/image-answers: media-answer schema, editor, player and presenter renderers.
extensions/image-reveal: effects registry and synchronized effect state.
extensions/interludes: typed timeline events, host controls, lifecycle/reconnect.
extensions/audio: audio cue registry, preview, volumes and uploads.
extensions/telephony: standalone bridge + provider adapters (yemot initially; telnyx/twilio later).
extensions/editor: additive panels and preview composition.
extensions/locales: feature namespace bundles for all eight existing locales.
extensions/design-system: only shared downstream primitives not available upstream.
extensions/tests: integration, compatibility, E2E and load fixtures.

## Boundary rules

- Game owns canonical room/question lifecycle, player state and scoring; adapters only emit validated domain commands.
- Bridge maps call/session to opaque participant identity, never exposes vendor payload to game core.
- Provider interface: answer digit event, connect/disconnect, call status, health, timing metadata. All inbound callbacks authenticated and replay-safe.
- Persist only necessary identifiers; configurable retention; never log raw caller numbers by default.
- UI extensions use original design tokens/components. No parallel UI framework.
- Store extension-specific quiz settings in versioned metadata or additive schemas with migrations and backward compatibility.
- Prefer wrapper/composition/DI to upstream edits. List every unavoidable hook before implementation and keep it reviewable.

## Contract examples (design intent, not implemented APIs)

TelephonyEvent: { provider, opaqueCallId, roomCode, participantId, digit, receivedAt, eventId }
AnswerCommand: { roomId, participantId, questionId, answerIndex, idempotencyKey, receivedAt }
Do not assume Razzia currently exports these contracts.
