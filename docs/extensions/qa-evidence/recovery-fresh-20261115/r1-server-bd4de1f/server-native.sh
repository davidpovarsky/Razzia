#!/bin/sh
set -eu
root=/home/ubuntu/tadazz-hq-qa-20261115
sha=bd4de1fb9b94548973c79f2f710bbec7f438e3e2
evidence="$root/evidence/recovery-r1-$sha"
src="$root/source/recovery-r1-$sha"
test ! -e "$evidence/native-r1.exit"
{
  date -u
  free -m
  df -Pm "$root"
  sudo -n docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}'
} > "$evidence/resources-before-native.txt"
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -gt 3145728
test "$(df -Pk "$root" | awk 'NR==2 {print $4}')" -gt 2097152
python3 "$src/verify-inputs.py" "$root/fixtures/recovery-r1-$sha/work" "$src/source-manifest.json" > "$evidence/inputs-before-native.json"
set +e
sudo -n docker exec -w /work/extensions tadazz-hq-recovery-r1-20261115 env RECOVERY_NATIVE_RECEIPT_ROOT=/qa/native-r1 node node_modules/vitest/vitest.mjs run --config vitest.config.ts src/server/storage/native-binding.test.ts --maxWorkers=1 --no-file-parallelism --reporter verbose > "$evidence/native-r1.log" 2>&1
code=$?
set -e
printf '%s\n' "$code" > "$evidence/native-r1.exit"
python3 "$src/verify-inputs.py" "$root/fixtures/recovery-r1-$sha/work" "$src/source-manifest.json" > "$evidence/inputs-after-native.json"
cat "$evidence/native-r1.exit"
tail -n 65 "$evidence/native-r1.log"
