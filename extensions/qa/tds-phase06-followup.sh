#!/usr/bin/env bash
set -u
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then exit 2; fi
failed=0
: > /evidence/phase-06-followup-status.txt
check() {
  local label="$1"
  shift
  "$@" > "/evidence/phase-06-followup-$label.log" 2>&1
  local result=$?
  echo "$label=$result" | tee -a /evidence/phase-06-followup-status.txt
  if [ "$result" != "0" ]; then failed=1; fi
}
check types pnpm exec tsc --noEmit -p extensions/tsconfig.json
check web-types pnpm exec tsc --noEmit -p packages/web/tsconfig.app.json
check browser env TDS_SITE_SLICE=followup pnpm --dir extensions exec playwright test --config tds.site.playwright.config.ts
check integration env TDS_CAPTURE=phase-06 TDS_COMPARE_EDITOR=1 TDS_EDITOR_BASELINE=/evidence/editor-control pnpm --dir extensions exec playwright test --config tds.playwright.config.ts
cp /evidence/browser-results.json /evidence/phase-06-integration.json
check freeze node extensions/qa/tds-boundary.mjs --files-only
check design node extensions/qa/tds-design-check.mjs
check catalog-source node extensions/qa/tds-catalog-check.mjs
check registry node extensions/qa/tds-token-registry.mjs --check
exit "$failed"
