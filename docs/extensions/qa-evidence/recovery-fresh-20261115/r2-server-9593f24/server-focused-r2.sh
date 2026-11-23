#!/bin/sh
set -eu
root=/home/ubuntu/tadazz-hq-qa-20261115
sha=9593f24f287f2e404f387f6359e89453cd8a971e
src="$root/source/recovery-r2-$sha"
evidence="$root/evidence/recovery-r2-$sha"
runner=tadazz-hq-recovery-r2-20261115
test ! -e "$evidence/native-r2.exit"
{ date -u; free -m; df -Pm "$root"; sudo -n docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}'; } > "$evidence/resources-before-tests.txt"
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -gt 3145728
test "$(df -Pk "$root" | awk 'NR==2 {print $4}')" -gt 2097152
python3 "$src/verify-inputs.py" "$root/fixtures/recovery-r2-$sha/work" "$src/source-manifest.json" > "$evidence/inputs-before-tests.json"
set +e
sudo -n docker exec -w /work/extensions "$runner" env RECOVERY_NATIVE_RECEIPT_ROOT=/qa/native-r2 node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/server/storage/native-binding.test.ts src/server/storage/native-binding-r2.test.ts src/server/storage/package-stage-r2.test.ts --maxWorkers=1 --no-file-parallelism --reporter verbose > "$evidence/native-r2.log" 2>&1
printf '%s\n' "$?" > "$evidence/native-r2.exit"
sudo -n docker exec -w /work/extensions "$runner" env RECOVERY_PROCESS_RECEIPT_ROOT=/qa/process-r2 node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/server/storage/process-interruption.test.ts --maxWorkers=1 --no-file-parallelism --reporter verbose > "$evidence/process-r2.log" 2>&1
printf '%s\n' "$?" > "$evidence/process-r2.exit"
sudo -n docker exec -w /work/extensions "$runner" env RECOVERY_RECEIPT_PATH=/qa/media-focused.jsonl RECOVERY_TRANSACTION_RECEIPT_PATH=/qa/transactions-focused.jsonl node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/server/storage.test.ts src/server/media-library.test.ts src/server/storage/journal-recovery.test.ts src/server/storage/create-recovery.test.ts src/server/media-library-recovery.test.ts --maxWorkers=1 --no-file-parallelism --reporter verbose > "$evidence/original-focused-r2.log" 2>&1
printf '%s\n' "$?" > "$evidence/original-focused-r2.exit"
set -e
python3 "$src/verify-inputs.py" "$root/fixtures/recovery-r2-$sha/work" "$src/source-manifest.json" > "$evidence/inputs-after-tests.json"
printf '%s\n' FOCUSED_RUNS_COMPLETE
tail -n 8 "$evidence/native-r2.log"
tail -n 8 "$evidence/process-r2.log"
tail -n 8 "$evidence/original-focused-r2.log"
