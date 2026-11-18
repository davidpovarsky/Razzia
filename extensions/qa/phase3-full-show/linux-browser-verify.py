"""Run the exact built V3 widget in fresh bounded Chromium/WebKit QA.

Reuses the existing local image and read-only source/dependency/browser caches.
No network, published ports, customer mount, installs, old restart or deletion.
The 900s browser ceiling covers four base scenarios (one measured at ~83s), plus bounded
native transport, responsive and eleven renderer fixtures per engine/family.
"""
import json
import pathlib
import re
import subprocess
import sys
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT / "docs/extensions/plans/phase3-takeover-20261117"
if len(sys.argv) != 2 or not re.fullmatch(r"tadazz-codex-[a-f0-9]{12}-[a-f0-9]{8}", sys.argv[1]):
    raise SystemExit("Pass the qualified source run directory name")
source_run = sys.argv[1]
inputs = json.loads((BASE / source_run / "input-manifest.json").read_text(encoding="utf8"))
run = f"tadazz-codex-fullshow-{inputs['sha'][:12]}-{uuid.uuid4().hex[:8]}"
evidence = BASE / run
evidence.mkdir()
config = {"sha": inputs["sha"], "manifest": inputs["files"], "sourceRun": source_run, "run": run}
REMOTE = r'''
import hashlib,json,pathlib,shutil,subprocess,time
c=CONFIG
old="tadazz-phase2-20261116"
facts=json.loads(subprocess.check_output(["docker","inspect",old]))[0]
assert facts["State"]["Running"] and facts["HostConfig"]["NetworkMode"]=="none"
mount=next(m for m in facts["Mounts"] if m["Destination"]=="/evidence")
assert mount["Type"]=="bind" and mount["RW"]
host_evidence=pathlib.Path(mount["Source"])
source=host_evidence/c["sourceRun"]/"source"
assert source.is_dir() and not source.is_symlink()
owned=host_evidence/c["run"]
owned.mkdir(mode=0o700,exist_ok=False)
pid=facts["State"]["Pid"]
old_root=f"/proc/{pid}/root"
assert (pathlib.Path(old_root)/"tmp/phase3-999ed90c/deps/node_modules/@modelcontextprotocol/server/package.json").is_file()
rootfs=pathlib.Path("/var/lib/docker/rootfs/overlayfs")/facts["Id"]
assert (rootfs/"cleanup").is_dir() and (rootfs/"root/.cache/ms-playwright").is_dir()
# runc refuses magic /proc links as bind sources. Read the small SDK cache into
# this run's owned evidence, and bind the real existing overlay root read-only.
assert shutil.disk_usage(owned).free > 160*1024*1024
original_deps=pathlib.Path(old_root)/"tmp/phase3-999ed90c/deps"
def dependency_hashes(root):
    return {p.relative_to(root).as_posix(): ('link:'+p.readlink().as_posix() if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest()) for p in root.rglob('*') if p.is_symlink() or p.is_file()}
expected_deps=dependency_hashes(original_deps)
deps=next((p for p in sorted(host_evidence.glob('tadazz-codex-browser-*/mcp-deps')) if p.is_dir() and not p.is_symlink() and dependency_hashes(p)==expected_deps),None)
if deps is None:
    deps=owned/"mcp-deps"
    shutil.copytree(original_deps,deps,symlinks=True)
assert dependency_hashes(deps)==expected_deps
command=["docker","run","--detach","--pull=never","--init","--read-only","--name",c["run"],"--network","none","--cpus","1","--memory","2g","--memory-swap","2g","--pids-limit","512","--shm-size","256m","--tmpfs","/tmp:rw,nosuid,nodev,size=536870912", "--label","codex.thread=01a1e9e9-ad5b-77a3-bafe-bcedce32246a"]
for origin,target,readonly in [(str(source),"/source",True),(str(owned),"/evidence",False),(str(rootfs/"cleanup"),"/cleanup",True),(str(deps),"/tmp/phase3-999ed90c/deps",True),(str(rootfs/"root/.cache/ms-playwright"),"/root/.cache/ms-playwright",True)]:
    command += ["--mount",f"type=bind,source={origin},target={target}" + (",readonly" if readonly else "")]
command += [facts["Image"],"sleep","infinity"]
created=subprocess.run(command,capture_output=True,text=True)
if created.returncode:
    raise RuntimeError("Fresh QA start failed: "+created.stderr)
container=c["run"]
hash_code="import hashlib,json,pathlib,sys;root=pathlib.Path('/source');paths=json.load(sys.stdin);print(json.dumps({p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}))"
def hashes():
    result=subprocess.run(["docker","exec","-i",container,"python3","-c",hash_code],input=json.dumps(list(c["manifest"])),capture_output=True,text=True,check=True)
    return json.loads(result.stdout)
try:
    before=hashes()
    assert before==c["manifest"],"Fresh browser source differs from committed input"
    widget=source/"extensions/src/mcp-app/widget/dist"
    def widget_hashes():
        return {p.relative_to(widget).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in widget.rglob("*") if p.is_file()}
    widget_before=widget_hashes()
    artifact=json.loads((widget/"full-show-artifact.json").read_text())
    assert hashlib.sha256((widget/"full-show.html").read_bytes()).hexdigest()==artifact["sha256"]
    for item in artifact["physicalSources"]+artifact["publicAssets"]:
        assert item["path"] in c["manifest"] and c["manifest"][item["path"]]==item["sha256"]
    argv=["docker","exec","-w","/source","-e","TMPDIR=/tmp","-e","HOME=/tmp","-e","PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright","-e","TSX_DISABLE_CACHE=1","-e","NODE_OPTIONS=--max-old-space-size=1024","-e","TADAZZ_FULL_SHOW_EVIDENCE=/evidence/full-show","-e","TADAZZ_FULL_SHOW_SOURCE_SHA="+c["sha"],"-e","TADAZZ_FULL_SHOW_BROWSERS=chromium,webkit",container,"nice","-n","19","taskset","-c","0","timeout","-k","5","900","node","/cleanup/extensions/node_modules/tsx/dist/cli.mjs","--tsconfig","tsconfig.json","extensions/qa/phase3-full-show/browser-verify.mjs"]
    started=time.time()
    result=subprocess.run(argv,capture_output=True,text=True,timeout=915)
    after=hashes()
    widget_after=widget_hashes()
    inner_path=owned/"full-show/receipt.json"
    inner=json.loads(inner_path.read_text()) if inner_path.is_file() else None
    assert inner is not None, "Full-show browser receipt missing"
    assert inner["artifactSha256"]==artifact["sha256"]
    assert inner["rendererBuildId"]==artifact["rendererBuildId"]
    engines={entry["name"].split(" / ")[0] for entry in inner["entries"]}
    assert engines=={"chromium","webkit"}, "Both browser engines are required"
    assert inner["entries"] and all(entry["status"]=="PASS" for entry in inner["entries"]), "A full-show browser gate failed"
    assert not inner["errors"]
    receipt={"sha":c["sha"],"container":container,"network":"none","sourceReadOnly":True,"sourceFileCount":len(before),"allSourceHashesVerifiedBeforeAfter":before==after==c["manifest"],"widgetManifestSha256":widget_before["full-show-artifact.json"],"widgetHtmlSha256":artifact["sha256"],"widgetArtifacts":widget_before,"allWidgetHashesVerifiedBeforeAfter":widget_before==widget_after,"fullShow":inner,"sdkCacheFileCount":len(expected_deps),"sdkCacheHashesVerifiedBeforeAfter":dependency_hashes(deps)==expected_deps,"sdkCacheManifestSha256":hashlib.sha256(json.dumps(expected_deps,sort_keys=True).encode()).hexdigest(),"command":argv,"exit":result.returncode,"seconds":round(time.time()-started,3),"stdout":result.stdout,"stderr":result.stderr,"evidenceHostDirectory":str(owned),"customerMountAccessed":False,"productionChanged":False}
    print(json.dumps(receipt,indent=2))
finally:
    subprocess.run(["docker","stop","--time","10",container],capture_output=True,check=True)
'''
remote = REMOTE.replace("c=CONFIG", "c=" + repr(config))
result = subprocess.run(["ssh", "-i", str(pathlib.Path.home()/".ssh/tadazz_oracle_2026"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "ubuntu@132.145.25.168", "sudo -n python3 -"], input=remote, capture_output=True, text=True, encoding="utf8", timeout=960)
(evidence / "controller.stdout.log").write_text(result.stdout, encoding="utf8", newline="\n")
(evidence / "controller.stderr.log").write_text(result.stderr, encoding="utf8", newline="\n")
if result.returncode:
    print(result.stderr[-4000:])
    raise SystemExit(result.returncode)
receipt=json.loads(result.stdout)
(evidence / "receipt.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf8",newline="\n")
print(json.dumps({"sha":receipt["sha"],"evidence":str(evidence),"exit":receipt["exit"],"seconds":receipt["seconds"],"allSourceHashesVerifiedBeforeAfter":receipt["allSourceHashesVerifiedBeforeAfter"]},indent=2))
raise SystemExit(0 if receipt["exit"]==0 and receipt["allSourceHashesVerifiedBeforeAfter"] and receipt["sdkCacheHashesVerifiedBeforeAfter"] and receipt["allWidgetHashesVerifiedBeforeAfter"] else 1)
