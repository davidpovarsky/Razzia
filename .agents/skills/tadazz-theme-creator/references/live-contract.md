# Live contract map

Resolve paths from this skill's repository root:

- `extensions/src/core/show-themes/definition.ts`: strict Zod manifest; 15 slots, 16 events, trusted renderer IDs, capabilities, tokens, asset metadata and choreography.
- `selection.ts`, `resolve.ts`, `registry.ts`: finite scoped selections, immutable id@semver, deterministic role/card/show/default precedence. Unknown versions are retained and fall back to Classic for display only.
- `classic.manifest.json`: actual registered source example. Assets have real byte lengths/SHA256. Existing repository rights are not a redistribution license.
- `extensions/qa/theme-authoring.ts`: working scaffold/schema/validate commands. Run with `pnpm --filter @razzia/extensions exec tsx qa/theme-authoring.ts ...` from repository root; package exec runs in `extensions`, so use absolute paths for outputs/assets.
- `extensions/src/server/show-themes/validate-package.ts`: file/hash/signature/rights/Lottie checks; no remote fetch, ZIP extraction or code execution.
- `extensions/src/server/show-themes/review.ts`: tested in-process tenant review/signature/rollback reference, not a durable API or authentication implementation.
- `docs/extensions/SHOW_THEME_ENGINE.md`: integration, QA and actual support boundaries.

The generated JSON schema lives in `assets/theme-template/theme-manifest.schema.json`. Regenerate from the root with `node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/theme-authoring.ts schema`; Zod refinements (asset references, ownership and namespaces) require the runtime validator too. Never treat JSON Schema alone as sufficient approval.

New compiled renderers require a trusted source-controlled registry change and typed web adapter. Never turn an arbitrary manifest renderer ID into a dynamic import. The Classic adapter's canonical motion is fixed; code-backed themes may add reviewed adapters without modifying game/voting/auth logic.
