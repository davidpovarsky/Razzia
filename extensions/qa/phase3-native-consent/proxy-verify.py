"""Real production-image Nginx routing and private-URL logging qualification.

Supports explicit precommit overlays for development. --immutable requires the
controller/config/test bytes and complete source manifest from the exact commit.
No customer mount, published port, production mutation or package installation.
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
controller_path = "extensions/qa/phase3-native-consent/proxy-verify.py"
controller_hash = hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
if args.immutable:
    assert inputs["sha"] == subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
    assert all(hashlib.sha256(body.encode()).hexdigest()==inputs["files"][p] for p,body in files.items())
    assert controller_hash == inputs["files"][controller_path]
run = f"tadazz-codex-proxy-{inputs['sha'][:12]}-{uuid.uuid4().hex[:8]}"
evidence = BASE/run
evidence.mkdir()
config = {"run": run, "sourceRun": source_run, "sha": inputs["sha"], "manifest": inputs["files"], "files": files, "immutable":args.immutable, "controllerSha256":controller_hash}
REMOTE = r'''
import hashlib,json,pathlib,subprocess,time,re,shutil
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
original_deps=pathlib.Path('/proc')/str(facts['State']['Pid'])/'root/tmp/phase3-999ed90c/deps'
def dependency_hashes(root):
    return {p.relative_to(root).as_posix(): ('link:'+p.readlink().as_posix() if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest()) for p in root.rglob('*') if p.is_symlink() or p.is_file()}
assert (rootfs/'cleanup').is_dir() and original_deps.is_dir()
expected_deps=dependency_hashes(original_deps)
assert expected_deps and (original_deps/'node_modules/@modelcontextprotocol/server/package.json').is_file()
deps=next((p for p in sorted(base.glob('tadazz-codex-browser-*/mcp-deps')) if p.is_dir() and not p.is_symlink() and dependency_hashes(p)==expected_deps),None)
if deps is None:
    assert shutil.disk_usage(owned).free > 160*1024*1024
    deps=owned/'mcp-deps'
    shutil.copytree(original_deps,deps,symlinks=True)
assert dependency_hashes(deps)==expected_deps
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
    running=json.loads(subprocess.check_output(['docker','inspect',container]))[0]
    assert running['Image']==image and running['HostConfig']['NetworkMode']=='none' and not running['HostConfig'].get('PortBindings')
    mounts={m['Destination']:m for m in running['Mounts']}
    for destination in (internal,code,'/cleanup','/tmp/phase3-999ed90c/deps'):
        assert mounts[destination]['Type']=='bind' and not mounts[destination]['RW']
    result=subprocess.run(argv,capture_output=True,text=True,timeout=55)
finally:
    subprocess.run(['docker','stop','--time','10',container],capture_output=True,check=True)
after={p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}
overlay_hashes={p:hashlib.sha256((overlay/p).read_bytes()).hexdigest() for p in c['files']}
expected={p:hashlib.sha256(b.encode()).hexdigest() for p,b in c['files'].items()}
proof_lines=re.findall(r'^\s*(?:#\s*)?TADAZZ_PROXY_PRIVACY_PROOF (\{[^\r\n]+\})\s*$',result.stdout,re.M)
privacy_proof=json.loads(proof_lines[0]) if len(proof_lines)==1 else None
immutable=c['immutable'] and before==after==c['manifest'] and overlay_hashes==expected and all(expected[p]==c['manifest'][p] for p in expected)
print(json.dumps({'sha':c['sha'],'sourceRun':c['sourceRun'],'baseSha':c['sha'],'exactSourceSha':c['sha'] if c['immutable'] else None,'immutable':c['immutable'],'controllerSha256':c['controllerSha256'],'baseSourceCount':len(before),'sourceFileCount':len(before),'sourceReadOnly':True,'overlayReadOnly':True,'baseHashesUnchanged':before==after==c['manifest'],'hashesBefore':before,'hashesAfter':after,'newFileHashes':overlay_hashes,'newFileHashesUnchanged':overlay_hashes==expected,'combinedImmutableGate':immutable,'sdkCacheHashesVerifiedBeforeAfter':dependency_hashes(deps)==expected_deps,'sdkCacheManifestSha256':hashlib.sha256(json.dumps(expected_deps,sort_keys=True).encode()).hexdigest(),'runnerImage':image,'network':'none','privacyProof':privacy_proof,'command':argv,'exit':result.returncode,'seconds':round(time.time()-started,3),'stdout':result.stdout,'stderr':result.stderr,'productionChanged':False,'customerDataAccessed':False},indent=2))
'''
result = subprocess.run(["ssh", "-i", str(pathlib.Path.home()/".ssh/tadazz_oracle_2026"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "ubuntu@132.145.25.168", "sudo -n python3 -"], input=REMOTE.replace("c=CONFIG", "c="+repr(config)), capture_output=True, text=True, encoding="utf8", timeout=75)
(evidence/"controller.stderr.log").write_text(result.stderr,encoding="utf8",newline="\n")
(evidence/"controller.stdout.log").write_text(result.stdout,encoding="utf8",newline="\n")
if result.returncode:
    print(result.stderr)
    raise SystemExit(result.returncode)
receipt = json.loads(result.stdout)
(evidence/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf8",newline="\n")
print(json.dumps({k:receipt[k] for k in ["sha","sourceRun","baseHashesUnchanged","newFileHashesUnchanged","combinedImmutableGate","sdkCacheHashesVerifiedBeforeAfter","privacyProof","exit","seconds","stdout","stderr"]},indent=2))
privacy_expected={"version":1,"passed":True,"ordinaryAccessControl":True,"ordinaryUpstreamErrorControl":True,"sensitiveAccessLogAbsent":True,"sensitiveErrorLogAbsent":True,"protectedSuccess":True,"protectedDenial":True,"protectedUpstreamFailure":True}
passed=receipt["exit"]==0 and receipt["baseHashesUnchanged"] and receipt["newFileHashesUnchanged"] and receipt["sdkCacheHashesVerifiedBeforeAfter"] and receipt["privacyProof"]==privacy_expected
raise SystemExit(0 if passed and (not args.immutable or receipt["combinedImmutableGate"]) else 1)
