#!/bin/bash
set -u
mkdir /tmp/retained17
for i in $(seq 1 600); do [ -f /tmp/inputs-ready ] && break; sleep 1; done
[ -f /tmp/inputs-ready ] || exit 2
cp /input-source-sha256.json /out/source-sha256.json
cp /input-physical-mounts.json /out/physical-mounts.json
cp /tmp/retained17/tsconfig-focused.json /out/tsconfig-focused.json
cd /tmp/retained17
sed 's#/out/##' evidence-sha256.txt | sha256sum -c - >/out/retained17-integrity.log 2>&1
echo "$?" >/out/retained17-integrity.exit
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
run format node qa/theme-builder/format.mjs
run ui-build node node_modules/vite/bin/vite.js build --config qa/theme-builder/fixture.vite.config.ts --configLoader native
run server-build node node_modules/vite/bin/vite.js build --config qa/theme-builder/server.vite.config.ts --configLoader native
if [ "$(cat /out/ui-build.exit)" = 0 ] && [ "$(cat /out/server-build.exit)" = 0 ]; then
  start_host ui /out/server/server.js
  run oauth-component-browser node /work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/cli.js test --config qa/theme-builder/oauth-playwright.config.ts --grep 'real cross-tab token replacement'
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
