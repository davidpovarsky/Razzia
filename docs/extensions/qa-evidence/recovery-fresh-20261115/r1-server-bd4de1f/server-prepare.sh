#!/bin/sh
set -eu
root=/home/ubuntu/tadazz-hq-qa-20261115
sha=bd4de1fb9b94548973c79f2f710bbec7f438e3e2
src="$root/source/recovery-r1-$sha"
fixture="$root/fixtures/recovery-r1-$sha"
evidence="$root/evidence/recovery-r1-$sha"
mkdir "$fixture" "$evidence"
{
  date -u
  nproc
  free -m
  df -Pm "$root"
  sudo -n docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}'
} > "$evidence/resources-before.txt"
# Admission follows the manager's .25 CPU / 2 GiB grant. Never use another runner.
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -gt 3145728
test "$(df -Pk "$root" | awk 'NR==2 {print $4}')" -gt 2097152
python3 "$src/extract-r1-source.py" "$src/full-source.tar.gz" "$src/source-manifest.json" "$fixture/work" f97c79c377c3e7f1c4670c9d14518ccc0ce8bbf0e41bbf95028d089aaf7dabfc 5528d18ebb39d806c6ea22ec215df0c6b4017459042d78332ad15d5a4d2218f3 > "$evidence/extraction.json"
python3 "$src/verify-inputs.py" "$fixture/work" "$src/source-manifest.json" > "$evidence/inputs-before.json"
sudo -n docker run -d --name tadazz-hq-recovery-r1-20261115 --network none --cpus=0.25 --memory=2g --memory-swap=2g --pids-limit=256 --shm-size=256m --mount "type=bind,src=$fixture/work,dst=/work" --mount "type=bind,src=$evidence,dst=/qa" tadazz:design-system-qa-20261110 sleep infinity > "$evidence/container-id.txt"
sudo -n docker inspect tadazz-hq-recovery-r1-20261115 --format '{"image":{{json .Config.Image}},"network":{{json .HostConfig.NetworkMode}},"nanoCpus":{{.HostConfig.NanoCpus}},"memory":{{.HostConfig.Memory}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}}}' > "$evidence/runner-identity.json"
set +e
sudo -n docker exec -w /work tadazz-hq-recovery-r1-20261115 sh -c 'node --version > /qa/node-version.txt; pnpm install --offline --frozen-lockfile --ignore-scripts > /qa/install.log 2>&1'
code=$?
set -e
printf '%s\n' "$code" > "$evidence/install.exit"
test "$code" -eq 0
python3 "$src/verify-inputs.py" "$fixture/work" "$src/source-manifest.json" > "$evidence/inputs-after-install.json"
printf '%s\n' 'PREPARED_NO_TESTS_RUN'
