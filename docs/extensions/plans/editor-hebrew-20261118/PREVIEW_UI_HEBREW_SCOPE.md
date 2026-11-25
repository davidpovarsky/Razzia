# Isolated preview UI Hebrew completeness — 2026-11-18

Pre-edit scope: the final narrow Phase2 typecheck exposed a remaining 15-caption
Record<PreviewLocale> table without Hebrew at show-library-preview/ui-strings.ts.
Add actual Hebrew translations while preserving the other eight locale tables.
Update the existing locale assertion in preview-candidate.test.ts only if it omits
Hebrew. Keep the renderer, session, admission, and build configuration unchanged.
Verify the focused preview suite and Phase2 TypeScript project.

## Verified

Node 24.22.1 / Vitest5.0.3: preview-candidate.test.ts12/12 PASS, including nine
isolated locales initialized synchronously. Phase2 TypeScript project passes:
node node_modules/typescript/bin/tsc -p extensions/qa/phase2/tsconfig.json --noEmit.
Prettier and scoped git diff --check pass. Logs: preview-ui-hebrew-tests.log and
preview-ui-hebrew-types.log. No renderer/session/build configuration changes.
