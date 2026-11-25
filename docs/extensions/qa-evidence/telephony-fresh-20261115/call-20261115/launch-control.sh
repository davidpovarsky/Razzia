#!/usr/bin/env bash
set -euo pipefail
qa=/home/ubuntu/tadazz-hq-qa-20261115
sha=7f53a23fad567c3e0e1ea3c5228694871e022958
input="$qa/artifacts/phone-call-$sha"
delta="$qa/source/phone-auth-$sha"
evidence="$qa/evidence/phone-call-7f53a23-attempt01"
name=phone-call-7f53a23-attempt01
base="$qa/source/phone-s02-003cf88b6cba19989388dca20efcfaa01cc8f9ad"
free=$(df -B1 --output=avail "$qa" | tail -1 | tr -d ' ')
((free>=2248146944))
[[ $(awk '/MemAvailable:/{print $2}' /proc/meminfo) -ge 1048576 ]]
mkdir -m700 "$evidence"
python3 "$input/safe-extract.py" "$input/source.tar" "$input/source-manifest.json" c80ff9106c1369d19d3764187a8ca80fa7fcc5d03678d5b826a6d5f873f11ba0 eea2c2fedf8112cb5e36683cf281f091afbc96105cace59d078f8ab82d6922e7 "$delta" > "$evidence/extraction.json"
ln -s /work/extensions/node_modules "$delta/node_modules"
ln -s /work/package.json "$delta/package.json"
sudo -n python3 - "$base" "$delta" <<'PY'
import pathlib,sys,json
base,delta=map(pathlib.Path,sys.argv[1:])
server=delta/'extensions/src/server'
view=delta/'server-view'
view.mkdir(mode=0o700)
records=[]
for entry in (base/'extensions/src/server').iterdir():
    target=server/entry.name
    if not target.exists(): target.symlink_to('/base/extensions/src/server/'+entry.name, target_is_directory=entry.is_dir())
for entry in server.iterdir():
    target='/delta/extensions/src/server/'+entry.name if not entry.is_symlink() else str(entry.readlink())
    (view/entry.name).symlink_to(target)
    records.append({'name':entry.name,'target':target})
(delta/'server-view-manifest.json').write_text(json.dumps(records,indent=2)+'\n')
PY
sudo -n docker create --name "$name" --network none --read-only --cpus .25 --memory 1g --memory-swap 1g --pids-limit 96 --security-opt no-new-privileges --cap-drop ALL --cap-add DAC_OVERRIDE --log-driver none --tmpfs /fixtures:rw,noexec,nosuid,size=32m,mode=700 --tmpfs /tmp:rw,noexec,nosuid,size=16m -v "$base:/work:ro" -v "$base:/base:ro" -v "$delta:/delta:ro" -v "$delta/server-view:/work/extensions/src/server:ro" -v "$delta/packages/socket/src/services/game/index.ts:/work/packages/socket/src/services/game/index.ts:ro" -v "$delta/packages/socket/src/api/routes/games.ts:/work/packages/socket/src/api/routes/games.ts:ro" -v "$delta/packages/socket/src/api/extensions/game-routes.ts:/work/packages/socket/src/api/extensions/game-routes.ts:ro" -v "$qa/fixtures/phone-s02-003cf88b6cba19989388dca20efcfaa01cc8f9ad/input:/input:ro" -v "$input:/input-auth:ro" -v "$evidence:/evidence:rw" -e PHONE_REMAINING_RUN=isolated-actual-authority -e PHONE_REVIEW_SHA="$sha" -e GOMAXPROCS=1 -w /work --entrypoint bash tadazz:design-system-qa-20261110 /delta/docs/extensions/qa-evidence/telephony-fresh-20261115/call-source/run.sh > "$evidence/container-id.txt"
sudo -n docker inspect "$name" > "$evidence/container-before.json"
sudo -n docker start -a "$name" > "$evidence/startup.log" 2>&1
echo "$name"