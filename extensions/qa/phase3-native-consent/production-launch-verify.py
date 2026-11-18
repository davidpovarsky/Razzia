"""Qualify an exact committed artifact in the current production image offline.

No published port, production restart/config, customer mount or package install.
Requires an already qualified immutable source/build packet from linux-verify.py.
"""
import json
import pathlib
import re
import subprocess
import sys
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT / "docs/extensions/plans/phase3-takeover-20261117"
assert len(sys.argv) == 2 and re.fullmatch(r"tadazz-codex-[a-f0-9]{12}-[a-f0-9]{8}", sys.argv[1])
source_run = sys.argv[1]
inputs = json.loads((BASE/source_run/"input-manifest.json").read_text(encoding="utf8"))
assert inputs["sha"] == subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
run = f"tadazz-codex-launch-{inputs['sha'][:12]}-{uuid.uuid4().hex[:8]}"
evidence = BASE/run
evidence.mkdir()
config = {"run":run,"sourceRun":source_run,"sha":inputs["sha"],"manifest":inputs["files"]}
REMOTE = r'''
import hashlib,json,pathlib,subprocess,time
c=CONFIG
facts=json.loads(subprocess.check_output(['docker','inspect','tadazz-phase2-20261116']))[0]
assert facts['State']['Running'] and facts['HostConfig']['NetworkMode']=='none' and not facts['HostConfig']['PortBindings']
base=pathlib.Path('/home/ubuntu/tadazz-phase2-20261116/evidence')
source=base/c['sourceRun']/'source'
build=base/c['sourceRun']/'fixtures/native-host-build'
assert source.resolve()==source and source.is_dir() and build.resolve()==build
widget=source/'extensions/src/mcp-app/widget/dist'
public=source/'packages/web/public'
assert widget.resolve()==widget and widget.is_dir() and not widget.is_symlink()
assert public.resolve()==public and public.is_dir() and not public.is_symlink()
widget_manifest_bytes=(widget/'full-show-artifact.json').read_bytes()
widget_manifest_sha=hashlib.sha256(widget_manifest_bytes).hexdigest()
widget_manifest=json.loads(widget_manifest_bytes)
widget_html=(widget/'full-show.html').read_bytes()
assert widget_manifest['origin']=='https://tadazz.com'
assert widget_manifest['resourceUri']=='ui://tadazz/full-show/v3.html'
assert widget_manifest['mimeType']=='text/html;profile=mcp-app'
assert widget_manifest['csp']=={'connectDomains':['https://tadazz.com'],'resourceDomains':['https://tadazz.com'],'frameDomains':[],'baseUriDomains':['https://tadazz.com']}
assert widget_manifest['bytes']==len(widget_html)<=4_000_000
assert widget_manifest['sha256']==hashlib.sha256(widget_html).hexdigest()
assert widget_manifest['rendererBuildId']==hashlib.sha256(json.dumps(widget_manifest['physicalSources'],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
for group in ('physicalSources','publicAssets'):
    assert widget_manifest[group] and len({entry['path'] for entry in widget_manifest[group]})==len(widget_manifest[group])
    for entry in widget_manifest[group]:
        relative=pathlib.PurePosixPath(entry['path'])
        assert not relative.is_absolute() and '..' not in relative.parts
        assert c['manifest'].get(entry['path'])==entry['sha256']
        assert (source/entry['path']).stat().st_size==entry['bytes']
assert {entry['path'] for entry in widget_manifest['publicAssets']}=={p for p in c['manifest'] if p.startswith('packages/web/public/')}
artifact=json.loads((build/'artifact.json').read_text())
compiled=build/'index.cjs'
assert hashlib.sha256(compiled.read_bytes()).hexdigest()==artifact['sha256']
assert artifact['fullShowManifestSha256']==widget_manifest_sha, 'Backend and V3 widget must share the exact build-time manifest pin'
assert all(name.startswith('node:') or name in ('http','https','events','fs','net','stream','util','zlib','crypto','url','path','buffer','os','querystring','child_process','tty','timers','worker_threads','perf_hooks','async_hooks','assert','dns','tls','string_decoder','supports-color','bufferutil','utf-8-validate') for name in artifact['externalModules'])
before={p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}
assert before==c['manifest']
owned=base/c['run']
owned.mkdir(mode=0o700,exist_ok=False)
(owned/'fixtures').mkdir(mode=0o700)
rootfs=pathlib.Path('/var/lib/docker/rootfs/overlayfs')/facts['Id']
deps=base/'tadazz-codex-browser-c4125d58a746-8e0c29d3/mcp-deps'
assert (rootfs/'cleanup').is_dir() and deps.is_dir() and not deps.is_symlink()
internal='/evidence/'+c['sourceRun']+'/source'
fixture='/evidence/'+c['run']+'/fixtures'
image='sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346'
docker=['docker','run','--detach','--pull=never','--init','--read-only','--network','none','--cpus','1','--memory','1g','--memory-swap','1g','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,nodev,size=134217728','--name',c['run'],'--label','codex.thread=01a1e9e9-ad5b-77a3-bafe-bcedce32246a']
for origin,target,readonly in [(str(source),internal,True),(str(build),'/candidate',True),(str(widget),'/app/mcp',True),(str(public),'/app/web',True),(str(owned),'/evidence/'+c['run'],False),(str(rootfs/'cleanup'),'/cleanup',True),(str(deps),'/tmp/phase3-999ed90c/deps',True)]:
    docker+=['--mount','type=bind,source='+origin+',target='+target+(',readonly' if readonly else '')]
docker+=['--entrypoint','/bin/sleep',image,'infinity']
created=subprocess.run(docker,capture_output=True,text=True)
assert created.returncode==0,created.stderr
argv=['docker','exec','-w',internal,'-e','TMPDIR='+fixture,'-e','TSX_DISABLE_CACHE=1','-e','NODE_OPTIONS=--max-old-space-size=768','-e','TADAZZ_ISOLATED_LAUNCH_QA=1','-e','TADAZZ_NATIVE_HOST_ARTIFACT=/candidate/index.cjs',c['run'],'nice','-n','19','timeout','-s','KILL','100','node','/cleanup/extensions/node_modules/tsx/dist/cli.mjs','--tsconfig',internal+'/tsconfig.json','--test','--test-concurrency=1','extensions/qa/phase3-native-consent/production-config.nodecheck.ts','extensions/qa/phase3-native-consent/production-launch.nodecheck.ts']
started=time.time()
try:
    created_facts=json.loads(subprocess.check_output(['docker','inspect',c['run']]))[0]
    mounts={item['Destination']:item for item in created_facts['Mounts']}
    assert created_facts['HostConfig']['NetworkMode']=='none' and not created_facts['HostConfig']['PortBindings']
    for destination,expected_source in [('/app/mcp',str(widget)),('/app/web',str(public))]:
        assert mounts[destination]['Type']=='bind' and mounts[destination]['Source']==expected_source and not mounts[destination]['RW']
    result=subprocess.run(argv,capture_output=True,text=True,timeout=110)
finally:
    subprocess.run(['docker','stop','--time','10',c['run']],capture_output=True,check=True)
after={p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}
assert hashlib.sha256(compiled.read_bytes()).hexdigest()==artifact['sha256']
assert hashlib.sha256((widget/'full-show-artifact.json').read_bytes()).hexdigest()==widget_manifest_sha
assert hashlib.sha256((widget/'full-show.html').read_bytes()).hexdigest()==widget_manifest['sha256']
widget_receipt={'manifestSha256':widget_manifest_sha,'htmlSha256':widget_manifest['sha256'],'htmlBytes':len(widget_html),'rendererBuildId':widget_manifest['rendererBuildId'],'publicAssetCount':len(widget_manifest['publicAssets']),'physicalSourceCount':len(widget_manifest['physicalSources']),'readOnlyMountsVerified':True,'hashesUnchanged':True}
print(json.dumps({'sha':c['sha'],'sourceFileCount':len(before),'allSourceHashesVerifiedBeforeAfter':before==after==c['manifest'],'runnerImage':image,'network':'none','artifact':artifact,'widgetArtifact':widget_receipt,'artifactHashUnchanged':True,'command':argv,'exit':result.returncode,'seconds':round(time.time()-started,3),'stdout':result.stdout,'stderr':result.stderr,'productionChanged':False,'customerDataAccessed':False,'privateHostInstalled':False},indent=2))
'''
result = subprocess.run(["ssh","-i",str(pathlib.Path.home()/".ssh/tadazz_oracle_2026"),"-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","ubuntu@132.145.25.168","sudo -n python3 -"],input=REMOTE.replace("c=CONFIG","c="+repr(config)),capture_output=True,text=True,encoding="utf8",timeout=145)
(evidence/"controller.stdout.log").write_text(result.stdout,encoding="utf8",newline="\n")
(evidence/"controller.stderr.log").write_text(result.stderr,encoding="utf8",newline="\n")
if result.returncode:
    print(result.stderr[-4000:])
    raise SystemExit(result.returncode)
receipt=json.loads(result.stdout)
(evidence/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf8",newline="\n")
print(json.dumps({"sha":receipt["sha"],"evidence":str(evidence),"artifactSha256":receipt["artifact"]["sha256"],"exit":receipt["exit"],"seconds":receipt["seconds"],"sourceHashesUnchanged":receipt["allSourceHashesVerifiedBeforeAfter"]},indent=2))
raise SystemExit(0 if receipt["exit"]==0 and receipt["allSourceHashesVerifiedBeforeAfter"] else 1)
