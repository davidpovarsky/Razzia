#!/bin/bash
set -euo pipefail
base=/home/ubuntu/tadazz-hq-qa-20261115
pin=76634efa3162227a54c7b0cedaf6e28c0facab55f0e127a8b469a8e4b9f97ffc
source_dir="$base/source/mcp-foundation-$pin/app"
fixtures="$base/fixtures/mcp-foundation-$pin"
evidence="$base/evidence/mcp-foundation-$pin"
container=tadazz-hq-mcp-foundation-20261115
image=sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647
test -f "$evidence/00-extraction.json"
if sudo -n docker inspect "$container" >/dev/null 2>&1; then
  echo "Owned container name already exists; inspect before reuse" >&2
  exit 30
fi
mkdir "$fixtures/home"
: > "$fixtures/empty-user.npmrc"
: > "$fixtures/empty-global.npmrc"
date -u +%FT%TZ > "$evidence/01-start.utc"
free -m > "$evidence/01-host-memory.txt"
sudo -n docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' > "$evidence/01-host-containers.txt"
sudo -n docker run -d --name "$container" --cpus=0.25 --memory=2g --pids-limit=128 \
  --read-only --tmpfs /tmp:rw,size=256m --cap-drop=ALL --security-opt=no-new-privileges \
  --mount type=bind,src="$source_dir",dst=/work \
  --mount type=bind,src="$fixtures",dst=/fixtures \
  --mount type=bind,src="$evidence",dst=/evidence \
  -e HOME=/fixtures/home -e NODE_PATH= -e NODE_OPTIONS= \
  -e NPM_CONFIG_USERCONFIG=/fixtures/empty-user.npmrc \
  -e NPM_CONFIG_GLOBALCONFIG=/fixtures/empty-global.npmrc \
  -e NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
  -w /work/extensions/src/mcp-app "$image" sleep infinity > "$evidence/01-container.id"
sudo -n docker inspect "$container" --format '{{.Image}} {{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{json .Mounts}} {{json .NetworkSettings.Ports}}' > "$evidence/01-container-policy.txt"
set +e
sudo -n docker exec "$container" sh -c '
  set -eu
  node --version
  pnpm --version
  pnpm install --ignore-workspace --ignore-scripts --registry=https://registry.npmjs.org/ --store-dir=/fixtures/pnpm-store --reporter=append-only
  pnpm list --depth 0 --json > /evidence/02-resolved-packages.json
  sha256sum pnpm-lock.yaml > /evidence/02-lock.sha256
' > "$evidence/02-install.log" 2>&1
code=$?
set -e
printf '%s\n' "$code" > "$evidence/02-install.exit"
tail -45 "$evidence/02-install.log"
exit "$code"

