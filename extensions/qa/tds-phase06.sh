#!/usr/bin/env bash
set -u
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then exit 2; fi
failed=0
: > /evidence/phase-06-status.txt
check() {
  local label="$1"
  shift
  "$@" > "/evidence/phase-06-$label.log" 2>&1
  local result=$?
  echo "$label=$result" | tee -a /evidence/phase-06-status.txt
  if [ "$result" != "0" ]; then failed=1; fi
}
check types pnpm exec tsc --noEmit -p extensions/tsconfig.json
check web-types pnpm exec tsc --noEmit -p packages/web/tsconfig.app.json
check unit pnpm --dir extensions exec vitest run src/platform-ui src/presentation/platform-controls.test.ts src/site/tests/client.test.ts src/site/tests/locales.test.ts src/site/tests/delete-boundary.test.ts src/core/show-authoring.test.ts src/core/show-workbook.test.ts src/core/show-import-preflight.test.ts src/core/show-themes/roundtrip.test.ts src/core/show-themes/product-brand.test.ts --maxWorkers 2 --reporter=json --outputFile=/evidence/phase-06-unit.json
if [ "$failed" != "0" ]; then exit "$failed"; fi
check browser pnpm --dir extensions exec playwright test --config tds.site.playwright.config.ts
check account-browser env TDS_SITE_SLICE=account pnpm --dir extensions exec playwright test --config tds.site.playwright.config.ts
check components pnpm --dir extensions exec playwright test --config tds.components.playwright.config.ts
cp /evidence/phase-04-browser.json /evidence/phase-06-components.json
check integration env TDS_CAPTURE=phase-06 TDS_COMPARE_EDITOR=1 TDS_EDITOR_BASELINE=/evidence/editor-control pnpm --dir extensions exec playwright test --config tds.playwright.config.ts
cp /evidence/browser-results.json /evidence/phase-06-integration.json
check freeze node extensions/qa/tds-boundary.mjs --files-only
check design node extensions/qa/tds-design-check.mjs
check registry node extensions/qa/tds-token-registry.mjs --check
exit "$failed"
