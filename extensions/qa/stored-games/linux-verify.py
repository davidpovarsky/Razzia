"""Run all stored versions on an immutable Linux candidate with read-only fixtures.

Usage: python extensions/qa/stored-games/linux-verify.py SOURCE_RUN FIXTURE_DIR
       --fixture-sha256 SHA256
Only the sanitized receipt is retrieved; private browser/server logs stay on Linux.
"""
import argparse
import base64
import hashlib
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
parser.add_argument("--candidate-repo", type=pathlib.Path)
parser.add_argument("--qa-browser-overlay-sha256")
args = parser.parse_args()
assert bool(args.candidate_repo) == bool(args.qa_browser_overlay_sha256), "Candidate repository and reviewed QA overlay pin are supplied together"
candidate_root = args.candidate_repo.resolve(strict=True) if args.candidate_repo else ROOT
sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=candidate_root).decode().strip()
assert re.fullmatch("tadazz-codex-" + sha[:12] + "-[a-f0-9]{8}", args.source_run)
assert re.fullmatch("[a-f0-9]{64}", args.fixture_sha256)
assert re.fullmatch("[a-f0-9]{64}", args.external_media_sha256)
assert re.fullmatch(r"games(?:\.runtime-v[0-9]+)?\.json", args.fixture_name)
fixture = pathlib.PurePosixPath(args.fixture_dir)
assert fixture.is_absolute() and ".." not in fixture.parts
assert str(fixture).startswith("/home/ubuntu/tadazz-complete-e2e-20261122-fixtures-")
previous = candidate_root / "docs/extensions/plans/phase3-takeover-20261117" / args.source_run
source = json.loads((previous / "input-manifest.json").read_text(encoding="utf8"))
build = json.loads((previous / "receipt.json").read_text(encoding="utf8"))
assert source["sha"] == sha and build["sha"] == sha
assert build["allHashesVerifiedBeforeAfter"]
assert all(check["exit"] == 0 for check in build["checks"])
assert {"native-site-build", "native-application-preview-build"}.issubset(
    {check["label"] for check in build["checks"]}
)
qa_overlay = None
if args.qa_browser_overlay_sha256:
    relative = "extensions/qa/stored-games/browser.mjs"
    overlay_bytes = (ROOT / relative).read_bytes()
    assert re.fullmatch("[a-f0-9]{64}", args.qa_browser_overlay_sha256)
    assert hashlib.sha256(overlay_bytes).hexdigest() == args.qa_browser_overlay_sha256
    assert args.qa_browser_overlay_sha256 != source["files"][relative]
    qa_overlay = {
        "relativePath": relative,
        "candidateSha256": source["files"][relative],
        "appliedSha256": args.qa_browser_overlay_sha256,
        "contentBase64": base64.b64encode(overlay_bytes).decode(),
        "controllerCandidateSha256": source["files"]["extensions/qa/stored-games/linux-verify.py"],
        "controllerAppliedSha256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        "harnessRevision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip(),
        "reason": "Node-only QA import boundary; identical renderer scene classification and assertions",
    }
