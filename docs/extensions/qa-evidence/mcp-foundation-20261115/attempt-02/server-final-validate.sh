#!/bin/bash
set -euo pipefail
base=/home/ubuntu/tadazz-hq-qa-20261115
pin=c4dc04deb2d80953e13fe1771686c1e00e293048c66f8b7a0365879643ee8d68
old=76634efa3162227a54c7b0cedaf6e28c0facab55f0e127a8b469a8e4b9f97ffc
source_dir="$base/source/mcp-foundation-$pin/app"
fixtures="$base/fixtures/mcp-foundation-$pin"
evidence="$base/evidence/mcp-foundation-$pin"
container=tadazz-hq-mcp-foundation-20261115
image=sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647
test -f "$evidence/00-extraction.json"
# Only this worker's exact named container; all evidence/source/cache bind data remain.
sudo -n docker inspect "$container" --format '{{.Image}} {{json .Mounts}}' > "$evidence/01-prior-owned-container.txt"
sudo -n docker stop "$container" > "$evidence/01-prior-stop.txt"
sudo -n docker rm "$container" > "$evidence/01-prior-remove.txt"
mkdir "$fixtures/home"
cp -a "$base/fixtures/mcp-foundation-$old/pnpm-store" "$fixtures/pnpm-store"
cp "$base/fixtures/mcp-foundation-$old/format-options.json" "$fixtures/format-options.json"
: > "$fixtures/empty-user.npmrc"
: > "$fixtures/empty-global.npmrc"
free -m > "$evidence/01-host-memory.txt"
sudo -n docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' > "$evidence/01-host-containers.txt"
sudo -n docker run -d --name "$container" --user 1001:1001 --cpus=0.25 --memory=2g --pids-limit=128 \
  --network=none --read-only --tmpfs /tmp:rw,size=256m --cap-drop=ALL --security-opt=no-new-privileges \
  --mount type=bind,src="$source_dir",dst=/work \
  --mount type=bind,src="$fixtures",dst=/fixtures \
  --mount type=bind,src="$evidence",dst=/evidence \
  -e HOME=/fixtures/home -e NODE_PATH= -e NODE_OPTIONS= \
  -e NPM_CONFIG_USERCONFIG=/fixtures/empty-user.npmrc \
  -e NPM_CONFIG_GLOBALCONFIG=/fixtures/empty-global.npmrc \
  -e NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
  -w /work/extensions/src/mcp-app "$image" sleep infinity > "$evidence/01-container.id"
sudo -n docker inspect "$container" --format '{{.Image}} {{.Config.User}} {{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{.HostConfig.NetworkMode}} {{json .NetworkSettings.Ports}} {{json .Mounts}}' > "$evidence/01-container-policy.txt"
set +e
sudo -n docker exec "$container" sh -c '
  set -eu
  node --version
  pnpm --version
  pnpm install --ignore-workspace --frozen-lockfile --offline --ignore-scripts --store-dir=/fixtures/pnpm-store --reporter=append-only
  ln -s /work/extensions/src/mcp-app/node_modules /work/node_modules
  sha256sum pnpm-lock.yaml
  pnpm list --depth 0 --json > /evidence/02-resolved-packages.json
' > "$evidence/02-frozen-install.log" 2>&1
offline=$?
printf '%s\n' "$offline" > "$evidence/02-frozen-install.exit"
sudo -n docker exec "$container" pnpm run typecheck > "$evidence/03-typecheck.log" 2>&1
types=$?
printf '%s\n' "$types" > "$evidence/03-typecheck.exit"
sudo -n docker exec "$container" pnpm run test > "$evidence/04-tests.log" 2>&1
tests=$?
printf '%s\n' "$tests" > "$evidence/04-tests.exit"
sudo -n docker exec "$container" node /cleanup/node_modules/prettier/bin/prettier.cjs --config /fixtures/format-options.json \
  --check "/work/extensions/src/mcp-app/**/*.ts" "/work/extensions/src/mcp-app/**/*.json" \
  /work/extensions/src/mcp-app/server/README.md /work/docs/extensions/plans/MCP_APP_ADOPTION_20261115.md > "$evidence/05-format.log" 2>&1
format=$?
printf '%s\n' "$format" > "$evidence/05-format.exit"
set -e
echo "frozen=$offline types=$types tests=$tests format=$format"
tail -30 "$evidence/03-typecheck.log"
tail -40 "$evidence/04-tests.log"
tail -20 "$evidence/05-format.log"
if [ "$offline" != 0 ] || [ "$types" != 0 ] || [ "$tests" != 0 ] || [ "$format" != 0 ]; then exit 1; fi

