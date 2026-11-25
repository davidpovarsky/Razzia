#!/usr/bin/env bash
set -u
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then exit 2; fi
failed=0
: > /evidence/phase-05-status.txt
check() {
  local label="$1"
  shift
  "$@" > "/evidence/phase-05-$label.log" 2>&1
  local result=$?
  echo "$label=$result" | tee -a /evidence/phase-05-status.txt
  if [ "$result" != "0" ]; then failed=1; fi
}
check types pnpm exec tsc --noEmit -p extensions/tsconfig.json
check web-types pnpm exec tsc --noEmit -p packages/web/tsconfig.app.json
check unit pnpm --dir extensions exec vitest run src/platform-ui src/presentation/platform-controls.test.ts --maxWorkers 2 --reporter=json --outputFile=/evidence/phase-05-unit.json
check catalog-source node extensions/qa/tds-catalog-check.mjs
check build pnpm --dir extensions ui:catalog:build
check local-only bash extensions/qa/tds-catalog-boundary.sh
if [ "$failed" != "0" ]; then exit "$failed"; fi
check browser pnpm --dir extensions exec playwright test --config tds.catalog.playwright.config.ts
check components pnpm --dir extensions exec playwright test --config tds.components.playwright.config.ts
cp /evidence/phase-04-browser.json /evidence/phase-05-components.json
check token-browser pnpm --dir extensions exec playwright test --config tds.tokens.playwright.config.ts
check editor env TDS_CAPTURE=phase-05 TDS_COMPARE_EDITOR=1 TDS_EDITOR_BASELINE=/evidence/editor-control pnpm --dir extensions exec playwright test --config tds.playwright.config.ts
cp /evidence/browser-results.json /evidence/phase-05-editor.json
check freeze node extensions/qa/tds-boundary.mjs --files-only
check design node extensions/qa/tds-design-check.mjs
check registry node extensions/qa/tds-token-registry.mjs --check
exit "$failed"
