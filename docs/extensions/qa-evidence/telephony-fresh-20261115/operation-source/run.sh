#!/usr/bin/env bash
set -euo pipefail
[[ "${PHONE_REMAINING_RUN:-}" == isolated-actual-authority ]]
[[ "${PHONE_REVIEW_SHA:-}" =~ ^[0-9a-f]{40}$ ]]
[[ -f /.dockerenv ]]
export TSX_TSCONFIG_PATH=/work/tsconfig.json
evidence="/evidence/phone-remaining-$PHONE_REVIEW_SHA"
qa=/delta/docs/extensions/qa-evidence/telephony-fresh-20261115
mkdir -m700 "$evidence"
[[ ! -e "$evidence/run-started.json" ]]
node "$qa/auth-source/verify-composed.mjs" > "$evidence/source-before.json"
node "$qa/auth-source/verify-overlay.mjs" > "$evidence/overlay-before.json"
node -e 'require("node:fs").writeFileSync(process.argv[1]+"/run-started.json",JSON.stringify({sha:process.env.PHONE_REVIEW_SHA,node:process.version,scope:"three affected call regressions and four new operation-intent cases",started:new Date().toISOString()}),{flag:"wx"})' "$evidence"
monitor(){
  while true;do
    free=$(df -B1 --output=avail /evidence | tail -1 | tr -d ' ')
    allocated=$(du -sB1 /delta /input-auth /evidence | awk '{n+=$1}END{print n}')
    printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$free" "$allocated" >> "$evidence/disk-budget.log"
    if ((free<2147483648||allocated+131072>1114112));then touch "$evidence/DISK_BUDGET_ABORT";kill -TERM "$main_pid";return;fi
    sleep 3
  done
}
main_pid=$$
monitor & monitor_pid=$!
trap 'kill "$monitor_pid" 2>/dev/null || true;wait "$monitor_pid" 2>/dev/null || true' EXIT
set +e
PHONE_REMAINING_FIXTURES="/fixtures/phone-remaining-$PHONE_REVIEW_SHA-call" PHONE_REMAINING_EVIDENCE="$evidence/call-regression" timeout --signal=TERM --kill-after=5 180 node --max-old-space-size=512 /work/extensions/node_modules/tsx/dist/cli.mjs --tsconfig /work/tsconfig.json --test --test-reporter=tap --test-concurrency=1 "$qa/call-source/call.node.ts" > "$evidence/call.tap" 2>&1
call_status=$?
PHONE_REMAINING_FIXTURES="/fixtures/phone-remaining-$PHONE_REVIEW_SHA-operation" PHONE_REMAINING_EVIDENCE="$evidence/operations" timeout --signal=TERM --kill-after=5 180 node --max-old-space-size=512 /work/extensions/node_modules/tsx/dist/cli.mjs --tsconfig /work/tsconfig.json --test --test-reporter=tap --test-concurrency=1 "$qa/operation-source/operation.node.ts" > "$evidence/operations.tap" 2>&1
operation_status=$?
set -e
node "$qa/auth-source/verify-composed.mjs" > "$evidence/source-after.json"
node "$qa/auth-source/verify-overlay.mjs" > "$evidence/overlay-after.json"
node -e 'require("node:fs").writeFileSync(process.argv[1]+"/run-finished.json",JSON.stringify({sha:process.env.PHONE_REVIEW_SHA,finished:new Date().toISOString(),call_exit:Number(process.argv[2]),operation_exit:Number(process.argv[3]),old_unrelated_suites_rerun:false}),{flag:"wx"})' "$evidence" "$call_status" "$operation_status"
((call_status==0&&operation_status==0))
