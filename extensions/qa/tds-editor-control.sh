#!/usr/bin/env bash
set -u
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then exit 2; fi
target=/cleanup/extensions/src/site/web/shared/ReferenceCanvas.tsx
cp "$target" /evidence/current-candidate-reference.tsx
restore() { cp /evidence/current-candidate-reference.tsx "$target"; }
trap restore EXIT
cp /evidence/original-reference-canvas.tsx "$target"
sha256sum "$target" > /evidence/editor-control-repeat-source.sha256
TDS_CAPTURE=editor-control-repeat TDS_EDITOR_ONLY=1 pnpm --dir extensions exec playwright test --config tds.playwright.config.ts > /evidence/editor-control-repeat.log 2>&1
result=$?
cp /evidence/browser-results.json /evidence/editor-control-repeat-results.json
exit "$result"
