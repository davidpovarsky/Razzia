#!/bin/bash
set -u
for name in source-sha256 physical-mounts foreign-inputs tsconfig-focused format-scope; do cp "/input-$name.json" "/out/$name.json"; done
cd /work/extensions
export XDG_DATA_HOME=/tmp/native-save-vitest
run() { local name="$1"; shift; "$@" > "/out/$name.log" 2>&1; local result=$?; echo "$result" > "/out/$name.exit"; }
run typescript node node_modules/typescript/bin/tsc -p /out/tsconfig-focused.json
run tests node node_modules/vitest/vitest.mjs run --config /run7/vitest.config.mjs --configLoader native src/components/native-save-consent/client.test.ts --maxWorkers=1
run format node qa/theme-builder/format.mjs
run ui-build node node_modules/vite/bin/vite.js build --config qa/theme-builder/native-save-ui.vite.config.ts --configLoader native
run server-build node node_modules/vite/bin/vite.js build --config qa/theme-builder/native-save-server.vite.config.ts --configLoader native
if [ "$(cat /out/ui-build.exit)" = 0 ]; then run browser-receipt node qa/theme-builder/native-save-build-receipt.mjs; fi
host_pid=""
stop_host() { if [ -n "$host_pid" ]; then kill "$host_pid" 2>/dev/null || true; wait "$host_pid" 2>/dev/null || true; host_pid=""; fi; }
trap stop_host EXIT
if [ "$(cat /out/ui-build.exit)" = 0 ] && [ "$(cat /out/server-build.exit)" = 0 ]; then
  node /out/native-save-server/native-save-server.js >/out/native-save-host.log 2>&1 &
  host_pid=$!
  for i in $(seq 1 100); do grep -q '^QA_PORT=' /out/native-save-host.log && break; kill -0 "$host_pid" || break; sleep .1; done
  export TADAZZ_QA_BASE="http://127.0.0.1:$(sed -n 's/^QA_PORT=//p' /out/native-save-host.log)"
  run browser node /work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/cli.js test --config qa/theme-builder/native-save-playwright.config.ts
  stop_host
fi
result=0
for check in /out/*.exit; do if [ "$(cat "$check")" != 0 ]; then result=1; fi; done
echo "$result" >/out/final.exit
find /out -type f -exec sha256sum {} + >/tmp/evidence-sha256.txt
cp /tmp/evidence-sha256.txt /out/evidence-sha256.txt
echo ready
for i in $(seq 1 1800); do [ -f /tmp/evidence-retrieved ] && exit "$result"; sleep 1; done
exit 2
