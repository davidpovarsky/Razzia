#!/usr/bin/env bash
set -euo pipefail
qa=/home/ubuntu/tadazz-hq-qa-20261115
sha=21f7b2d96bb2143038adab6ef07e0cb0f74d1d2d
input="$qa/artifacts/phone-invite-$sha"
delta="$qa/source/phone-auth-$sha"
evidence="$qa/evidence/phone-invite-21f7b2d-attempt01"
name=phone-invite-21f7b2d-attempt01
base="$qa/source/phone-s02-003cf88b6cba19989388dca20efcfaa01cc8f9ad"
free=$(df -B1 --output=avail "$qa" | tail -1 | tr -d ' ')
((free>=2248146944))
[[ $(awk '/MemAvailable:/{print $2}' /proc/meminfo) -ge 1048576 ]]
mkdir -m700 "$evidence"
python3 "$input/safe-extract.py" "$input/source.tar" "$input/source-manifest.json" 7ec7ba108b2598b638b67fc101f0f41d976a7c85a4c514ee2ca3fd478dde6888 89902e33be901241fe9293d95da07c19985a368f7c08a485c698e17a71fd2097 "$delta" > "$evidence/extraction.json"
ln -s /work/extensions/node_modules "$delta/node_modules"
ln -s /work/package.json "$delta/package.json"
sudo -n python3 - "$base" "$delta" <<'PY'
import pathlib,sys,json
base,delta=map(pathlib.Path,sys.argv[1:])
server=delta/'extensions/src/server'
def fill(old,new):
    for entry in old.iterdir():
        target=new/entry.name
        if target.exists() or target.is_symlink():
            if entry.is_dir() and target.is_dir() and not target.is_symlink(): fill(entry,target)
        else:
            target.symlink_to('/base/'+str(entry.relative_to(base)),target_is_directory=entry.is_dir())
fill(base/'extensions/src/server',server)
core=delta/'extensions/src/core'
assert not core.exists()
core.symlink_to('/work/extensions/src/core',target_is_directory=True)
telephony=delta/'extensions/src/telephony/index.ts'
assert not telephony.exists()
telephony.symlink_to('/work/extensions/src/telephony/index.ts')
view=delta/'server-view'
view.mkdir(mode=0o700)
records=[]
for entry in server.iterdir():
    target='/delta/extensions/src/server/'+entry.name if not entry.is_symlink() else str(entry.readlink())
    (view/entry.name).symlink_to(target)
    records.append({'name':entry.name,'target':target})
(delta/'server-view-manifest.json').write_text(json.dumps(records,indent=2)+'\n')
PY
sudo -n docker create --name "$name" --network none --read-only --cpus .25 --memory 1g --memory-swap 1g --pids-limit 96 --security-opt no-new-privileges --cap-drop ALL --cap-add DAC_OVERRIDE --log-driver none --tmpfs /fixtures:rw,noexec,nosuid,size=32m,mode=700 --tmpfs /tmp:rw,noexec,nosuid,size=16m -v "$base:/work:ro" -v "$base:/base:ro" -v "$delta:/delta:ro" -v "$delta/server-view:/work/extensions/src/server:ro" -v "$delta/packages/socket/src/services/game/index.ts:/work/packages/socket/src/services/game/index.ts:ro" -v "$delta/packages/socket/src/services/game/player-manager.ts:/work/packages/socket/src/services/game/player-manager.ts:ro" -v "$delta/packages/socket/src/api/routes/games.ts:/work/packages/socket/src/api/routes/games.ts:ro" -v "$delta/packages/socket/src/api/extensions/game-routes.ts:/work/packages/socket/src/api/extensions/game-routes.ts:ro" -v "$qa/fixtures/phone-s02-003cf88b6cba19989388dca20efcfaa01cc8f9ad/input:/input:ro" -v "$input:/input-auth:ro" -v "$evidence:/evidence:rw" -e PHONE_REMAINING_RUN=isolated-actual-authority -e PHONE_REVIEW_SHA="$sha" -e GOMAXPROCS=1 -w /work --entrypoint bash tadazz:design-system-qa-20261110 /delta/docs/extensions/qa-evidence/telephony-fresh-20261115/invite-proof-source/run.sh > "$evidence/container-id.txt"
sudo -n docker inspect "$name" > "$evidence/container-before.json"
sudo -n docker start -a "$name" > "$evidence/startup.log" 2>&1
echo "$name"