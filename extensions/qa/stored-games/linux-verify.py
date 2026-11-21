"""Run all stored versions on an immutable Linux candidate with read-only fixtures.

Usage: python extensions/qa/stored-games/linux-verify.py SOURCE_RUN FIXTURE_DIR
       --fixture-sha256 SHA256
Only the sanitized receipt is retrieved; private browser/server logs stay on Linux.
"""
import argparse
import json
import pathlib
import re
import shlex
import subprocess
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument("source_run")
parser.add_argument("fixture_dir")
parser.add_argument("--fixture-sha256", required=True)
parser.add_argument("--external-media-sha256", required=True)
parser.add_argument("--fixture-name", default="games.runtime-v2.json")
args = parser.parse_args()
sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip()
assert re.fullmatch("tadazz-codex-" + sha[:12] + "-[a-f0-9]{8}", args.source_run)
assert re.fullmatch("[a-f0-9]{64}", args.fixture_sha256)
assert re.fullmatch("[a-f0-9]{64}", args.external_media_sha256)
assert re.fullmatch(r"games(?:\.runtime-v[0-9]+)?\.json", args.fixture_name)
fixture = pathlib.PurePosixPath(args.fixture_dir)
assert fixture.is_absolute() and ".." not in fixture.parts
assert str(fixture).startswith("/home/ubuntu/tadazz-complete-e2e-20261122-fixtures-")
previous = ROOT / "docs/extensions/plans/phase3-takeover-20261117" / args.source_run
source = json.loads((previous / "input-manifest.json").read_text(encoding="utf8"))
build = json.loads((previous / "receipt.json").read_text(encoding="utf8"))
assert source["sha"] == sha and build["sha"] == sha
assert build["allHashesVerifiedBeforeAfter"]
assert all(check["exit"] == 0 for check in build["checks"])
assert {"native-site-build", "native-application-preview-build"}.issubset(
    {check["label"] for check in build["checks"]}
)
run = "tadazz-stored-games-" + sha[:12] + "-" + uuid.uuid4().hex[:8]
evidence = ROOT / "extensions/qa/stored-games/evidence" / run
evidence.mkdir(parents=True, exist_ok=False)
config = {
    "sha": sha, "sourceRun": args.source_run, "manifest": source["files"],
    "run": run, "fixtureDir": str(fixture), "fixtureSha256": args.fixture_sha256,
    "fixtureName": args.fixture_name,
    "externalMediaSha256": args.external_media_sha256,
}
(evidence / "input-manifest.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf8")
SSH = [
    "ssh", "-i", str(pathlib.Path.home() / ".ssh/tadazz_oracle_2026"),
    "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
    "ubuntu@132.145.25.168",
]
remote = r'''
import pathlib,json,hashlib,subprocess,time,atexit
c=CONFIG
base=pathlib.Path('/home/ubuntu/tadazz-phase2-20261116/evidence')
source=base/c['sourceRun']/'source';owned=base/c['run'];owned.mkdir(mode=0o700,exist_ok=False)
fixtures=pathlib.Path(c['fixtureDir'])
assert not source.is_symlink() and source.is_dir()
assert not fixtures.is_symlink() and fixtures.is_dir()
assert hashlib.sha256((fixtures/c['fixtureName']).read_bytes()).hexdigest()==c['fixtureSha256']
assert hashlib.sha256((fixtures/'external-assets.json').read_bytes()).hexdigest()==c['externalMediaSha256']
def source_hashes():return {p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}
assert source_hashes()==c['manifest'],'Candidate source differs from immutable Git archive'
facts=json.loads(subprocess.check_output(['docker','inspect','tadazz-phase2-20261116']))[0]
rootfs=pathlib.Path('/var/lib/docker/rootfs/overlayfs')/facts['Id']
assert (rootfs/'cleanup').is_dir() and (rootfs/'root/.cache/ms-playwright').is_dir()
deps=base/'tadazz-codex-browser-c4125d58a746-8e0c29d3/mcp-deps'
entries={str(p.relative_to(deps)):('link:'+str(p.readlink()) if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest()) for p in deps.rglob('*') if p.is_file() or p.is_symlink()}
assert len(entries)==2042 and hashlib.sha256(json.dumps(entries,sort_keys=True).encode()).hexdigest()=='0d1e3e9c089b66a75ff0e6b284f58b94ddb4e4b47b55129d82865980f62d67de'
name=c['run']
mounts=[(source,'/source',True),(fixtures,'/fixtures',True),(owned,'/evidence',False),(rootfs/'cleanup','/cleanup',True),(rootfs/'root/.cache/ms-playwright','/root/.cache/ms-playwright',True),(deps,'/tmp/phase3-999ed90c/deps',True)]
argv=['docker','run','--detach','--pull=never','--init','--read-only','--name',name,'--network','none','--cpus','1','--memory','2g','--memory-swap','2g','--pids-limit','384','--shm-size','256m','--tmpfs','/tmp:rw,nosuid,nodev,size=805306368','--label','com.tadazz.qa=stored-games-browser']
for origin,target,readonly in mounts:argv+=['--mount','type=bind,source='+str(origin)+',target='+target+(',readonly' if readonly else '')]
argv+=['--entrypoint','/bin/sleep',facts['Image'],'infinity']
subprocess.run(argv,check=True,stdout=subprocess.DEVNULL)
atexit.register(lambda:subprocess.run(['docker','stop','--time','10',name],check=True,stdout=subprocess.DEVNULL,timeout=25))
env={'TMPDIR':'/tmp','TSX_DISABLE_CACHE':'1','NODE_OPTIONS':'--max-old-space-size=1400','TADAZZ_GALLERY_SOURCE_SHA':c['sha'],'TADAZZ_STORED_GAMES_EVIDENCE':'/evidence/browser','TADAZZ_INLINE_GAME_PREVIEW_ENABLED':'true','TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED':'true','TADAZZ_SITE_ENABLED':'true','TADAZZ_REMOTE_QA':'1','TADAZZ_QA_OWNED_RUN_DIR':'1','TADAZZ_PRIVATE_GAME_FIXTURES':'/fixtures/'+c['fixtureName'],'TADAZZ_PRIVATE_GAME_FIXTURES_SHA256':c['fixtureSha256'],'TADAZZ_PRIVATE_EXTERNAL_MEDIA_SHA256':c['externalMediaSha256'],'TADAZZ_SITE_DIST_DIR':'/source/packages/web/dist'}
prefix=['docker','exec','-w','/source']
for key,value in env.items():prefix+=['-e',key+'='+value]
command=['node','/cleanup/extensions/node_modules/tsx/dist/cli.mjs','--tsconfig','tsconfig.json','extensions/qa/stored-games/verify.mjs']
prefix += [name,'nice','-n','19','timeout','-k','5','3300']
start=time.time()
with (owned/'browser.stdout.log').open('wb') as out,(owned/'browser.stderr.log').open('wb') as err:
 result=subprocess.run(prefix+command,stdout=out,stderr=err,timeout=3320)
assert source_hashes()==c['manifest'],'Browser changed source'
assert hashlib.sha256((fixtures/c['fixtureName']).read_bytes()).hexdigest()==c['fixtureSha256'],'Browser changed private fixtures'
assert hashlib.sha256((fixtures/'external-assets.json').read_bytes()).hexdigest()==c['externalMediaSha256'],'Browser changed external media manifest'
receipt_path=owned/'browser/receipt.json';inner=json.loads(receipt_path.read_text()) if receipt_path.exists() else None
state=json.loads(subprocess.check_output(['docker','inspect',name]))[0]['State']
report={'sha':c['sha'],'sourceRun':c['sourceRun'],'run':c['run'],'exit':result.returncode,'seconds':round(time.time()-start,2),'passed':result.returncode==0 and inner is not None and inner.get('passed') is True,'allSourceHashesVerified':True,'sourceReadOnly':True,'fixturesReadOnly':True,'externalMediaSha256':c['externalMediaSha256'],'productionMountUsed':False,'productionChanged':False,'network':'none','oomKilled':state.get('OOMKilled',False),'browserReceipt':inner}
(owned/'receipt.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'run':c['run'],'passed':report['passed'],'seconds':report['seconds'],'receipt':str(owned/'receipt.json')}),flush=True)
'''.replace("c=CONFIG", "c=" + repr(config))
result = subprocess.run([*SSH, "sudo -n python3 -"], input=remote.encode(), capture_output=True, timeout=3400)
(evidence / "controller.stdout.log").write_bytes(result.stdout)
(evidence / "controller.stderr.log").write_bytes(result.stderr)
if result.returncode:
    raise SystemExit("Linux stored-game controller failed; inspect its private controller log")
receipt_path = "/home/ubuntu/tadazz-phase2-20261116/evidence/" + run + "/receipt.json"
receipt = subprocess.check_output([*SSH, "sudo -n cat " + shlex.quote(receipt_path)], timeout=60)
report = json.loads(receipt)
(evidence / "receipt.json").write_bytes(receipt)
print(json.dumps({"run": run, "passed": report["passed"], "seconds": report["seconds"], "evidence": str(evidence)}), flush=True)
raise SystemExit(0 if report["passed"] else 1)
