#!/usr/bin/env bash
set -eu
if [ "${TADAZZ_REMOTE_QA:-}" != "1" ] || [ "$PWD" != "/cleanup" ]; then exit 2; fi
for script in ui:catalog ui:catalog:preview; do
  label=${script//:/-}
  if timeout 10s pnpm --dir extensions "$script" --host 0.0.0.0 > "/evidence/phase-05-$label-rejected.log" 2>&1; then
    echo "FAIL: catalog accepted a public bind"
    exit 1
  fi
  if ! grep -q "Catalog must bind to loopback only" "/evidence/phase-05-$label-rejected.log"; then
    echo "FAIL: command failed for an unrelated reason"
    exit 1
  fi
  echo "PASS: $script rejects public bind before starting"
done
