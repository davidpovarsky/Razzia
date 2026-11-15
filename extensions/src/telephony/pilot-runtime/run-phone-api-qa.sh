#!/usr/bin/env bash
set -euo pipefail
# Invoke only inside the NEW reserved container after manager transfers runner.
: "${PHONE_REVIEW_SHA:?immutable review SHA required}"
[[ "$PHONE_REVIEW_SHA" =~ ^[0-9a-f]{40}$ ]]
[[ "${PHONE_REMOTE_RUNNER_GRANTED:-}" == "P3_PHONE_API" ]]
[[ -f /.dockerenv ]]
cd /work
[[ -f extensions/src/telephony/pilot-runtime/phone-real-backend.test.ts ]]
fixture="/fixtures/phone-$PHONE_REVIEW_SHA"
evidence="/evidence/phone-api-$PHONE_REVIEW_SHA"
mkdir -p "$fixture" "$evidence"
[[ ! -e "$evidence/run-started.json" ]]
export TADAZZ_PHONE_QA_REVIEW_SHA="$PHONE_REVIEW_SHA"
export TADAZZ_PHONE_QA_FIXTURES="$fixture"
export TADAZZ_PHONE_QA_EVIDENCE="$evidence"
node -e 'require("node:fs").writeFileSync(process.env.TADAZZ_PHONE_QA_EVIDENCE+"/run-started.json", JSON.stringify({review_sha:process.env.TADAZZ_PHONE_QA_REVIEW_SHA,started_utc:new Date().toISOString(),node:process.version}), {flag:"wx"})'
node extensions/src/telephony/pilot-runtime/verify-phone-api-source.mjs > "$evidence/source-before.json"
# New isolated workspace only. Offline dependency availability is a prerequisite,
# not a claimed pass. Never point workspace symlinks at stale image source.
set +e
pnpm install --offline --frozen-lockfile > "$evidence/dependencies.log" 2>&1
dependency_exit=$?
set -e
if [[ "$dependency_exit" != 0 ]]; then
  export PHONE_TEST_EXIT="$dependency_exit"
  node -e 'require("node:fs").writeFileSync(process.env.TADAZZ_PHONE_QA_EVIDENCE+"/run-finished.json",JSON.stringify({stage:"dependency-install",exit_code:Number(process.env.PHONE_TEST_EXIT)}),{flag:"wx"})'
  exit "$dependency_exit"
fi
node extensions/src/telephony/pilot-runtime/verify-phone-api-source.mjs --links > "$evidence/dependency-source-links.json"
export TADAZZ_PHONE_QA_RUN=isolated-actual-backend
set +e
pnpm --dir extensions exec tsx --tsconfig ../tsconfig.json --test --test-concurrency=1 src/telephony/pilot-runtime/phone-real-backend.test.ts > "$evidence/actual-api.tap" 2>&1
test_exit=$?
set -e
node extensions/src/telephony/pilot-runtime/verify-phone-api-source.mjs --links > "$evidence/source-after.json"
export PHONE_TEST_EXIT="$test_exit"
node -e 'require("node:fs").writeFileSync(process.env.TADAZZ_PHONE_QA_EVIDENCE+"/run-finished.json", JSON.stringify({review_sha:process.env.TADAZZ_PHONE_QA_REVIEW_SHA,finished_utc:new Date().toISOString(),exit_code:Number(process.env.PHONE_TEST_EXIT)}),{flag:"wx"})'
exit "$test_exit"
