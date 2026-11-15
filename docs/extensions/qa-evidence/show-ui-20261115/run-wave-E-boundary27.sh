#!/bin/bash
set -u
for name in source-sha256 physical-mounts tsconfig-focused; do cp "/input-$name.json" "/out/$name.json"; done
cp /input-originalStudio.tsx /out/originalStudio.tsx
cd /work/extensions
run() { local name="$1"; shift; "$@" > "/out/$name.log" 2>&1; local result=$?; echo "$result" > "/out/$name.exit"; }
run format node qa/theme-builder/format.mjs
run typescript node node_modules/typescript/bin/tsc -p /out/tsconfig-focused.json
TADAZZ_BOUNDARY_BASELINE=1 run baseline-build node node_modules/vite/bin/vite.js build --config qa/theme-builder/account-boundary.vite.config.ts --configLoader native
run fixed-build node node_modules/vite/bin/vite.js build --config qa/theme-builder/account-boundary.vite.config.ts --configLoader native
for mode in baseline fixed; do
  if [ "$(cat /out/$mode-build.exit)" != 0 ]; then continue; fi
  node qa/theme-builder/account-boundary-server.mjs "/out/boundary-$mode" >"/out/$mode-host.log" 2>&1 &
  host_pid=$!
  for i in $(seq 1 100); do grep -q '^QA_PORT=' "/out/$mode-host.log" && break; kill -0 "$host_pid" || break; sleep .1; done
  export TADAZZ_QA_BASE="http://127.0.0.1:$(sed -n 's/^QA_PORT=//p' "/out/$mode-host.log")"
  if [ "$mode" = baseline ]; then
    TADAZZ_BOUNDARY_BASELINE=1 run baseline-browser node /work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/cli.js test --config qa/theme-builder/account-boundary-playwright.config.ts --grep 'isolates edited'
  else
    run fixed-browser node /work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/cli.js test --config qa/theme-builder/account-boundary-playwright.config.ts
  fi
  kill "$host_pid" 2>/dev/null || true; wait "$host_pid" 2>/dev/null || true
done
result=0
for name in format typescript baseline-build fixed-build fixed-browser; do if [ ! -f "/out/$name.exit" ] || [ "$(cat "/out/$name.exit")" != 0 ]; then result=1; fi; done
echo "$result" >/out/final.exit
find /out -type f -exec sha256sum {} + >/tmp/evidence-sha256.txt
cp /tmp/evidence-sha256.txt /out/evidence-sha256.txt
echo ready
for i in $(seq 1 1800); do [ -f /tmp/evidence-retrieved ] && exit "$result"; sleep 1; done
exit 2
