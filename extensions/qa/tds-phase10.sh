#!/usr/bin/env bash
set -u
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then exit 2; fi
failed=0
: > /evidence/phase-10-status.txt
check() {
  local label="$1"
  shift
  "$@" > "/evidence/phase-10-$label.log" 2>&1
  local result=$?
  echo "$label=$result" | tee -a /evidence/phase-10-status.txt
  if [ "$result" != "0" ]; then failed=1; fi
}
check types pnpm exec tsc --noEmit -p extensions/tsconfig.json
check web-types pnpm exec tsc --noEmit -p packages/web/tsconfig.app.json
check unit pnpm --dir extensions exec vitest run src/platform-ui src/site/tests/locales.test.ts --maxWorkers 2 --reporter=json --outputFile=/evidence/phase-10-unit.json
check motion-guard node extensions/qa/tds-motion-guard.mjs
check format pnpm exec prettier --check extensions/src/platform-ui extensions/src/site/web/studio/GameCard.tsx extensions/src/site/web/studio/MyGames.tsx extensions/qa/tds-components-fixture.tsx extensions/qa/tds-motion.spec.ts extensions/qa/tds-motion-site.spec.ts extensions/qa/tds-motion-guard.mjs extensions/tds.motion.playwright.config.ts extensions/tds.motion-site.playwright.config.ts
if [ "$failed" != "0" ]; then exit "$failed"; fi
check motion pnpm --dir extensions exec playwright test --config tds.motion.playwright.config.ts
check motion-site pnpm --dir extensions exec playwright test --config tds.motion-site.playwright.config.ts
if [ "$failed" != "0" ]; then exit "$failed"; fi
check components pnpm --dir extensions exec playwright test --config tds.components.playwright.config.ts
cp /evidence/phase-04-browser.json /evidence/phase-10-components.json
check catalog-build pnpm --dir extensions ui:catalog:build
check catalog-browser pnpm --dir extensions exec playwright test --config tds.catalog.playwright.config.ts
cp /evidence/phase-05-browser.json /evidence/phase-10-catalog-browser.json
check stage pnpm --dir extensions exec playwright test --config tds.stage.playwright.config.ts
cp /evidence/phase-07-stage.json /evidence/phase-10-stage.json
for engine in chromium webkit; do
  cp "/evidence/phase-07-qr-$engine.png" "/evidence/phase-10-stage-qr-$engine.png"
  cp "/evidence/phase-07-viewport-$engine.png" "/evidence/phase-10-stage-viewport-$engine.png"
done
check integration env TDS_CAPTURE=phase-10 TDS_COMPARE_EDITOR=1 TDS_EDITOR_BASELINE=/evidence/editor-control pnpm --dir extensions exec playwright test --config tds.playwright.config.ts
cp /evidence/browser-results.json /evidence/phase-10-integration.json
check freeze node extensions/qa/tds-boundary.mjs --files-only
check design node extensions/qa/tds-design-check.mjs
check registry node extensions/qa/tds-token-registry.mjs --check
check catalog node extensions/qa/tds-catalog-check.mjs
exit "$failed"
