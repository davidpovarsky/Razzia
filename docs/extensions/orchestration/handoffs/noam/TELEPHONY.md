# Noam Telephony Handoff (V3)

## Overview

- **Agent:** Noam (Telephony & Keypad Integration)
- **Role & Scope:** Provider-neutral offline simulated telephony module under `extensions/src/telephony/**` and handoff under `docs/extensions/orchestration/handoffs/noam/**`.
- **Branch:** `agent/noam/wave1`
- **Commit:** `39c7f1e75084f7af73ba4cc8c0dea8f50d7322a8`
- **Workspace:** `C:/Users/DAVID/Code/Razzia-worktrees/noam`

---

## 1. Public API & Integration Contracts

The telephony module is exported under `@razzia/extensions/telephony`:

```typescript
import {
  TelephonyBridge,
  MockProvider,
  YemotApiTranslator,
  RazziaSocketClient,
  KeypadSimulatorCore,
  KeypadSimulator,
  MockRazziaTransport,
  TELEPHONY_CONSTANTS,
  isQuestionSupportedOnPstn,
  mapDtmfToAnswerIndex,
  isValidPin,
  redactPhoneNumber,
} from "@razzia/extensions/telephony"
```

### Integration Guide for Tomer (Backend / Seam Integration)

To connect telephony to a live Razzia server or test suite:

1. **Instantiation:**

   ```typescript
   import { TelephonyBridge, MockProvider } from "@razzia/extensions/telephony"

   const bridge = new TelephonyBridge({
     transport: customOrMockTransport,
     provider: new MockProvider({ secret: process.env.TELEPHONY_MOCK_SECRET }),
     maxSessions: 1000,
     baseUrl: "http://localhost:3001",
   })
   ```

2. **Mounting Webhook Endpoint:**
   ```typescript
   // Route handler for POST /api/telephony/:provider
   app.post("/api/telephony/:provider", async (c) => {
     const providerId = c.req.param("provider")
     const result = await bridge.handleWebhookRequest(providerId, {
       method: "POST",
       url: c.req.url,
       headers: c.req.header(),
       query: c.req.query(),
       body: await c.req.json(),
       rawBody: await c.req.text(),
     })
     return c.body(result.body, result.statusCode, result.headers)
   })
   ```

### Integration Guide for Maya (Frontend / UI Integration)

To embed the virtual keypad simulator in the web application:

```tsx
import React, { useMemo } from "react"
import {
  KeypadSimulator,
  KeypadSimulatorCore,
  TelephonyBridge,
} from "@razzia/extensions/telephony"

export const PhoneSimulatorWidget: React.FC<{ bridge: TelephonyBridge }> = ({
  bridge,
}) => {
  const simulator = useMemo(() => new KeypadSimulatorCore(bridge), [bridge])
  return <KeypadSimulator simulator={simulator} title="Phone Keypad" />
}
```

---

## 2. Architecture & Components Implemented

### A. TelephonyProvider & MockProvider (`mock-provider.ts`, `provider.ts`)

- **HMAC-SHA256 Cryptographic Signature:** Signs and verifies synthetic requests using standard SHA-256 HMAC (`x-razzia-signature: sha256=<hex>`).
- **Timing Skew Protection:** Strictly enforces `|Date.now() - timestamp| <= 120s`. Out-of-window requests are rejected with 401.
- **Replay Protection (10-Minute TTL):** Caches processed nonces (`x-razzia-nonce`) for 10 minutes (`600,000 ms`). Replayed requests are rejected with 409 Conflict.
- **Privacy & Masking:** Caller IDs are strictly sanitized. Real caller phone numbers are redacted with `***-***-XXXX` or `[REDACTED_PHONE]`. No plain phone numbers are stored or logged.

### B. Yemot IVR Translator (`yemot-translator.ts`)

