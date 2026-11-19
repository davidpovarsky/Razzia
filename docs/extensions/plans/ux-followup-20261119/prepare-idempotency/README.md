# Live room creation retries — 2026-11-19

## Contract

POST /api/games accepts an optional requestId UUID. Existing callers that omit it retain their previous behavior. A verified manager can repeat the same request ID and quiz while that room is present in the existing Registry; the response contains the original game ID and invite code. Reusing that key for another owned quiz returns 409. Owned quiz validation still runs before lookup, and lookup is scoped to the authenticated manager.

The lookup, room construction, registration, and request binding are synchronous within the handler. The binding is a WeakMap keyed by the live Game object. It requires no database migration, durable cache, Game modification, or Registry modification.

This provides at-most-one live room for a manager's repeated launch intent. It follows the existing volatile room lifetime: an empty room can be removed after five minutes, and rooms disappear on process restart. Once the old room is removed, the same key may create a fresh room. This does not promise durable idempotency across restarts.

## Verification

Six focused HTTP tests use actual disposable verified accounts, signed tokens, the real API routes, and the real live Registry. They cover:

- Concurrent first attempts, a discarded first response, and retry returning the same room.
- Key reuse with another owned quiz returning 409.
- Same key across two owners producing separate rooms; a foreign quiz remains 404.
- Optional-key compatibility for old clients.
- Invalid UUIDs, anonymous callers, and players creating no rooms.
- Removal of the original room permitting a fresh live room.

See validation.json for test, lint, type, and diff-check output. Root owns the stable client request ID in the Prepare component and its browser verification.
