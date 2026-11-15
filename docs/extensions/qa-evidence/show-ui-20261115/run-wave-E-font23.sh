#!/bin/bash
set -u
mkdir /tmp/retained21
for i in $(seq 1 600); do [ -f /tmp/inputs-ready ] && break; sleep 1; done
[ -f /tmp/inputs-ready ] || exit 2
for name in source-sha256 physical-mounts tsconfig-focused; do cp "/input-$name.json" "/out/$name.json"; done
cd /work/extensions
run() { local name="$1"; shift; "$@" > "/out/$name.log" 2>&1; local result=$?; echo "$result" > "/out/$name.exit"; }
qa=/work/docs/extensions/qa-evidence/show-ui-20261115
run format node qa/theme-builder/format.mjs
run typescript node node_modules/typescript/bin/tsc -p /out/tsconfig-focused.json
run prepare node --import /work/extensions/node_modules/tsx/dist/loader.mjs "$qa/prepare-font23.mjs"
run host-build node node_modules/vite/bin/vite.js build --config "$qa/qa-server.vite.config.ts" --configLoader native
if [ "$(cat /out/prepare.exit)" = 0 ] && [ "$(cat /out/host-build.exit)" = 0 ]; then
  run host-tamper node "$qa/verify-font-host-policy.mjs"
  node /out/harness-server-build/qa-fixture-server.js /tmp/native-font-fixture "$(cat /out/font-browser-sha.txt)" /out/font-artifact-index.json v2 rubik >/out/font-host.log 2>&1 &
  host_pid=$!
  for i in $(seq 1 100); do grep -q '^QA_PORT=' /out/font-host.log && break; kill -0 "$host_pid" || break; sleep .1; done
  export TADAZZ_QA_BASE="http://127.0.0.1:$(sed -n 's/^QA_PORT=//p' /out/font-host.log)"
  run browser node /work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/cli.js test --config "$qa/qa-native-font.config.ts"
  kill "$host_pid" 2>/dev/null || true; wait "$host_pid" 2>/dev/null || true
fi
result=0
for check in /out/*.exit; do if [ "$(cat "$check")" != 0 ]; then result=1; fi; done
echo "$result" >/out/final.exit
find /out -type f -exec sha256sum {} + >/tmp/evidence-sha256.txt
cp /tmp/evidence-sha256.txt /out/evidence-sha256.txt
echo ready
for i in $(seq 1 1800); do [ -f /tmp/evidence-retrieved ] && exit "$result"; sleep 1; done
exit 2
