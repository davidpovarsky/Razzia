# Existing root gate repair — 2026-11-18

Root requested repair of failures exposed by the unchanged full Vitest gate. Work remains on the authorized isolated editor/Hebrew branch. The Hebrew agent owns the localized ConflictDialog expectation.

## Scope before edits

- packages/socket/src/api/pilot-phone.test.ts: examine the actual route contract and update only stale test authentication fixtures if warranted. Preserve missing/wrong-secret rejection and all DTMF/bounds/epoch assertions. Do not loosen production authorization.
- packages/web/src/features/game/phase-a-flow.browser.test.ts: support explicit PLAYWRIGHT_CHANNEL for an installed browser when the bundled executable is absent. Keep real browser launch and all synthetic DOM assertions; this remains a protocol harness, not full application E2E.
- packages/socket/src/api/extensions/theme-routes.test.ts and theme-routes.ts only if the reproduced failure is a concrete HTTP transport/route issue: first focused rerun reproduced ECONNRESET on the existing oversized-body rejection at line177. Investigate response handling without skipping or relaxing 413/auth/tenant assertions.

Record focused and full-gate outcomes. Do not change Vitest/TypeScript coverage gates, disable tests, or treat physical PSTN acceptance as proven by synthetic tests.
