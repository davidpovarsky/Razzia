#!/bin/bash
# PREPARED ONLY. Launcher/cache wiring is deliberately absent until root's pin.
set -euo pipefail
umask 077
test "${MCP_VERIFIED_PUBLIC_CACHE_READY:-}" = yes || exit 78
test "${MCP_MAX_NEW_DISK_BYTES:-}" = 67108864 || exit 78
test "${MCP_OWN_RAM_ROOT:-}" = /ram || exit 78
test -n "${MCP_OWN_OFFLINE_STORE:-}" || exit 78
case "$MCP_OWN_OFFLINE_STORE" in /ram/*) ;; *) exit 78;; esac
test -f /evidence/cache-pin.json || exit 78
test -f /evidence/full-input-manifest.json || exit 78
test -f /evidence/source-before.json || exit 78
test -f /evidence/read-only-cache-mount-proof.json || exit 78
test -n "${MCP_FORMATTER_CLI:-}" || exit 78
test -f "$MCP_FORMATTER_CLI" || exit 78

export HOME=/ram/home TMPDIR=/ram/tmp
export XDG_CACHE_HOME=/ram/home/.cache XDG_DATA_HOME=/ram/home/.local/share
export XDG_STATE_HOME=/ram/home/.local/state PNPM_HOME=/ram/pnpm
export npm_config_cache=/ram/npm-cache
export NODE_OPTIONS= NODE_PATH=
export NPM_CONFIG_USERCONFIG=/ram/empty-user.npmrc
export NPM_CONFIG_GLOBALCONFIG=/ram/empty-global.npmrc
export NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
export NO_UPDATE_NOTIFIER=1
mkdir -p "$HOME" "$TMPDIR"
: > "$NPM_CONFIG_USERCONFIG"
: > "$NPM_CONFIG_GLOBALCONFIG"
private=/ram/work/extensions/src/mcp-app
test -d "$private"
test ! -L "$private"
cd "$private"

# Logs have individual 1MiB caps; enclosing launcher must meter ALL new disk,
# including metadata/evidence, against64MiB. Source/dependencies live in tmpfs.
run_phase() {
  local name=$1
  shift
  local result
  set +e
  (ulimit -f 1024; "$@") > "/evidence/$name.log" 2>&1
  result=$?
  set -e
  printf '%s\n' "$result" > "/evidence/$name.exit"
  return "$result"
}

node --version > /evidence/node.version
pnpm --version > /evidence/pnpm.version
run_phase 01-resolve pnpm install --ignore-workspace --lockfile-only --offline --ignore-scripts \
  --store-dir="$MCP_OWN_OFFLINE_STORE" --reporter=append-only
cp pnpm-lock.yaml /evidence/generated-private-pnpm-lock.yaml
sha256sum pnpm-lock.yaml > /evidence/generated-private-lock.sha256
run_phase 02-install pnpm install --ignore-workspace --frozen-lockfile --offline --ignore-scripts \
  --store-dir="$MCP_OWN_OFFLINE_STORE" --reporter=append-only

# Reinstall only this new RAM directory, never a shared/cache node_modules.
test -d "$private/node_modules"
test ! -L "$private/node_modules"
test "$(realpath "$private/node_modules")" = "$private/node_modules"
rm -rf -- "$private/node_modules"
run_phase 03-reinstall pnpm install --ignore-workspace --frozen-lockfile --offline --ignore-scripts \
  --store-dir="$MCP_OWN_OFFLINE_STORE" --reporter=append-only
test ! -e /ram/work/node_modules
test ! -L /ram/work/node_modules
ln -s /ram/work/extensions/src/mcp-app/node_modules /ram/work/node_modules

# A failure in one functional check is retained while independent checks run.
types=0
first_party=0
sdk=0
format=0
run_phase 04-typecheck node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json || types=$?
run_phase 05-first-party node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json \
  --test --test-concurrency=1 tests/first-party/*.nodecheck.ts || first_party=$?
run_phase 06-sdk pnpm run test || sdk=$?
run_phase 07-format node "$MCP_FORMATTER_CLI" --config /evidence/format-options.json --check \
  'first-party/**/*.ts' 'first-party/**/*.md' 'tests/first-party/**/*.ts' \
  'tests/first-party/**/*.mjs' package.json tsconfig.json || format=$?
get_checks=0
tracer=no
if command -v strace >/dev/null 2>&1; then
  if run_phase 08-tracer-probe strace -qq -o /evidence/tracer-probe.strace -e trace=none true; then tracer=yes; fi
else
  printf '%s\n' 'strace unavailable; precise watch/snapshot observations only, NO syscall-proof claim' > /evidence/08-tracer-unavailable.txt
fi
for mode in absent regular hot-journal; do
  if [ "$tracer" = yes ]; then
    run_phase "09-get-$mode" strace -f -yy -qq -s 160 -o "/evidence/09-get-$mode.strace" \
      -e trace=%file,write,writev,pwrite64,pwritev,pwritev2,mmap,msync,fsync,fdatasync,ftruncate,close \
      node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json /evidence/get-observer.mjs "$mode" || get_checks=$?
    run_phase "10-analyze-$mode" node /evidence/analyze-get-trace.mjs \
      "/evidence/09-get-$mode.strace" "/evidence/09-get-$mode.log" "/evidence/10-get-$mode-analysis.json" || get_checks=$?
  else
    run_phase "09-get-$mode" node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json \
      /evidence/get-observer.mjs "$mode" || get_checks=$?
  fi
done
source_check=0
run_phase 11-source node /evidence/check-source.mjs /evidence/full-input-manifest.json \
  /ram/work /evidence/source-after.json /evidence/generated-private-pnpm-lock.yaml || source_check=$?
printf 'typecheck=%s first_party=%s sdk=%s format=%s get_checks=%s tracer=%s source=%s\n' \
  "$types" "$first_party" "$sdk" "$format" "$get_checks" "$tracer" "$source_check" > /evidence/functional-exits.txt
test "$types" = 0 && test "$first_party" = 0 && test "$sdk" = 0 && test "$format" = 0 && test "$get_checks" = 0 && test "$source_check" = 0
