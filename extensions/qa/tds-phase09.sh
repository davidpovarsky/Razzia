#!/usr/bin/env bash
set -u
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then exit 2; fi
failed=0
: > /evidence/phase-09-status.txt
check() {
  local label="$1"
  shift
  "$@" > "/evidence/phase-09-$label.log" 2>&1
  local result=$?
  echo "$label=$result" | tee -a /evidence/phase-09-status.txt
  if [ "$result" != "0" ]; then failed=1; fi
}
check types pnpm exec tsc --noEmit -p extensions/tsconfig.json
check web-types pnpm exec tsc --noEmit -p packages/web/tsconfig.app.json
check unit pnpm --dir extensions exec vitest run src/platform-ui src/locales/locales.test.ts src/core/roster.test.ts src/server/game/extraction-contracts.test.ts src/server/p0-telephony-roster.test.ts --maxWorkers 2 --reporter=json --outputFile=/evidence/phase-09-unit.json
check format pnpm exec prettier --check extensions/src/platform-ui extensions/src/site/themes/packages.ts extensions/src/site/tests/browser/site.spec.ts extensions/src/locales extensions/qa/tds-roster.spec.ts extensions/qa/tds-package-admin.spec.ts extensions/tds.roster.playwright.config.ts extensions/tds.package-admin.playwright.config.ts packages/web/src/features/game/components/HostPlayersModal.tsx packages/web/src/features/game/components/GameSettingsModal/index.tsx
if [ "$failed" != "0" ]; then exit "$failed"; fi
check roster pnpm --dir extensions exec playwright test --config tds.roster.playwright.config.ts
check packages pnpm --dir extensions exec playwright test --config tds.site.playwright.config.ts --grep "advanced packages stay lazy"
cp /evidence/phase-06-browser.json /evidence/phase-09-packages.json
check package-admin pnpm --dir extensions exec playwright test --config tds.package-admin.playwright.config.ts
check components pnpm --dir extensions exec playwright test --config tds.components.playwright.config.ts
cp /evidence/phase-04-browser.json /evidence/phase-09-components.json
check catalog-build pnpm --dir extensions ui:catalog:build
check integration env TDS_CAPTURE=phase-09 TDS_COMPARE_EDITOR=1 TDS_EDITOR_BASELINE=/evidence/editor-control pnpm --dir extensions exec playwright test --config tds.playwright.config.ts
cp /evidence/browser-results.json /evidence/phase-09-integration.json
check freeze node extensions/qa/tds-boundary.mjs --files-only
check design node extensions/qa/tds-design-check.mjs
check registry node extensions/qa/tds-token-registry.mjs --check
check catalog node extensions/qa/tds-catalog-check.mjs
exit "$failed"