run = "tadazz-stored-games-" + sha[:12] + "-" + uuid.uuid4().hex[:8]
evidence = ROOT / "extensions/qa/stored-games/evidence" / run
evidence.mkdir(parents=True, exist_ok=False)
config = {
    "sha": sha, "sourceRun": args.source_run, "manifest": source["files"],
    "run": run, "fixtureDir": str(fixture), "fixtureSha256": args.fixture_sha256,
    "fixtureName": args.fixture_name,
    "externalMediaSha256": args.external_media_sha256,
    "qaOverlay": qa_overlay,
}
(evidence / "input-manifest.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf8")
SSH = [
    "ssh", "-i", str(pathlib.Path.home() / ".ssh/tadazz_oracle_2026"),
    "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
    "ubuntu@132.145.25.168",
]
remote = r'''
import pathlib,json,hashlib,subprocess,time,atexit,base64,os
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
def sdk_hashes():return {str(p.relative_to(deps)):('link:'+str(p.readlink()) if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest()) for p in deps.rglob('*') if p.is_file() or p.is_symlink()}
entries=sdk_hashes()
assert len(entries)==2042 and hashlib.sha256(json.dumps(entries,sort_keys=True).encode()).hexdigest()=='0d1e3e9c089b66a75ff0e6b284f58b94ddb4e4b47b55129d82865980f62d67de'
name=c['run']
mounts=[(source,'/source',True),(fixtures,'/fixtures',True),(owned,'/evidence',False),(rootfs/'cleanup','/cleanup',True),(rootfs/'root/.cache/ms-playwright','/root/.cache/ms-playwright',True),(deps,'/tmp/phase3-999ed90c/deps',True)]
qa_overlay=c.get('qaOverlay');overlay_path=None
if qa_overlay:
 assert qa_overlay['relativePath']=='extensions/qa/stored-games/browser.mjs'
 assert c['manifest'][qa_overlay['relativePath']]==qa_overlay['candidateSha256']
 payload=base64.b64decode(qa_overlay['contentBase64'],validate=True)
 assert hashlib.sha256(payload).hexdigest()==qa_overlay['appliedSha256']
 overlay_root=base/(c['run']+'-qa-overlay');overlay_root.mkdir(mode=0o700,exist_ok=False)
 overlay_path=overlay_root/'browser.mjs'
 fd=os.open(overlay_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
 with os.fdopen(fd,'wb') as handle:handle.write(payload);handle.flush();os.fsync(handle.fileno())
 mounts.append((overlay_path,'/source/'+qa_overlay['relativePath'],True))
argv=['docker','run','--detach','--pull=never','--init','--read-only','--name',name,'--network','none','--cpus','1','--memory','2g','--memory-swap','2g','--pids-limit','384','--shm-size','256m','--tmpfs','/tmp:rw,nosuid,nodev,size=805306368','--label','com.tadazz.qa=stored-games-browser']
for origin,target,readonly in mounts:argv+=['--mount','type=bind,source='+str(origin)+',target='+target+(',readonly' if readonly else '')]
argv+=['--entrypoint','/bin/sleep',facts['Image'],'infinity']
subprocess.run(argv,check=True,stdout=subprocess.DEVNULL)
atexit.register(lambda:subprocess.run(['docker','stop','--time','10',name],check=True,stdout=subprocess.DEVNULL,timeout=25))
def verify_qa_overlay():
 if not qa_overlay:return
 assert overlay_path is not None and hashlib.sha256(overlay_path.read_bytes()).hexdigest()==qa_overlay['appliedSha256']
 facts=json.loads(subprocess.check_output(['docker','inspect',name]))[0]
 target='/source/'+qa_overlay['relativePath']
 matching=[item for item in facts['Mounts'] if item['Destination']==target]
 assert len(matching)==1 and matching[0]['Source']==str(overlay_path) and matching[0]['Type']=='bind' and matching[0]['RW'] is False
 script="const fs=require('node:fs'),c=require('node:crypto');process.stdout.write(c.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))"
 actual=subprocess.check_output(['docker','exec',name,'node','-e',script,target]).decode()
 assert actual==qa_overlay['appliedSha256'],'Runtime QA overlay differs from reviewed pin'
verify_qa_overlay()
env={'TMPDIR':'/tmp','TSX_DISABLE_CACHE':'1','NODE_OPTIONS':'--max-old-space-size=1400','TADAZZ_GALLERY_SOURCE_SHA':c['sha'],'TADAZZ_STORED_GAMES_EVIDENCE':'/evidence/browser','TADAZZ_INLINE_GAME_PREVIEW_ENABLED':'true','TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED':'true','TADAZZ_SITE_ENABLED':'true','TADAZZ_REMOTE_QA':'1','TADAZZ_QA_OWNED_RUN_DIR':'1','TADAZZ_PRIVATE_GAME_FIXTURES':'/fixtures/'+c['fixtureName'],'TADAZZ_PRIVATE_GAME_FIXTURES_SHA256':c['fixtureSha256'],'TADAZZ_PRIVATE_EXTERNAL_MEDIA_SHA256':c['externalMediaSha256'],'TADAZZ_SITE_DIST_DIR':'/source/packages/web/dist'}
prefix=['docker','exec','-w','/source']
for key,value in env.items():prefix+=['-e',key+'='+value]
command=['node','/cleanup/extensions/node_modules/tsx/dist/cli.mjs','--tsconfig','tsconfig.json','extensions/qa/stored-games/verify.mjs']
prefix += [name,'nice','-n','19','timeout','-k','5','3300']
start=time.time()
with (owned/'browser.stdout.log').open('wb') as out,(owned/'browser.stderr.log').open('wb') as err:
 result=subprocess.run(prefix+command,stdout=out,stderr=err,timeout=3320)
assert source_hashes()==c['manifest'],'Browser changed source'
verify_qa_overlay()
assert sdk_hashes()==entries,'Browser changed SDK dependency cache'
assert hashlib.sha256((fixtures/c['fixtureName']).read_bytes()).hexdigest()==c['fixtureSha256'],'Browser changed private fixtures'
assert hashlib.sha256((fixtures/'external-assets.json').read_bytes()).hexdigest()==c['externalMediaSha256'],'Browser changed external media manifest'
receipt_path=owned/'browser/receipt.json';inner=json.loads(receipt_path.read_text()) if receipt_path.exists() else None
state=json.loads(subprocess.check_output(['docker','inspect',name]))[0]['State']
report={'sha':c['sha'],'sourceRun':c['sourceRun'],'run':c['run'],'exit':result.returncode,'seconds':round(time.time()-start,2),'passed':result.returncode==0 and inner is not None and inner.get('passed') is True,'allSourceHashesVerified':True,'sourceReadOnly':True,'fixturesReadOnly':True,'externalMediaSha256':c['externalMediaSha256'],'productionMountUsed':False,'productionChanged':False,'network':'none','oomKilled':state.get('OOMKilled',False),'browserReceipt':inner}
report.update(candidateSourceHashesVerifiedBeforeAfter=True,sdkCacheHashesVerifiedBeforeAfter=True,applicationSourcesEqualCandidate=True,runtimeQaSourceEqualsCandidate=qa_overlay is None,sourceVerificationScope='Frozen candidate archive on host; explicit QA file overlay verified separately' if qa_overlay else 'Exact immutable candidate source')
report['qaOverlay']=({key:value for key,value in qa_overlay.items() if key!='contentBase64'} | {'readOnly':True,'hashVerifiedBeforeAfter':True,'candidateOriginalUnchanged':True}) if qa_overlay else None
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
