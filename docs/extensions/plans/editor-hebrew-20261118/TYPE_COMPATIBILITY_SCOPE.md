# Type compatibility repair scope — 2026-11-18

User-authorized Tadazz editor/Hebrew work on branch codex/tadazz-editor-hebrew-20261118, based on c9b2483b8719b4357852f105e91369e4ffb592e8. This repair was requested after the full web typecheck exposed existing incompatible syntax/API usage.

## Files and intended changes

- core/show-library/composition-repository-base.ts: preserve constructor injection with explicitly declared readonly fields instead of TypeScript parameter properties.
- server/api/account-preview-source.ts, server/phone-lifecycle-v2/contracts.ts, site/adapters/client.ts: preserve the existing Error subclasses and properties with explicit fields/assignments.
- site/components/game-preview/coordinator.ts, session-owner.ts: replace Promise.withResolvers with a native Promise deferred helper compatible with the existing target/lib. Preserve publication of the cleanup barrier before reentrant callbacks, failure handling, and idempotent release. Return the local settled promise to avoid nullable property inference.
- site/components/game-preview/deferred.ts: narrow, private feature helper for native Promise deferred creation if no existing compatible helper is present.

No TypeScript target/lib/config changes, no lint or test suppression, no policy change, no product/session/auth semantics change. Verify existing inline ownership/session tests and repository tests, then the unchanged web TypeScript gate. Root owns integrated build, browser acceptance, and commits.
