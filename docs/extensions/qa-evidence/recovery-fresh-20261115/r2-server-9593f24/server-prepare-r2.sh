#!/bin/sh
set -eu
root=/home/ubuntu/tadazz-hq-qa-20261115
sha=9593f24f287f2e404f387f6359e89453cd8a971e
src="$root/source/recovery-r2-$sha"
fixture="$root/fixtures/recovery-r2-$sha"
evidence="$root/evidence/recovery-r2-$sha"
mkdir "$fixture" "$evidence"
{ date -u; free -m; df -Pm "$root"; sudo -n docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}'; } > "$evidence/resources-before.txt"
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -gt 3145728
test "$(df -Pk "$root" | awk 'NR==2 {print $4}')" -gt 2097152
python3 "$src/extract-r2-source.py" "$src/full-source.tar.gz" "$src/source-manifest.json" "$fixture/work" f4b110d25744cd21270c42a86b6fb4a2d2b2693e58c7ac65c49a56d506ac5ed3 67fecbcd28cfdef2a768c4ae7203e41a08a33c0cab6134f38aca3155fe0b7fe1 > "$evidence/extraction.json"
python3 "$src/verify-inputs.py" "$fixture/work" "$src/source-manifest.json" > "$evidence/inputs-before.json"
sudo -n docker run -d --name tadazz-hq-recovery-r2-20261115 --network none --cpus=0.25 --memory=2g --memory-swap=2g --pids-limit=256 --shm-size=256m --mount "type=bind,src=$fixture/work,dst=/work" --mount "type=bind,src=$evidence,dst=/qa" tadazz:design-system-qa-20261110 sleep infinity > "$evidence/container-id.txt"
sudo -n docker inspect tadazz-hq-recovery-r2-20261115 --format '{"imageId":{{json .Image}},"image":{{json .Config.Image}},"network":{{json .HostConfig.NetworkMode}},"nanoCpus":{{.HostConfig.NanoCpus}},"memory":{{.HostConfig.Memory}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}}}' > "$evidence/runner-identity.json"
set +e
sudo -n docker exec -w /work tadazz-hq-recovery-r2-20261115 sh -c 'node --version > /qa/node-version.txt; pnpm install --offline --frozen-lockfile --ignore-scripts --package-import-method=copy --store-dir=/root/.local/share/pnpm/store > /qa/install.log 2>&1'
code=$?
set -e
printf '%s\n' "$code" > "$evidence/install.exit"
test "$code" -eq 0
python3 "$src/verify-inputs.py" "$fixture/work" "$src/source-manifest.json" > "$evidence/inputs-after-install.json"
printf '%s\n' PREPARED_NO_TESTS_RUN
