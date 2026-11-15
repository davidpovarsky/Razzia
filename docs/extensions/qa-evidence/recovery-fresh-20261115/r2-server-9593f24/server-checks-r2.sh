#!/bin/sh
set -eu
root=/home/ubuntu/tadazz-hq-qa-20261115
sha=9593f24f287f2e404f387f6359e89453cd8a971e
src="$root/source/recovery-r2-$sha"
evidence="$root/evidence/recovery-r2-$sha"
runner=tadazz-hq-recovery-r2-20261115
test -e "$evidence/inputs-after-tests.json"
test ! -e "$evidence/types-r2.exit"
python3 "$src/freeze-aux.py" "$src/freeze-aux.tar.gz" "$src/freeze-aux-manifest.json" "$root/fixtures/recovery-r2-$sha/work" extract > "$evidence/freeze-aux-before.json"
cp "$src/tsconfig.server-r2.json" "$evidence/tsconfig.server-r2.json"
set +e
sudo -n docker exec -w /work "$runner" node extensions/node_modules/typescript/bin/tsc -p /qa/tsconfig.server-r2.json > "$evidence/types-r2.log" 2>&1
printf '%s\n' "$?" > "$evidence/types-r2.exit"
sudo -n docker exec -w /work "$runner" node node_modules/prettier/bin/prettier.cjs --check extensions/src/server/media-library.ts extensions/src/server/media-library-recovery.test.ts extensions/src/server/storage.test.ts extensions/src/server/storage/physical-binding.ts extensions/src/server/storage/native-recovery-adapter.ts extensions/src/server/storage/recovery-state.ts extensions/src/server/storage/sidecar.ts extensions/src/server/storage/journal.ts extensions/src/server/storage/service.ts extensions/src/server/storage/native-binding.test.ts extensions/src/server/storage/native-binding-r2.test.ts extensions/src/server/storage/native-binding-child.ts extensions/src/server/storage/native-binding-fixture.ts extensions/src/server/storage/package-stage-r2.test.ts > "$evidence/format-r2.log" 2>&1
printf '%s\n' "$?" > "$evidence/format-r2.exit"
sudo -n docker exec -w /work "$runner" node extensions/qa/tds-boundary.mjs --files-only > "$evidence/freeze-r2.log" 2>&1
printf '%s\n' "$?" > "$evidence/freeze-r2.exit"
set -e
python3 "$src/freeze-aux.py" "$src/freeze-aux.tar.gz" "$src/freeze-aux-manifest.json" "$root/fixtures/recovery-r2-$sha/work" verify > "$evidence/freeze-aux-after.json"
python3 "$src/verify-inputs.py" "$root/fixtures/recovery-r2-$sha/work" "$src/source-manifest.json" > "$evidence/inputs-after-checks.json"
printf '%s\n' CHECKS_COMPLETE
cat "$evidence/types-r2.exit" "$evidence/format-r2.exit" "$evidence/freeze-r2.exit"
