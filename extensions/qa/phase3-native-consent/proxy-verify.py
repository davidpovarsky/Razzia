"""Focused precommit real-Nginx check over the exact qualified native source.

Transfers only the two new scoped files. Records their hashes separately from
the immutable base; this is not the final combined-SHA acceptance.
"""
import hashlib
import argparse
import json
import pathlib
import re
import subprocess
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT / "docs/extensions/plans/phase3-takeover-20261117"
parser = argparse.ArgumentParser()
parser.add_argument("--source-run", default="tadazz-codex-3741f5fa43b3-b739cd6a")
parser.add_argument("--immutable", action="store_true")
args = parser.parse_args()
source_run = args.source_run
assert re.fullmatch(r"tadazz-codex-[a-f0-9]{12}-[a-f0-9]{8}",source_run)
inputs = json.loads((BASE/source_run/"input-manifest.json").read_text(encoding="utf8"))
paths = ["extensions/deployment/nginx-mcp-routes.conf", "extensions/qa/phase3-native-consent/nginx-routing.nodecheck.ts"]
files = {p: (ROOT/p).read_text(encoding="utf8") for p in paths}
if args.immutable:
    assert inputs["sha"] == subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
    assert all(hashlib.sha256(body.encode()).hexdigest()==inputs["files"][p] for p,body in files.items())
run = f"tadazz-codex-proxy-{inputs['sha'][:12]}-{uuid.uuid4().hex[:8]}"
evidence = BASE/run
evidence.mkdir()
config = {"run": run, "sourceRun": source_run, "sha": inputs["sha"], "manifest": inputs["files"], "files": files, "immutable":args.immutable}
REMOTE = r'''
import hashlib,json,pathlib,subprocess,time
c=CONFIG
facts=json.loads(subprocess.check_output(['docker','inspect','tadazz-phase2-20261116']))[0]
assert facts['State']['Running'] and facts['HostConfig']['NetworkMode']=='none' and not facts['HostConfig']['PortBindings']
base=pathlib.Path('/home/ubuntu/tadazz-phase2-20261116/evidence')
source=base/c['sourceRun']/'source'
assert source.resolve()==source and source.is_dir()
before={p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}
assert before==c['manifest']
owned=base/c['run']
owned.mkdir(mode=0o700,exist_ok=False)
overlay=owned/'overlay'
for p,body in c['files'].items():
    target=overlay/p
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(body,encoding='utf8',newline='\n')
internal='/evidence/'+c['sourceRun']+'/source'
links={'extensions/src':internal+'/extensions/src','extensions/node_modules':'/cleanup/extensions/node_modules','node_modules':'/cleanup/node_modules','packages':internal+'/packages','package.json':internal+'/package.json','tsconfig.json':internal+'/tsconfig.json','extensions/qa/phase3-native-consent/harness.ts':internal+'/extensions/qa/phase3-native-consent/harness.ts','extensions/qa/phase3-native-consent/crypto-helpers.ts':internal+'/extensions/qa/phase3-native-consent/crypto-helpers.ts'}
for p,target in links.items():
    (overlay/p).symlink_to(target)
code='/evidence/'+c['run']+'/overlay'
fixture='/evidence/'+c['run']+'/fixtures'
(owned/'fixtures').mkdir(mode=0o700)
container=c['run']
image='sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346'
rootfs=pathlib.Path('/var/lib/docker/rootfs/overlayfs')/facts['Id']
deps=base/'tadazz-codex-browser-c4125d58a746-8e0c29d3/mcp-deps'
assert (rootfs/'cleanup').is_dir() and deps.is_dir() and not deps.is_symlink()
docker=['docker','run','--detach','--pull=never','--init','--read-only','--network','none','--cpus','1','--memory','1g','--memory-swap','1g','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,nodev,size=134217728','--name',container,'--label','codex.thread=01a1e9e9-ad5b-77a3-bafe-bcedce32246a']
for origin,target,readonly in [(str(source),internal,True),(str(owned),'/evidence/'+c['run'],False),(str(overlay),code,True),(str(rootfs/'cleanup'),'/cleanup',True),(str(deps),'/tmp/phase3-999ed90c/deps',True)]:
    docker+=['--mount','type=bind,source='+origin+',target='+target+(',readonly' if readonly else '')]
docker+=['--entrypoint','/bin/sleep',image,'infinity']
created=subprocess.run(docker,capture_output=True,text=True)
assert created.returncode==0,created.stderr
argv=['docker','exec','-w',code,'-e','TMPDIR='+fixture,'-e','TSX_DISABLE_CACHE=1','-e','NODE_OPTIONS=--max-old-space-size=1024',container,'nice','-n','19','timeout','-s','KILL','45','node','/cleanup/extensions/node_modules/tsx/dist/cli.mjs','--tsconfig',internal+'/tsconfig.json','--test',code+'/extensions/qa/phase3-native-consent/nginx-routing.nodecheck.ts']
# Alpine runner supplies the actual production Node/Nginx. No package install,
# customer mount, original-container changes or exposed port is involved.
started=time.time()
try:
    result=subprocess.run(argv,capture_output=True,text=True,timeout=55)
finally:
    subprocess.run(['docker','stop','--time','10',container],capture_output=True,check=True)
after={p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}
overlay_hashes={p:hashlib.sha256((overlay/p).read_bytes()).hexdigest() for p in c['files']}
expected={p:hashlib.sha256(b.encode()).hexdigest() for p,b in c['files'].items()}
print(json.dumps({'baseSha':c['sha'],'exactSourceSha':c['sha'] if c['immutable'] else None,'baseSourceCount':len(before),'baseHashesUnchanged':before==after==c['manifest'],'newFileHashes':overlay_hashes,'newFileHashesUnchanged':overlay_hashes==expected,'combinedImmutableGate':False,'runnerImage':image,'network':'none','command':argv,'exit':result.returncode,'seconds':round(time.time()-started,3),'stdout':result.stdout,'stderr':result.stderr,'productionChanged':False,'customerDataAccessed':False},indent=2))
'''
result = subprocess.run(["ssh", "-i", str(pathlib.Path.home()/".ssh/tadazz_oracle_2026"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "ubuntu@132.145.25.168", "sudo -n python3 -"], input=REMOTE.replace("c=CONFIG", "c="+repr(config)), capture_output=True, text=True, encoding="utf8", timeout=75)
(evidence/"controller.stderr.log").write_text(result.stderr,encoding="utf8",newline="\n")
(evidence/"controller.stdout.log").write_text(result.stdout,encoding="utf8",newline="\n")
if result.returncode:
    print(result.stderr)
    raise SystemExit(result.returncode)
receipt = json.loads(result.stdout)
(evidence/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf8",newline="\n")
print(json.dumps({k:receipt[k] for k in ["baseSha","baseHashesUnchanged","newFileHashesUnchanged","exit","seconds","stdout","stderr"]},indent=2))
raise SystemExit(0 if receipt["exit"]==0 and receipt["baseHashesUnchanged"] and receipt["newFileHashesUnchanged"] else 1)
