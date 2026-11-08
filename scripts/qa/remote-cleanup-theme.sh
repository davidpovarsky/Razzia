#!/usr/bin/env bash
# Run only in the disposable remote QA container, never against production data.
set -u
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then
  echo 'Requires the isolated /cleanup remote QA container.' >&2
  exit 2
fi
mkdir -p /evidence
node --version > /evidence/node-version.txt
cp source-manifest.json /evidence/source-manifest.json
failed=0
check() {
  local label="$1"
  shift
  "$@" > "/evidence/$label.log" 2>&1
  local result=$?
  printf '%s=%s\n' "$label" "$result" | tee -a /evidence/status.txt
  if [ "$result" != "0" ]; then failed=1; fi
  return "$result"
}
check root-tests pnpm test --maxWorkers 2 --reporter=json --outputFile=/evidence/root-tests.json
check extension-tests pnpm --filter @razzia/extensions test --maxWorkers 2 --reporter=json --outputFile=/evidence/extension-tests.json
build_ok=0
if check build pnpm build; then build_ok=1; fi
check web-types pnpm exec tsc --noEmit -p packages/web/tsconfig.app.json
check socket-types pnpm exec tsc --noEmit -p packages/socket/tsconfig.json
check extension-types pnpm exec tsc --noEmit -p extensions/tsconfig.json
check e2e-types pnpm exec tsc --noEmit -p packages/e2e/tsconfig.json
if [ "$build_ok" = "1" ] && [ "$failed" = "0" ]; then
  check browser pnpm --filter @razzia/e2e exec playwright test --config playwright.cleanup-theme.config.ts
  cp -r packages/e2e/test-results /evidence/browser-results
else
  echo 'browser=NOT_RUN_PREREQUISITE_FAILED' | tee -a /evidence/status.txt
fi
printf '%s\n' "$failed" > /evidence/exit-code.txt
exit "$failed"
