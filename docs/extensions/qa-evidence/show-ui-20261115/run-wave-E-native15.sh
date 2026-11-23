#!/bin/bash
set -u
mkdir /tmp/retained14
for i in $(seq 1 600); do [ -f /tmp/inputs-ready ] && break; sleep 1; done
[ -f /tmp/inputs-ready ] || exit 2
cp /input-source-sha256.json /out/source-sha256.json
cp /input-physical-mounts.json /out/physical-mounts.json
cp /tmp/retained14/tsconfig-focused.json /out/tsconfig-focused.json
cd /tmp/retained14
sed 's#/out/##' evidence-sha256.txt | sha256sum -c - >/out/retained14-integrity.log 2>&1
echo "$?" >/out/retained14-integrity.exit
cd /work/extensions
export XDG_DATA_HOME=/tmp/theme-builder-vitest
run() { local name="$1"; shift; "$@" > "/out/$name.log" 2>&1; local result=$?; echo "$result" > "/out/$name.exit"; }
host_pid=""
stop_host() { if [ -n "$host_pid" ]; then kill "$host_pid" 2>/dev/null || true; wait "$host_pid" 2>/dev/null || true; host_pid=""; fi; }
trap stop_host EXIT
start_host() {
  local label="$1"; shift
  node "$@" > "/out/$label-host.log" 2>&1 &
  host_pid=$!
  for i in $(seq 1 100); do grep -q '^QA_PORT=' "/out/$label-host.log" && break; kill -0 "$host_pid" || break; sleep .1; done
  export TADAZZ_QA_BASE="http://127.0.0.1:$(sed -n 's/^QA_PORT=//p' "/out/$label-host.log")"
}
run typescript node node_modules/typescript/bin/tsc -p /out/tsconfig-focused.json
run tests node node_modules/vitest/vitest.mjs run --config /run7/vitest.config.mjs --configLoader native src/presentation/show-library-preview/preview-candidate.test.ts --maxWorkers=1
run format node qa/theme-builder/format.mjs
run native-build node node_modules/vite/bin/vite.js build --config ../docs/extensions/qa-evidence/show-ui-20261115/qa-native-receipt.vite.config.ts --configLoader native --outDir /out/native-candidate
run native-receipt node qa/theme-builder/native-build-receipt.mjs
run toolchain node qa/theme-builder/toolchain.mjs
run native-v2-inputs node --import /work/extensions/node_modules/tsx/dist/loader.mjs qa/theme-builder/native-v2-build-inputs.mjs
export TADAZZ_NATIVE_RECEIPT_PATH=/out/native-v2-module-receipt.json
run native-v2-build node node_modules/vite/bin/vite.js build --config ../docs/extensions/qa-evidence/show-ui-20261115/qa-native-v2-receipt.vite.config.ts --configLoader native --outDir /out/native-v2-candidate
TADAZZ_NATIVE_ARTIFACT_VERSION=2 run native-v2-receipt node qa/theme-builder/native-build-receipt.mjs
export TADAZZ_QA_FIXTURE_TMP=1
run native-fixture node qa/theme-builder/prepare-native-fixture.mjs
if [ "$(cat /out/native-build.exit)" = 0 ] && [ "$(cat /out/retained14-integrity.exit)" = 0 ]; then
  start_host native /tmp/retained14/harness-server-build/qa-fixture-server.js /tmp/native-fixture "$(cat /out/native-browser-sha.txt)" /out/native-artifact-index.json
  run native-browser node /work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/cli.js test --config ../docs/extensions/qa-evidence/show-ui-20261115/qa-native-focus.config.ts --grep 'actual localized authored question/choices: (en|es)$|actual ref identity'
  run native-clock node /work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/cli.js test --config ../docs/extensions/qa-evidence/show-ui-20261115/qa-preview.config.ts --grep 'paused voting remains stable'
  stop_host
fi
if [ "$(cat /out/native-v2-build.exit)" = 0 ] && [ "$(cat /out/retained14-integrity.exit)" = 0 ]; then
  run native-v2-fixture node qa/theme-builder/prepare-native-v2-fixture.mjs
  if [ "$(cat /out/native-v2-fixture.exit)" = 0 ]; then
    start_host native-v2 /tmp/retained14/harness-server-build/qa-fixture-server.js /tmp/native-v2-fixture "$(cat /out/native-v2-browser-sha.txt)" /out/native-v2-artifact-index.json v2
    run native-v2-smoke node qa/theme-builder/native-v2-smoke.mjs
    if [ "$(cat /out/native-v2-smoke.exit)" = 0 ]; then
      run native-v2-browser node /work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/cli.js test --config ../docs/extensions/qa-evidence/show-ui-20261115/qa-native-v2.config.ts
    fi
    stop_host
  fi
fi
result=0
for check in /out/*.exit; do if [ "$(cat "$check")" != 0 ]; then result=1; fi; done
echo "$result" >/out/final.exit
find /out -type f -exec sha256sum {} + >/tmp/evidence-sha256.txt
cp /tmp/evidence-sha256.txt /out/evidence-sha256.txt
echo ready
for i in $(seq 1 1800); do [ -f /tmp/evidence-retrieved ] && exit "$result"; sleep 1; done
exit 2
