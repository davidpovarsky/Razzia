#!/bin/sh
set -eu
root=/home/ubuntu/tadazz-hq-qa-20261115
sha=9593f24f287f2e404f387f6359e89453cd8a971e
src="$root/source/recovery-r2-$sha"
evidence="$root/evidence/recovery-r2-$sha"
test ! -e "$evidence/native-roundtrip-before.exit"
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -gt 3145728
test "$(df -Pk "$root" | awk 'NR==2 {print $4}')" -gt 2097152
cp "$src/native-roundtrip-before.ts" "$src/launch-roundtrip-before.cjs" "$evidence/"
python3 "$src/verify-inputs.py" "$root/fixtures/recovery-r2-$sha/work" "$src/source-manifest.json" > "$evidence/inputs-before-roundtrip.json"
sudo -n docker start tadazz-hq-recovery-r2-20261115 > "$evidence/restart-for-roundtrip.log"
set +e
sudo -n docker exec -w /work/extensions tadazz-hq-recovery-r2-20261115 node /qa/launch-roundtrip-before.cjs > "$evidence/native-roundtrip-before.log" 2>&1
code=$?
set -e
printf '%s\n' "$code" > "$evidence/native-roundtrip-before.exit"
python3 "$src/verify-inputs.py" "$root/fixtures/recovery-r2-$sha/work" "$src/source-manifest.json" > "$evidence/inputs-after-roundtrip.json"
sudo -n docker stop --time 5 tadazz-hq-recovery-r2-20261115 > "$evidence/stop-after-roundtrip.log"
sudo -n docker inspect tadazz-hq-recovery-r2-20261115 --format '{{json .State}}' > "$evidence/runner-after-roundtrip.json"
cat "$evidence/native-roundtrip-before.exit"