- **GET/POST Callback Parser:** Parses Yemot `type=api` callbacks, including `ApiCallId`, `ApiDID`, `ApiRealDID`, `ApiExtension`, `ApiTime`, `hangup`, and digit inputs (`pin`, `ans`, `data`).
- **Response Formatting:** Generates valid Yemot IVR response strings:
  - Read prompt: `read=t-<message>=<var>,,<min>,<max>,Digits,yes,<timeout>`
  - Hangup: `hangup`
  - Play message: `id_list_message=t-<message>`
- **Safety Gate (Disabled for Live):** Real Yemot remains strictly `isEnabled: false`. Verification fails closed if attempted without explicit override, clearly documenting unverified status.

### C. Authenticated Protocol Client & Transport (`transport.ts`, `socket-client.ts`)

- **Authentic Participation Flow:**
  1. `POST /api/auth/session` -> retrieves player session token and clientId.
  2. `POST /api/games/join` with `Authorization: Bearer <token>` and `{ inviteCode, username }` -> retrieves `gameId` and `ticket`.
  3. Connects Socket.IO (`path: "/ws"`, `auth: { token }`).
  4. Emits `EVENTS.PLAYER.LOGIN` with `{ ticket }`.
  5. Awaits `EVENTS.GAME.SUCCESS_JOIN` `{ gameId, username, gameMode }`.
  6. Submits answer during `STATUS.SELECT_ANSWER` via `EVENTS.PLAYER.SELECTED_ANSWER` `{ gameId, data: { answerKeys: [zeroBasedIndex] } }`.
- **Authoritative Clock:** The server scoring clock is authoritative; clients cannot forge or override submission timestamps.
- **Injected Transport:** `MockRazziaTransport` enables 100% in-memory, zero-dependency testing without running live servers or binding network ports.

### D. TelephonyBridge Orchestrator (`bridge.ts`)

- **1000 Local Session Cap:** Enforces a hard capacity limit of 1000 concurrent sessions (`TELEPHONY_CONSTANTS.MAX_SESSIONS`). Rejects excess calls with `capacityExceeded`.
- **Digit Rate Limiting:** Enforces maximum 10 digits/sec per call, throttling excessive input.
- **Strict 6-Digit PIN Validation:** Validates `/^\d{6}$/`. Prompts caller to retry if invalid format or game not found.
- **Digit Mapping:** Maps phone keypad `1` -> `0`, `2` -> `1`, `3` -> `2`, `4` -> `3`. Ignores control keys `0`, `*`, `#`.
- **Idempotency & Stale Epoch Prevention:** Keyed by `${callId}:${gameId}:${epoch}` with 10-minute TTL. Only the first valid answer per question epoch is accepted; duplicate submissions receive feedback that the answer was already recorded.
- **Cross-Room Isolation:** Each call session is isolated to its joined `gameId` and socket client. Calls cannot submit across rooms.
- **Unsupported Question Types (`PHONE04`):** Detects survey mode, multi-choice, estimation, or questions with >4 options. Returns an informative voice prompt without affecting web participants.
- **Clean Disconnect:** Disposes socket and frees session memory on hangup.

### E. Virtual Keypad Simulator (`simulator.ts`, `KeypadSimulator.tsx`)

- Headless `KeypadSimulatorCore` engine suitable for CLI automation and tests.
- React `KeypadSimulator` component providing an accessible vintage 3x4 telephone keypad and green LCD display.

---

## 3. Engineering Acceptance Verification

