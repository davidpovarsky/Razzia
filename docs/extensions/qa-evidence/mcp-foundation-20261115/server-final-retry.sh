#!/bin/bash
set -euo pipefail
base=/home/ubuntu/tadazz-hq-qa-20261115
pin=c4dc04deb2d80953e13fe1771686c1e00e293048c66f8b7a0365879643ee8d68
evidence="$base/evidence/mcp-foundation-$pin"
container=tadazz-hq-mcp-foundation-20261115
sudo -n docker inspect "$container" --format '{{.HostConfig.NetworkMode}} {{json .NetworkSettings.Networks}}' > "$evidence/07-network-proof.txt"
set +e
sudo -n docker exec "$container" sh -c '
  set -eu
  test ! -s /fixtures/empty-user.npmrc
  test ! -s /fixtures/empty-global.npmrc
  pnpm install --ignore-workspace --frozen-lockfile --offline --ignore-scripts --store-dir=/fixtures/pnpm-store --reporter=append-only
  if test -e /work/node_modules || test -L /work/node_modules; then
    test ! -e /fixtures/previous-root-modules
    mv /work/node_modules /fixtures/previous-root-modules
  fi
  ln -s /work/extensions/src/mcp-app/node_modules /work/node_modules
  sha256sum pnpm-lock.yaml
' > "$evidence/07-frozen-retry.log" 2>&1
offline=$?
printf '%s\n' "$offline" > "$evidence/07-frozen-retry.exit"
set -e
if [ "$offline" != 0 ]; then tail -35 "$evidence/07-frozen-retry.log"; exit "$offline"; fi
set +e
sudo -n docker exec "$container" node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > "$evidence/08-typecheck.log" 2>&1
types=$?
printf '%s\n' "$types" > "$evidence/08-typecheck.exit"
sudo -n docker exec "$container" sh -c 'node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json --test --test-concurrency=1 tests/server/*.test.ts' > "$evidence/09-tests.log" 2>&1
tests=$?
printf '%s\n' "$tests" > "$evidence/09-tests.exit"
sudo -n docker exec "$container" node /cleanup/node_modules/prettier/bin/prettier.cjs --config /fixtures/format-options.json \
  --check "/work/extensions/src/mcp-app/**/*.ts" "/work/extensions/src/mcp-app/**/*.json" \
  /work/extensions/src/mcp-app/server/README.md /work/docs/extensions/plans/MCP_APP_ADOPTION_20261115.md > "$evidence/10-format.log" 2>&1
format=$?
printf '%s\n' "$format" > "$evidence/10-format.exit"
set -e
python3 "$evidence/source-recheck.py" "$base/source/mcp-foundation-$pin/app" "$evidence/11-final-source-recheck.json"
echo "frozen=$offline types=$types tests=$tests format=$format"
head -15 "$evidence/08-typecheck.log"
tail -35 "$evidence/09-tests.log"
tail -12 "$evidence/10-format.log"
if [ "$types" != 0 ] || [ "$tests" != 0 ] || [ "$format" != 0 ]; then exit 1; fi

