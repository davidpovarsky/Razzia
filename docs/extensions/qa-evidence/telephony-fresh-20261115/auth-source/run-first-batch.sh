#!/usr/bin/env bash
set -euo pipefail
[[ "${PHONE_AUTHORITY_SOURCE_RUN:-}" == granted ]]
[[ "${PHONE_REVIEW_SHA:-}" =~ ^[0-9a-f]{40}$ ]]
[[ -f /.dockerenv ]]
export PHONE_AUTHORITY_FIXTURES="/fixtures/phone-auth-$PHONE_REVIEW_SHA"
export PHONE_AUTHORITY_EVIDENCE="/evidence/phone-auth-$PHONE_REVIEW_SHA"
export TSX_TSCONFIG_PATH=/work/tsconfig.json
mkdir -p "$PHONE_AUTHORITY_FIXTURES" "$PHONE_AUTHORITY_EVIDENCE"
qa=/delta/docs/extensions/qa-evidence/telephony-fresh-20261115/auth-source
evidence="$PHONE_AUTHORITY_EVIDENCE"
[[ ! -e "$evidence/run-started.json" ]]
cd /work
node -e 'require("node:fs").writeFileSync(process.env.PHONE_AUTHORITY_EVIDENCE+"/run-started.json",JSON.stringify({sha:process.env.PHONE_REVIEW_SHA,node:process.version,started:new Date().toISOString(),scope:"new authority batch only"}),{flag:"wx"})'
node "$qa/verify-composed.mjs" > "$evidence/base-before.json"
node "$qa/verify-overlay.mjs" > "$evidence/overlay-before.json"
monitor(){
  while true;do
    free=$(df -B1 --output=avail /evidence | tail -1 | tr -d ' ')
    allocated=$(du -sB1 /delta /input-auth /evidence | awk '{n+=$1}END{print n}')
    printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$free" "$allocated" >> "$evidence/disk-budget.log"
    if ((free<2147483648||allocated+524288>8388608));then touch "$evidence/DISK_BUDGET_ABORT";kill -TERM "$main_pid";return;fi
    sleep 3
  done
}
main_pid=$$
monitor & monitor_pid=$!
trap 'kill "$monitor_pid" 2>/dev/null || true;wait "$monitor_pid" 2>/dev/null || true' EXIT
set +e
timeout --signal=TERM --kill-after=5 90 node --max-old-space-size=512 "$qa/typecheck.mjs" > "$evidence/typecheck.log" 2>&1
types=$?
timeout --signal=TERM --kill-after=5 120 node --max-old-space-size=512 /work/extensions/node_modules/tsx/dist/cli.mjs --tsconfig /work/tsconfig.json --test --test-reporter=tap --test-concurrency=1 "$qa/authority-first-batch.node.ts" > "$evidence/authority.tap" 2>&1
tests=$?
set -e
node "$qa/verify-composed.mjs" > "$evidence/base-after.json"
node "$qa/verify-overlay.mjs" > "$evidence/overlay-after.json"
export AUTH_TYPES="$types" AUTH_TESTS="$tests"
node -e 'require("node:fs").writeFileSync(process.env.PHONE_AUTHORITY_EVIDENCE+"/run-finished.json",JSON.stringify({sha:process.env.PHONE_REVIEW_SHA,finished:new Date().toISOString(),type_exit:Number(process.env.AUTH_TYPES),test_exit:Number(process.env.AUTH_TESTS),prior20_or3_rerun:false}),{flag:"wx"})'
if [[ "$tests" != 0 ]];then exit "$tests";fi
exit "$types"
