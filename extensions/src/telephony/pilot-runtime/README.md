# Tada Phone Pilot — Sanitized Versioned Runtime

This directory contains the sanitized, version-controlled source code and unit tests for the Tada telephony gateway and audio cue logic.

## Files
- `tada-audio-logic.cjs`: Pure audio session management, DTMF cue sequencing (`000`–`005`), authoritative result precedence over question window closing, survey neutral handling, delayed verdict delivery, and active session tracking.
- `tada-audio-logic.test.cjs`: Comprehensive Node 22 test suite covering intro cues, silent polling, invalid keys, authoritative verdicts (`002` right, `003` wrong, `004` neutral), survey mode, delayed verdicts, concurrent sessions, and the window-close race condition.
- `tada-pilot-gateway.cjs`: Minimal HTTP audio callback server interfacing with Yemot and proxying events to the Razzia backend via `/api/games/pilot-phone`. Requires `TADA_PILOT_SECRET` environment variable.

## Running Unit Tests
```bash
node --test extensions/src/telephony/pilot-runtime/tada-audio-logic.test.cjs
```

## Security Note
No runtime secrets, `.env` files, DPAPI tokens, phone numbers, or account credentials are stored in this repository. All sensitive configuration is supplied at runtime via environment variables (`TADA_PILOT_SECRET`, `TADA_RAZZIA_API_URL`, etc.).
