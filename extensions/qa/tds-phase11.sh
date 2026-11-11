#!/usr/bin/env bash
set -u
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then exit 2; fi
failed=0
: > /evidence/phase-11-status.txt
check() {
  local label="$1"
  shift
  "$@" > "/evidence/phase-11-$label.log" 2>&1
  local result=$?
  echo "$label=$result" | tee -a /evidence/phase-11-status.txt
  if [ "$result" != "0" ]; then failed=1; fi
}
check types pnpm exec tsc --noEmit -p extensions/tsconfig.json
check web-types pnpm exec tsc --noEmit -p packages/web/tsconfig.app.json
check compatibility pnpm --dir extensions exec vitest run src/core/show-authoring.test.ts src/core/show-workbook.test.ts src/core/show-import-preflight.test.ts src/core/bundle.test.ts src/core/show-themes/roundtrip.test.ts src/core/show-themes/product-brand.test.ts src/core/show-themes/show-themes.test.ts src/site/tests/naming-compatibility.test.ts src/site/tests/locales.test.ts --maxWorkers 2 --reporter=json --outputFile=/evidence/phase-11-compatibility.json
check format pnpm exec prettier --check extensions/src/presentation/index.ts extensions/src/site/tests/naming-compatibility.test.ts extensions/src/site/tests/locales.test.ts
check cinematic node extensions/qa/tds-motion-guard.mjs
check freeze node extensions/qa/tds-boundary.mjs --files-only
check design node extensions/qa/tds-design-check.mjs
check registry node extensions/qa/tds-token-registry.mjs --check
check catalog node extensions/qa/tds-catalog-check.mjs
exit "$failed"
