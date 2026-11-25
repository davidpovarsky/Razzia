#!/bin/bash
set -u
mkdir /tmp/retained14 /tmp/retained15
for i in $(seq 1 600); do [ -f /tmp/inputs-ready ] && break; sleep 1; done
[ -f /tmp/inputs-ready ] || exit 2
cp /input-source-sha256.json /out/source-sha256.json
cp /input-physical-mounts.json /out/physical-mounts.json
run() { local name="$1"; shift; "$@" > "/out/$name.log" 2>&1; local result=$?; echo "$result" > "/out/$name.exit"; }
for retained in retained14 retained15; do
  cd "/tmp/$retained"
  sed 's#/out/##' evidence-sha256.txt | sha256sum -c - >"/out/$retained-integrity.log" 2>&1
  echo "$?" >"/out/$retained-integrity.exit"
done
cd /work/extensions
run native-v1-reuse node /verify-native-v1-reuse.mjs
host_pid=""
stop_host() { if [ -n "$host_pid" ]; then kill "$host_pid" 2>/dev/null || true; wait "$host_pid" 2>/dev/null || true; host_pid=""; fi; }
trap stop_host EXIT
if [ "$(cat /out/native-v1-reuse.exit)" = 0 ] && [ "$(cat /out/retained14-integrity.exit)" = 0 ] && [ "$(cat /out/retained15-integrity.exit)" = 0 ]; then
  cp -r /tmp/retained15/native-candidate /out/native-candidate
  export TADAZZ_QA_FIXTURE_TMP=1
  run native-fixture node qa/theme-builder/prepare-native-fixture.mjs
  if [ "$(cat /out/native-fixture.exit)" = 0 ]; then
    node /tmp/retained14/harness-server-build/qa-fixture-server.js /tmp/native-fixture "$(cat /out/native-browser-sha.txt)" /out/native-artifact-index.json >/out/native-host.log 2>&1 &
    host_pid=$!
    for i in $(seq 1 100); do grep -q '^QA_PORT=' /out/native-host.log && break; kill -0 "$host_pid" || break; sleep .1; done
    export TADAZZ_QA_BASE="http://127.0.0.1:$(sed -n 's/^QA_PORT=//p' /out/native-host.log)"
    run native-browser node /work/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/cli.js test --config ../docs/extensions/qa-evidence/show-ui-20261115/qa-native-focus.config.ts
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
