# Upstream touch ledger

Baseline upstream SHA: 5161eb7022144ee26d46a5f94cdbc714ec8b560d.

### Touch 1: `packages/socket/src/index.ts` (Startup Journal Recovery)
- **File and exact insertion point:** `packages/socket/src/index.ts` immediately after `initConfig()` at line 8.
- **Required capability:** Run `recoverStartupJournals(getPath)` at process boot before starting HTTP and WebSocket servers, ensuring incomplete writes and uncommitted media deletions recover deterministically before traffic arrives.
- **Alternatives considered:** Calling inside `initConfig()` in `packages/socket/src/services/config.ts`, but keeping `config.ts` free of `@razzia/extensions` imports preserves cleaner package architecture.
- **Maximum intended diff:** ~4 lines (import `recoverStartupJournals` and invoke with `getPath`).
- **Tests and compatibility evidence:** `extensions/src/server/media-library.test.ts`, `packages/socket/src/index.ts` startup lifecycle tests, all socket suite tests.
- **Merge risk:** Very low. Pure additive call before server startup; no modification of existing routing or handlers.
- **Owner approval:** Approved per P0 Final Targeted Repair specification (Gate A2).

### Touch 2: `packages/socket/src/api/routes/media.ts` (Transactional Media Deletion)
- **File and exact insertion point:** `packages/socket/src/api/routes/media.ts` in `.delete("/:name")` handler.
- **Required capability:** Execute media deletion as an atomic, quarantine-backed transaction (`executeMediaDeleteTransaction`) that protects media binary from partial detachment failure.
- **Alternatives considered:** Calling `deleteMedia` separately after `checkMediaDeleteSafety`, but crash or failure in `deleteMedia` left orphaned reference detachments with no recovery record.
- **Maximum intended diff:** ~10 lines.
- **Tests and compatibility evidence:** `extensions/src/server/media-library.test.ts`, `packages/socket/src/api/api.test.ts`.
- **Merge risk:** Very low. Preserves 409 Conflict contract and 204 No Content success semantics.
- **Owner approval:** Approved per P0 Final Targeted Repair specification (Gate A3).
