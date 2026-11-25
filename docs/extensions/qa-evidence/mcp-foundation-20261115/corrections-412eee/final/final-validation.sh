#!/bin/bash
set -euo pipefail
base=/home/ubuntu/tadazz-hq-qa-20261115
pin=$1
test ${#pin} = 64
case "$pin" in *[!a-f0-9]*) exit 10;; esac
name=mcp-corrected-$pin
source_dir=$base/source/$name/app
fixtures=$base/fixtures/$name
evidence=$base/evidence/$name
old=$base/fixtures/mcp-foundation-c4dc04deb2d80953e13fe1771686c1e00e293048c66f8b7a0365879643ee8d68
container=tadazz-hq-mcp-corrected-20261115
image=sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647
test "$(sha256sum "$base/source/$name/final-input-manifest.json" | cut -d' ' -f1)" = "$pin"
test "$(sudo -n docker inspect tadazz-hq-mcp-review-20261115 --format '{{.State.Running}}')" = false
test "$(sudo -n docker inspect tadazz-hq-mcp-corrected-prep-20261115 --format '{{.State.Running}}')" = false
if sudo -n docker inspect "$container" >/dev/null 2>&1; then exit 11; fi
mkdir "$fixtures/home"
mkdir "$fixtures/home/.cache"
cp -a "$old/pnpm-store" "$fixtures/pnpm-store"
cp -a "$old/home/.cache/pnpm" "$fixtures/home/.cache/pnpm"
cp "$old/format-options.json" "$fixtures/format-options.json"
: > "$fixtures/empty-user.npmrc"
: > "$fixtures/empty-global.npmrc"
sudo -n docker run -d --name "$container" --user 1001:1001 --cpus=0.25 --memory=2g --pids-limit=128 \
  --network=none --read-only --tmpfs /tmp:rw,size=256m --cap-drop=ALL --security-opt=no-new-privileges \
  --mount type=bind,src="$source_dir",dst=/work --mount type=bind,src="$fixtures",dst=/fixtures \
  --mount type=bind,src="$evidence",dst=/evidence -e HOME=/fixtures/home -e NODE_PATH= -e NODE_OPTIONS= \
  -e NPM_CONFIG_USERCONFIG=/fixtures/empty-user.npmrc -e NPM_CONFIG_GLOBALCONFIG=/fixtures/empty-global.npmrc \
  -e NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ -w /work/extensions/src/mcp-app "$image" sleep infinity > "$evidence/container.id"
sudo -n docker inspect "$container" --format '{{.Image}} {{.Config.User}} {{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{.HostConfig.NetworkMode}} {{json .Mounts}}' > "$evidence/container-policy.txt"
set +e
sudo -n docker exec "$container" sh -c 'set -eu; node --version; pnpm --version; pnpm install --ignore-workspace --frozen-lockfile --offline --ignore-scripts --store-dir=/fixtures/pnpm-store --reporter=append-only; ln -s /work/extensions/src/mcp-app/node_modules /work/node_modules; sha256sum pnpm-lock.yaml' > "$evidence/01-install.log" 2>&1
install=$?
printf '%s\n' "$install" > "$evidence/01-install.exit"
set -e
if [ "$install" != 0 ]; then tail -30 "$evidence/01-install.log"; exit "$install"; fi
set +e
sudo -n docker exec "$container" node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > "$evidence/02-typecheck.log" 2>&1
types=$?
printf '%s\n' "$types" > "$evidence/02-typecheck.exit"
sudo -n docker exec "$container" sh -c 'node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json --test --test-concurrency=1 tests/server/*.test.ts' > "$evidence/03-tests.log" 2>&1
tests=$?
printf '%s\n' "$tests" > "$evidence/03-tests.exit"
sudo -n docker exec "$container" node /cleanup/node_modules/prettier/bin/prettier.cjs --config /fixtures/format-options.json --check '/work/extensions/src/mcp-app/**/*.ts' '/work/extensions/src/mcp-app/**/*.json' /work/extensions/src/mcp-app/server/README.md > "$evidence/04-format.log" 2>&1
format=$?
printf '%s\n' "$format" > "$evidence/04-format.exit"
set -e
python3 "$evidence/recheck.py" "$base/source/$name/final-input-manifest.json" "$source_dir" "$evidence/05-source-recheck.json"
echo "frozen=$install types=$types tests=$tests format=$format"
tail -20 "$evidence/02-typecheck.log"
tail -36 "$evidence/03-tests.log"
tail -8 "$evidence/04-format.log"
if [ "$types" != 0 ] || [ "$tests" != 0 ] || [ "$format" != 0 ]; then exit 1; fi
