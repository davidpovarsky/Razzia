#!/usr/bin/env bash
set -euo pipefail
[[ "${PHONE_REMAINING_RUN:-}" == isolated-actual-authority ]]
[[ "${PHONE_REVIEW_SHA:-}" =~ ^[0-9a-f]{40}$ ]]
[[ -f /.dockerenv ]]
export PHONE_REMAINING_FIXTURES="/fixtures/phone-remaining-$PHONE_REVIEW_SHA"
export PHONE_REMAINING_EVIDENCE="/evidence/phone-remaining-$PHONE_REVIEW_SHA"
export TSX_TSCONFIG_PATH=/work/tsconfig.json
mkdir -p "$PHONE_REMAINING_FIXTURES" "$PHONE_REMAINING_EVIDENCE"
evidence="$PHONE_REMAINING_EVIDENCE"
qa=/delta/docs/extensions/qa-evidence/telephony-fresh-20261115
[[ ! -e "$evidence/run-started.json" ]]
cd /work
node "$qa/auth-source/verify-composed.mjs" > "$evidence/source-before.json"
node "$qa/auth-source/verify-overlay.mjs" > "$evidence/overlay-before.json"
node -e 'require("node:fs").writeFileSync(process.env.PHONE_REMAINING_EVIDENCE+"/run-started.json",JSON.stringify({sha:process.env.PHONE_REVIEW_SHA,node:process.version,scope:"seven new actual gateway delivery/custody cases; no provider or production host",started:new Date().toISOString()}),{flag:"wx"})'
monitor(){
  while true;do
    free=$(df -B1 --output=avail /evidence | tail -1 | tr -d ' ')
    allocated=$(du -sB1 /delta /input-auth /evidence | awk '{n+=$1}END{print n}')
    printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$free" "$allocated" >> "$evidence/disk-budget.log"
    if ((free<2147483648||allocated+524288>6291456));then touch "$evidence/DISK_BUDGET_ABORT";kill -TERM "$main_pid";return;fi
    sleep 3
  done
}
main_pid=$$
monitor & monitor_pid=$!
trap 'kill "$monitor_pid" 2>/dev/null || true;wait "$monitor_pid" 2>/dev/null || true' EXIT
set +e
timeout --signal=TERM --kill-after=5 240 node --max-old-space-size=512 /work/extensions/node_modules/tsx/dist/cli.mjs --tsconfig /work/tsconfig.json --test --test-reporter=tap --test-concurrency=1 "$qa/gateway-source/gateway.node.ts" > "$evidence/remaining.tap" 2>&1
tests=$?
set -e
node "$qa/auth-source/verify-composed.mjs" > "$evidence/source-after.json"
node "$qa/auth-source/verify-overlay.mjs" > "$evidence/overlay-after.json"
export PHONE_REMAINING_TEST_EXIT="$tests"
node -e 'require("node:fs").writeFileSync(process.env.PHONE_REMAINING_EVIDENCE+"/run-finished.json",JSON.stringify({sha:process.env.PHONE_REVIEW_SHA,finished:new Date().toISOString(),test_exit:Number(process.env.PHONE_REMAINING_TEST_EXIT),old10_100_18_rerun:false}),{flag:"wx"})'
exit "$tests"
