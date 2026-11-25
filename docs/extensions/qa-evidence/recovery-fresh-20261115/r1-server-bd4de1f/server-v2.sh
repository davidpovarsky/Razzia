#!/bin/sh
set -eu
root=/home/ubuntu/tadazz-hq-qa-20261115
sha=bd4de1fb9b94548973c79f2f710bbec7f438e3e2
evidence="$root/evidence/recovery-r1-$sha"
src="$root/source/recovery-r1-$sha"
test ! -e "$evidence/process-v2.exit"
set +e
sudo -n docker exec -w /work/extensions tadazz-hq-recovery-r1-20261115 env RECOVERY_PROCESS_RECEIPT_ROOT=/qa/process-v2 node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/server/storage/process-interruption.test.ts -t 'quiz-(base|sidecar)-write' --maxWorkers=1 --no-file-parallelism --reporter verbose > "$evidence/process-v2.log" 2>&1
code=$?
set -e
printf '%s\n' "$code" > "$evidence/process-v2.exit"
python3 "$src/verify-inputs.py" "$root/fixtures/recovery-r1-$sha/work" "$src/source-manifest.json" > "$evidence/inputs-after-v2.json"
cat "$evidence/process-v2.exit"
tail -n 20 "$evidence/process-v2.log"
