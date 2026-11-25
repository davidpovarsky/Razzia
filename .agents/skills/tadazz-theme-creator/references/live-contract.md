# Live contract map

Resolve paths from this skill's repository root:

- `extensions/src/core/show-themes/definition.ts`: strict Zod manifest; 15 slots, 16 events, trusted renderer IDs, capabilities, tokens, asset metadata and choreography.
- `selection.ts`, `resolve.ts`, `registry.ts`: finite scoped selections, immutable id@semver, deterministic role/card/show/default precedence. Unknown versions are retained and fall back to Classic for display only.
- `classic.manifest.json`: actual registered source example. Assets have real byte lengths/SHA256. Existing repository rights are not a redistribution license.
- `extensions/qa/theme-authoring.ts`, `theme-remote.ts`: scaffold/schema/validate/package/upload/preview/qa/request-review/approve/stage/publish/rollback commands. Run with `pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts ...` from repository root; package exec runs in `extensions`, so use absolute paths for outputs/assets.
- `extensions/src/server/show-themes/validate-package.ts`: file/hash/signature/rights/Lottie checks; no remote fetch, ZIP extraction or code execution.
- `extensions/src/server/show-themes/installation.ts`: private SQLite artifacts/assets, independent review, signed immutable versions, active-version rollback and audit. `review.ts` remains the earlier in-process reference and is not the HTTP installation authority.
- `packages/socket/src/api/extensions/theme-routes.ts` and `services/theme-installation.ts`: verified account-session integration, server-assigned workspace grants and trusted build records. Never derive tenant/grants from a customer manifest.
- `packages/web/src/features/manager/components/ThemeInstallationPreview.tsx`: authenticated native stage preview; the CLI returns its URL. Runtime rooms pin an approved immutable definition in the existing authoritative envelope. The Studio catalog is scoped to the mounted account, without global mutation.
- `docs/extensions/SHOW_THEME_ENGINE.md`: integration, QA and actual support boundaries.

The generated JSON schema lives in `assets/theme-template/theme-manifest.schema.json`. Regenerate from the root with `node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/theme-authoring.ts schema`; Zod refinements (asset references, ownership and namespaces) require the runtime validator too. Never treat JSON Schema alone as sufficient approval.

New compiled renderers require a trusted source-controlled registry change and typed web adapter. Never turn an arbitrary manifest renderer ID into a dynamic import. The Classic adapter's canonical motion is fixed; code-backed themes may add reviewed adapters without modifying game/voting/auth logic.
