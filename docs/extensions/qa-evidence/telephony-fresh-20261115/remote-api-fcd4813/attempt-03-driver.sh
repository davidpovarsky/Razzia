set -euo pipefail
cd /work
export TADAZZ_PHONE_QA_REVIEW_SHA="$PHONE_REVIEW_SHA"
export TADAZZ_PHONE_QA_FIXTURES="/fixtures/phone-$PHONE_REVIEW_SHA"
export TADAZZ_PHONE_QA_EVIDENCE="/evidence/phone-api-$PHONE_REVIEW_SHA"
e="$TADAZZ_PHONE_QA_EVIDENCE"
node -e 'require("node:fs").writeFileSync(process.env.TADAZZ_PHONE_QA_EVIDENCE+"/run-started.json",JSON.stringify({started_utc:new Date().toISOString(),node:process.version,attempt:3,setup:"explicit image cache, copy import"}),{flag:"wx"})'
node extensions/src/telephony/pilot-runtime/verify-phone-api-source.mjs > "$e/source-before.json"
set +e
pnpm install --offline --frozen-lockfile --store-dir /root/.local/share/pnpm/store --package-import-method copy > "$e/dependencies.log" 2>&1
code=$?
set -e
if [ "$code" -ne 0 ]; then
  printf '{"stage":"dependency-install","exit_code":%s}\n' "$code" > "$e/run-finished.json"
  exit "$code"
fi
node extensions/src/telephony/pilot-runtime/verify-phone-api-source.mjs --links > "$e/dependency-source-links.json"
export TADAZZ_PHONE_QA_RUN=isolated-actual-backend
set +e
node /work/extensions/node_modules/tsx/dist/cli.mjs --tsconfig /work/tsconfig.json --test --test-concurrency=1 /work/extensions/src/telephony/pilot-runtime/phone-real-backend.test.ts > "$e/actual-api.tap" 2>&1
code=$?
set -e
node extensions/src/telephony/pilot-runtime/verify-phone-api-source.mjs --links > "$e/source-after.json"
printf '{"stage":"actual-api","exit_code":%s}\n' "$code" > "$e/run-finished.json"
exit "$code"
