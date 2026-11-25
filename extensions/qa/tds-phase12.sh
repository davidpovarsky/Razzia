#!/usr/bin/env bash
set -u
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then exit 2; fi
failed=0
: > /evidence/phase-12-status.txt
check() {
  local label="$1"
  shift
  "$@" > "/evidence/phase-12-$label.log" 2>&1
  local result=$?
  echo "$label=$result" | tee -a /evidence/phase-12-status.txt
  if [ "$result" != "0" ]; then failed=1; fi
  return "$result"
}
check install pnpm install --frozen-lockfile
check types pnpm exec tsc --noEmit -p extensions/tsconfig.json
check qa-types pnpm exec tsc --noEmit -p extensions/qa/tsconfig.json
check web-types pnpm exec tsc --noEmit -p packages/web/tsconfig.app.json
check socket-types pnpm exec tsc --noEmit -p packages/socket/tsconfig.json
check lint pnpm lint
check format-target pnpm exec prettier --check extensions/src/platform-ui extensions/src/presentation/index.ts extensions/src/site/web/shared/ReferenceCanvas.tsx extensions/src/site/web/studio/GameCard.tsx extensions/src/site/web/studio/MyGames.tsx extensions/src/site/tests/locales.test.ts extensions/src/site/tests/naming-compatibility.test.ts extensions/qa/tds-acceptance.spec.ts extensions/qa/tds-motion.spec.ts extensions/qa/tds-motion-site.spec.ts extensions/tds.acceptance.playwright.config.ts extensions/tds.live-acceptance.playwright.config.ts extensions/tds.legacy-acceptance.playwright.config.ts extensions/tds.site-regression.playwright.config.ts
check format-repository pnpm format
check unit-root pnpm test --maxWorkers 2 --reporter=json --outputFile=/evidence/phase-12-unit-root.json
check unit-extensions pnpm --dir extensions exec vitest run --maxWorkers 2 --reporter=json --outputFile=/evidence/phase-12-unit-extensions.json
check build pnpm build
# The default-off native bundle exercises the preserved manager/config route.
# The 40 Chromium / 20 WebKit capacity soak is not rerun under the known 4-GiB
# budget. Its historical failures stay disclosed; the bounded watchdog does run.
if check package-broker node extensions/qa/tds-package-ready.mjs; then
  check package-runtime env TADAZZ_PACKAGE_QA_CONFIG_PATH=/evidence/package-staging-tds12-20261112 pnpm --dir packages/e2e exec playwright test --config playwright.package-runtime.config.ts --grep-invert "concurrent package displays"
  cp /evidence/package-browser-report.json /evidence/phase-12-package-runtime.json
  touch "/evidence/phase-12-broker-${TDS_PACKAGE_QA_RUN}-done"
fi
check routes pnpm --dir extensions exec playwright test --config tds.acceptance.playwright.config.ts
check live pnpm --dir extensions exec playwright test --config tds.live-acceptance.playwright.config.ts
check site-regression pnpm --dir extensions exec playwright test --config tds.site-regression.playwright.config.ts
# The historical unmodified suite assumes PIN entry at /, now /manager.
# Keep its failed first attempt; exercise the actual /game entry directly.
check native pnpm --dir extensions exec playwright test --config tds.native-acceptance.playwright.config.ts
check tokens pnpm --dir extensions exec playwright test --config tds.tokens.playwright.config.ts
cp /evidence/phase-03-browser.json /evidence/phase-12-tokens.json
check components pnpm --dir extensions exec playwright test --config tds.components.playwright.config.ts
cp /evidence/phase-04-browser.json /evidence/phase-12-components.json
check catalog-build pnpm --dir extensions ui:catalog:build
check catalog-browser pnpm --dir extensions exec playwright test --config tds.catalog.playwright.config.ts
cp /evidence/phase-05-browser.json /evidence/phase-12-catalog-browser.json
check motion pnpm --dir extensions exec playwright test --config tds.motion.playwright.config.ts
cp /evidence/phase-10-motion.json /evidence/phase-12-motion.json
check motion-site pnpm --dir extensions exec playwright test --config tds.motion-site.playwright.config.ts
cp /evidence/phase-10-motion-site.json /evidence/phase-12-motion-site.json
check stage pnpm --dir extensions exec playwright test --config tds.stage.playwright.config.ts
cp /evidence/phase-07-stage.json /evidence/phase-12-stage.json
check integration env TDS_CAPTURE=phase-12 TDS_COMPARE_EDITOR=1 TDS_EDITOR_BASELINE=/evidence/editor-control pnpm --dir extensions exec playwright test --config tds.playwright.config.ts
cp /evidence/browser-results.json /evidence/phase-12-integration.json
check freeze node extensions/qa/tds-boundary.mjs --files-only
check cinematic node extensions/qa/tds-motion-guard.mjs
check design node extensions/qa/tds-design-check.mjs
check registry node extensions/qa/tds-token-registry.mjs --check
check catalog node extensions/qa/tds-catalog-check.mjs
exit "$failed"
