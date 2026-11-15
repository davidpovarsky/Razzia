#!/usr/bin/env bash
set -euo pipefail
[[ "${PHONE_V2A_GRANTED:-}" == "unmounted-synthetic-prototype" ]]
[[ "${PHONE_REVIEW_SHA:-}" =~ ^[0-9a-f]{40}$ ]]
[[ -f /.dockerenv ]]
export PHONE_V2A_FIXTURES="/fixtures/phone-v2a-$PHONE_REVIEW_SHA"
export PHONE_V2A_EVIDENCE="/evidence/phone-v2a-$PHONE_REVIEW_SHA"
export TSX_TSCONFIG_PATH=/work/tsconfig.json
mkdir -p "$PHONE_V2A_FIXTURES" "$PHONE_V2A_EVIDENCE"
evidence="$PHONE_V2A_EVIDENCE"
[[ ! -e "$evidence/run-started.json" ]]
node -e 'require("node:fs").writeFileSync(process.env.PHONE_V2A_EVIDENCE+"/run-started.json",JSON.stringify({tested_sha:process.env.PHONE_REVIEW_SHA,started:new Date().toISOString(),node:process.version}),{flag:"wx"})'
qa=/delta/docs/extensions/qa-evidence/telephony-fresh-20261115/v2a
cd /work
# Existing S02 application and dependencies are mounted READ ONLY. No install.
PHONE_REVIEW_SHA=003cf88b6cba19989388dca20efcfaa01cc8f9ad node extensions/src/telephony/pilot-runtime/verify-phone-api-source.mjs --links > "$evidence/base-before.json"
node "$qa/verify-overlay.mjs" > "$evidence/overlay-before.json"
monitor() {
  while true; do
    available=$(df -B1 --output=avail /fixtures | tail -1 | tr -d ' ')
    bytes=$(du -sb /fixtures /evidence | awk '{n+=$1}END{print n}')
    printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$available" "$bytes" >> "$evidence/disk-budget.log"
    if (( available < 2147483648 || bytes > 62914560 )); then
      touch "$evidence/DISK_BUDGET_ABORT"
      kill -TERM "$main_pid"
      return
    fi
    sleep 5
  done
}
main_pid=$$
monitor & monitor_pid=$!
trap 'kill "$monitor_pid" 2>/dev/null || true; wait "$monitor_pid" 2>/dev/null || true' EXIT
set +e
node --max-old-space-size=512 "$qa/typecheck.mjs" > "$evidence/typecheck.log" 2>&1
types=$?
timeout --signal=TERM --kill-after=5 300 node --max-old-space-size=512 /work/extensions/node_modules/tsx/dist/cli.mjs --tsconfig /work/tsconfig.json --test --test-concurrency=1 "$qa/phone-v2a.node.ts" > "$evidence/v2a.tap" 2>&1
tests=$?
set -e
PHONE_REVIEW_SHA=003cf88b6cba19989388dca20efcfaa01cc8f9ad node extensions/src/telephony/pilot-runtime/verify-phone-api-source.mjs --links > "$evidence/base-after.json"
node "$qa/verify-overlay.mjs" > "$evidence/overlay-after.json"
export PHONE_V2A_TYPES="$types" PHONE_V2A_TESTS="$tests"
node -e 'require("node:fs").writeFileSync(process.env.PHONE_V2A_EVIDENCE+"/run-finished.json",JSON.stringify({tested_sha:process.env.PHONE_REVIEW_SHA,finished:new Date().toISOString(),type_exit:Number(process.env.PHONE_V2A_TYPES),test_exit:Number(process.env.PHONE_V2A_TESTS)}),{flag:"wx"})'
if [[ "$tests" != 0 ]]; then exit "$tests"; fi
exit "$types"
