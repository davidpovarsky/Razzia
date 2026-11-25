#!/bin/bash
set -euo pipefail
base=/home/ubuntu/tadazz-hq-qa-20261115
pin=76634efa3162227a54c7b0cedaf6e28c0facab55f0e127a8b469a8e4b9f97ffc
evidence="$base/evidence/mcp-foundation-$pin"
container=tadazz-hq-mcp-foundation-20261115
sudo -n docker exec -u 1001:1001 "$container" sh -c '
  set -eu
  pnpm list --depth 0 --json > /evidence/04-resolved-packages.json
  sha256sum pnpm-lock.yaml > /evidence/04-lock-before.sha256
  for package in @modelcontextprotocol/server@2.4.0 @modelcontextprotocol/client@2.4.0 @modelcontextprotocol/core@2.4.0 @modelcontextprotocol/ext-apps@2.1.0; do
    printf "%s\n" "$package"
    pnpm view "$package" dist peerDependencies --json --registry=https://registry.npmjs.org/
  done > /evidence/04-public-registry-provenance.jsonl
'
sudo -n docker network disconnect bridge "$container"
sudo -n docker inspect "$container" --format '{{json .NetworkSettings.Networks}} {{json .NetworkSettings.Ports}}' > "$evidence/05-network-isolation.txt"
set +e
sudo -n docker exec -u 1001:1001 "$container" sh -c '
  set -eu
  pnpm install --ignore-workspace --frozen-lockfile --offline --ignore-scripts --store-dir=/fixtures/pnpm-store --reporter=append-only
  test ! -e /work/node_modules
  ln -s /work/extensions/src/mcp-app/node_modules /work/node_modules
  sha256sum pnpm-lock.yaml
' > "$evidence/05-frozen-offline.log" 2>&1
offline=$?
printf '%s\n' "$offline" > "$evidence/05-frozen-offline.exit"
sudo -n docker exec -u 1001:1001 "$container" pnpm run typecheck > "$evidence/06-typecheck.log" 2>&1
types=$?
printf '%s\n' "$types" > "$evidence/06-typecheck.exit"
sudo -n docker exec -u 1001:1001 "$container" pnpm run test > "$evidence/07-tests.log" 2>&1
tests=$?
printf '%s\n' "$tests" > "$evidence/07-tests.exit"
set -e
echo "offline=$offline typecheck=$types tests=$tests"
tail -55 "$evidence/06-typecheck.log"
tail -70 "$evidence/07-tests.log"
if [ "$offline" != 0 ] || [ "$types" != 0 ] || [ "$tests" != 0 ]; then exit 1; fi

