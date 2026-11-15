# Tada Phone Pilot — Sanitized Versioned Runtime

This directory contains the sanitized, version-controlled source code and unit tests for the Tada telephony gateway and audio cue logic.

## Files

- `tada-audio-logic.cjs`: Pure audio session management, DTMF cue sequencing (`000`–`005`), authoritative result precedence over question window closing, survey neutral handling, delayed verdict delivery, and active session tracking.
- `tada-audio-logic.test.cjs`: Comprehensive Node 22 test suite covering intro cues, silent polling, invalid keys, authoritative verdicts (`002` right, `003` wrong, `004` neutral), survey mode, delayed verdicts, concurrent sessions, and the window-close race condition.
- `tada-pilot-gateway.cjs`: Minimal HTTP audio callback server interfacing with Yemot and proxying events to the Razzia backend via `/api/games/pilot-phone`. Requires `TADA_PILOT_SECRET` environment variable.
- `tada-pilot-gateway.faults.test.cjs`: Deterministic gateway-handler fault tests with injected backend I/O and timers; no provider or real game server.

## Running Unit Tests

```bash
node --test --test-concurrency=1 extensions/src/telephony/pilot-runtime/tada-audio-logic.test.cjs extensions/src/telephony/pilot-runtime/tada-pilot-gateway.test.cjs extensions/src/telephony/pilot-runtime/tada-pilot-gateway.faults.test.cjs
```

## Callback lifecycle

Callbacks are ordered per call and per repeated phone identity. Confirmed backend game/roster bindings retire the previous local call on redial. Hangup stops pending callbacks from submitting new answers; disconnect cleanup waits for an in-flight join. Failed cleanup may be retried by a repeated hangup callback without reopening the call. Backend request deadlines cover both headers and response bodies, and their timers are always cleared.

Closed call IDs are rejected for ten minutes in memory. Call IDs must be unique per provider call; an immediate legitimate reuse is rejected too. Restarting the gateway clears this replay history. Initial redial ordering requires the provider to supply a consistent phone identity (common punctuation is ignored); national/international aliases are not a verified provider contract. Backend call binding, epoch validation and answer idempotency remain necessary.

The generic read may span questions, so a digit using the active read key still uses the fresh backend epoch. Consumed read keys cannot answer the next question. These tests do not establish when a physical key was pressed, physical DTMF delivery, actual server scoring, authenticated provider behavior or carrier capacity. Failed cleanup has no durable/background retry if the provider never repeats its callback.

## Security Note

No runtime secrets, `.env` files, DPAPI tokens, phone numbers, or account credentials are stored in this repository. All sensitive configuration is supplied at runtime via environment variables (`TADA_PILOT_SECRET`, `TADA_RAZZIA_API_URL`, etc.).
