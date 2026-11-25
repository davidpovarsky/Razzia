#!/usr/bin/env bash
set -u
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then exit 2; fi
failed=0
: > /evidence/phase-04-status.txt
check() {
  local label="$1"
  shift
  "$@" > "/evidence/phase-04-$label.log" 2>&1
  local result=$?
  echo "$label=$result" | tee -a /evidence/phase-04-status.txt
  if [ "$result" != "0" ]; then failed=1; fi
}
check install pnpm install --frozen-lockfile --ignore-scripts
check unit pnpm --dir extensions exec vitest run src/platform-ui src/presentation/platform-controls.test.ts --maxWorkers 2 --reporter=json --outputFile=/evidence/phase-04-unit.json
check types pnpm exec tsc --noEmit -p extensions/tsconfig.json
check web-types pnpm exec tsc --noEmit -p packages/web/tsconfig.app.json
if [ "$failed" != "0" ]; then exit "$failed"; fi
check browser pnpm --dir extensions exec playwright test --config tds.components.playwright.config.ts
check token-browser pnpm --dir extensions exec playwright test --config tds.tokens.playwright.config.ts
check integration env TDS_CAPTURE=phase-04 TDS_COMPARE_EDITOR=1 TDS_EDITOR_BASELINE=/evidence/editor-control pnpm --dir extensions exec playwright test --config tds.playwright.config.ts
cp /evidence/browser-results.json /evidence/phase-04-integration.json
check freeze node extensions/qa/tds-boundary.mjs --files-only
check design node extensions/qa/tds-design-check.mjs
check registry node extensions/qa/tds-token-registry.mjs --check
exit "$failed"
