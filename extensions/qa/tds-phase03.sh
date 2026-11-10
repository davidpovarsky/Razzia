#!/usr/bin/env bash
set -u
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then exit 2; fi
failed=0
: > /evidence/phase-03-status.txt
check() {
  local label="$1"
  shift
  "$@" > "/evidence/phase-03-$label.log" 2>&1
  local result=$?
  echo "$label=$result" | tee -a /evidence/phase-03-status.txt
  if [ "$result" != "0" ]; then failed=1; fi
}
check unit pnpm --dir extensions exec vitest run src/platform-ui/tokens.test.ts --maxWorkers 2 --reporter=json --outputFile=/evidence/phase-03-unit.json
check types pnpm exec tsc --noEmit -p extensions/tsconfig.json
check browser pnpm --dir extensions exec playwright test --config tds.tokens.playwright.config.ts
check editor env TDS_CAPTURE=phase-03 TDS_COMPARE_EDITOR=1 TDS_EDITOR_ONLY=1 TDS_EDITOR_BASELINE=/evidence/editor-control pnpm --dir extensions exec playwright test --config tds.playwright.config.ts
cp /evidence/browser-results.json /evidence/phase-03-editor.json
check freeze node extensions/qa/tds-boundary.mjs --files-only
check design node extensions/qa/tds-design-check.mjs
check registry node extensions/qa/tds-token-registry.mjs --check
exit "$failed"