| Case ID     | Requirement                                                                            | Test Result | Observable Evidence                                                                                                                                                      |
| :---------- | :------------------------------------------------------------------------------------- | :---------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SEC02**   | HMAC-SHA256 verification, timing skew <=120s, replay TTL 10min, redacted phone logs    | **PASS**    | Valid signature accepted (200); tampered signature rejected (401); clock skew >120s rejected (401); nonce replay rejected (409); phone numbers masked as `***-***-XXXX`. |
| **PHONE01** | Simulator joins via `/auth/session` -> `/games/join` -> socket login -> `SUCCESS_JOIN` | **PASS**    | Full authenticated handshake executed; player registered as `"Phone 001"`; socket joined to game room.                                                                   |
| **PHONE02** | Digits 1..4 map to 0..3 during `SELECT_ANSWER` only; authoritative server clock        | **PASS**    | Digits 1..4 map to indices 0..3; answer recorded with server timestamp; early press rejected.                                                                            |
| **PHONE03** | Replay, duplicate answer in same epoch, out-of-window rejected                         | **PASS**    | Duplicate digit press returns `"already been recorded"`; total recorded answers remains 1; late press after results rejected.                                            |
| **PHONE04** | Unsupported multi, estimation, survey, >4 choices handled with voice prompt            | **PASS**    | Multi-choice, estimation, survey, and 5-answer questions return clear telephone prompt; web clients continue unaffected.                                                 |
| **PHONE05** | PIN validation, fake hangup, clean reconnect, cross-room isolation                     | **PASS**    | 5-digit/letter PINs rejected; hangup disconnects socket (0 active sessions); Room 1 caller cannot submit to Room 2.                                                      |
| **PHONE06** | 100 synthetic concurrent participants load test                                        | **PASS**    | 100/100 participants join and answer simultaneously with 0 failures (0.00% failure rate).                                                                                |

### PHONE06 Concurrency & Latency Benchmark Results

Measured on 100 concurrent simulated telephone participants:

```
=== PHONE06 100 CONCURRENT PARTICIPANTS METRICS ===
Join total time: 91.98 ms
Answer total time: 17.02 ms
Participants: 100
Failures: 0 (0.00%)
Latency min: 4.09 ms
Latency mean: 11.77 ms
Latency p50: 12.46 ms
Latency p95: 16.24 ms
Latency p99: 16.75 ms
==================================================
```

---

## 4. Test Suite Execution Summary

### Extensions Test Suite:

```
$ pnpm --filter @razzia/extensions test
 RUN  v5.0.3 C:/Users/DAVID/Code/Razzia-worktrees/noam/extensions

 ✓ src/core/core.test.ts (25 tests) 59ms
 ✓ src/core/imports.test.ts (3 tests) 10ms
 ✓ src/telephony/telephony.test.ts (27 tests) 193ms

 Test Files  3 passed (3)
      Tests  55 passed (55)
   Duration  832ms
Exit code: 0
```

### Root Test Suite Baseline Compatibility:

```
$ pnpm test
 RUN  v5.0.3 C:/Users/DAVID/Code/Razzia-worktrees/noam

 Test Files  17 passed (17)
      Tests  217 passed (217)
   Duration  3.59s
Exit code: 0
```

### TypeScript Verification:

```
$ pnpm --filter @razzia/extensions exec tsc --noEmit
Exit code: 0 (0 errors)
```

### Code Formatting:

```
$ npx prettier --check extensions/src/telephony/**
Checking formatting...
All matched files use Prettier code style!
Exit code: 0
```

---

## 5. Unverified Carrier Constraints & Fork Protection

1. **Provider Neutrality:** The telephony architecture is completely decoupled from any single carrier. Real telephony providers (including Yemot HaMashiach) remain unverified and disabled for live use in this local-first release.
2. **Safety Guarantees:**
   - No public tunnels, external webhooks, or open network listeners were created.
   - No paid phone numbers, SIP trunks, or provider accounts were registered or charged.
   - `ENABLE_REAL_YEMOT` remains `false`.
   - The synthetic HMAC-SHA256 mechanism is documented as an internal simulation protocol and NOT claimed as evidence of real Yemot cryptographic authentication.
3. **Strict Fork Protection:**
   - Changes are strictly localized to `extensions/src/telephony/**` and this handoff document.
   - No files in `packages/**`, root configurations, lockfiles, or other modules were altered.
