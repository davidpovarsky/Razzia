"""Run the gallery's native editor and public browsers on the Linux server.

Usage: python extensions/qa/public-gallery/linux-browser-verify.py SOURCE_RUN
       python .../linux-browser-verify.py SOURCE_RUN --live-container FULL_ID
Both modes verify the immutable source archive used by the successful native build.
The live mode additionally binds the result to the running deployment's revision.
"""
import argparse
import base64
import hashlib
import io
import json
import pathlib
import re
import shlex
import subprocess
import tarfile
import uuid

ROOT=pathlib.Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('source_run')
parser.add_argument('--live-container')
parser.add_argument('--candidate-repo',type=pathlib.Path)
parser.add_argument('--qa-overlay-sha256',action='append',default=[],metavar='PATH=SHA256')
args=parser.parse_args()
assert bool(args.candidate_repo)==bool(args.qa_overlay_sha256),'Candidate repository and reviewed QA overlay pins are supplied together'
candidate_root=args.candidate_repo.resolve(strict=True) if args.candidate_repo else ROOT
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate_root).decode().strip()
assert re.fullmatch('tadazz-codex-'+sha[:12]+'-[a-f0-9]{8}',args.source_run)
if args.live_container:assert re.fullmatch('[a-f0-9]{64}',args.live_container)
previous=candidate_root/'docs/extensions/plans/phase3-takeover-20261117'/args.source_run
source=json.loads((previous/'input-manifest.json').read_text(encoding='utf8'))
build=json.loads((previous/'receipt.json').read_text(encoding='utf8'))
assert source['sha']==sha and build['sha']==sha and build['allHashesVerifiedBeforeAfter']
assert all(x['exit']==0 for x in build['checks'])
assert {'native-site-build','native-application-preview-build'}.issubset({x['label'] for x in build['checks']})
qa_overlay=None
if args.qa_overlay_sha256:
 allowed={
  'extensions/qa/public-gallery/guess-off-contract-verify.mjs',
  'extensions/qa/public-gallery/browser-verify.mjs',
  'extensions/qa/experience-refinement/platform-verify.mjs',
 }
 pins={}
 for value in args.qa_overlay_sha256:
  relative,separator,pin=value.partition('=')
  assert separator and relative in allowed and relative not in pins
  assert re.fullmatch('[a-f0-9]{64}',pin)
  pins[relative]=pin
 assert set(pins)==allowed,'Exactly the three reviewed QA overlays are required'
 harness_revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip()
 files=[]
 for relative,pin in sorted(pins.items()):
  payload=(ROOT/relative).read_bytes()
  assert hashlib.sha256(payload).hexdigest()==pin
  assert payload==subprocess.check_output(['git','show',harness_revision+':'+relative],cwd=ROOT),'QA overlay must match the recorded committed harness revision'
  assert pin!=source['files'][relative]
  files.append({'relativePath':relative,'candidateSha256':source['files'][relative],'appliedSha256':pin,'contentBase64':base64.b64encode(payload).decode()})
 controller='extensions/qa/public-gallery/linux-browser-verify.py'
 controller_payload=pathlib.Path(__file__).read_bytes()
 assert controller_payload==subprocess.check_output(['git','show',harness_revision+':'+controller],cwd=ROOT),'Controller must match the recorded committed harness revision'
 qa_overlay={'files':files,'controllerCandidateSha256':source['files'][controller],'controllerAppliedSha256':hashlib.sha256(controller_payload).hexdigest(),'harnessRevision':harness_revision,'reason':'Observe the actual numeric countdown and the accepted continuous finale contract; retain all timing, flow, pause, and reconnect gates'}
mode='live' if args.live_container else 'candidate'
run='tadazz-gallery-'+mode+'-'+sha[:12]+'-'+uuid.uuid4().hex[:8]
evidence=ROOT/'docs/extensions/plans/public-gallery-20261119'/run
evidence.mkdir(parents=True,exist_ok=False)
config={'sha':sha,'sourceRun':args.source_run,'manifest':source['files'],'run':run,'mode':mode,'liveContainer':args.live_container,'qaOverlay':qa_overlay}
(evidence/'input-manifest.json').write_text(json.dumps(config,indent=2)+'\n',encoding='utf8')
SSH=['ssh','-i',str(pathlib.Path.home()/'.ssh/tadazz_oracle_2026'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','ubuntu@132.145.25.168']
remote=r'''
import pathlib,json,hashlib,subprocess,time,atexit,base64,os
c=CONFIG
base=pathlib.Path('/home/ubuntu/tadazz-phase2-20261116/evidence')
source=base/c['sourceRun']/'source';owned=base/c['run'];owned.mkdir(mode=0o700,exist_ok=False)
assert not source.is_symlink() and source.is_dir()
def source_hashes():return {p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}
assert source_hashes()==c['manifest'],'Candidate source differs from immutable Git archive'
facts=json.loads(subprocess.check_output(['docker','inspect','tadazz-phase2-20261116']))[0]
rootfs=pathlib.Path('/var/lib/docker/rootfs/overlayfs')/facts['Id']
assert (rootfs/'cleanup').is_dir() and (rootfs/'root/.cache/ms-playwright').is_dir()
deps=base/'tadazz-codex-browser-c4125d58a746-8e0c29d3/mcp-deps'
def sdk_hashes():return {str(p.relative_to(deps)):('link:'+str(p.readlink()) if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest()) for p in deps.rglob('*') if p.is_file() or p.is_symlink()}
entries=sdk_hashes()
assert len(entries)==2042 and hashlib.sha256(json.dumps(entries,sort_keys=True).encode()).hexdigest()=='0d1e3e9c089b66a75ff0e6b284f58b94ddb4e4b47b55129d82865980f62d67de'
def deployment():
 if not c['liveContainer']:return None
 d=json.loads(subprocess.check_output(['docker','inspect',c['liveContainer']]))[0]
 assert d['Id']==c['liveContainer'] and d['State']['Running']
 image=json.loads(subprocess.check_output(['docker','image','inspect',d['Image']]))[0]
 assert image['Config']['Labels']['org.opencontainers.image.revision']==c['sha']
 return {'container':d['Id'],'image':d['Image'],'revision':c['sha']}
deployed=deployment();network='bridge' if c['mode']=='live' else 'none'
name=c['run'];mounts=[(source,'/source',True),(owned,'/evidence',False),(rootfs/'cleanup','/cleanup',True),(rootfs/'root/.cache/ms-playwright','/root/.cache/ms-playwright',True),(deps,'/tmp/phase3-999ed90c/deps',True)]
qa_overlay=c.get('qaOverlay');overlay_paths={}
if qa_overlay:
 expected={'extensions/qa/public-gallery/guess-off-contract-verify.mjs','extensions/qa/public-gallery/browser-verify.mjs','extensions/qa/experience-refinement/platform-verify.mjs'}
 assert len(qa_overlay['files'])==len(expected) and {item['relativePath'] for item in qa_overlay['files']}==expected
 overlay_root=base/(c['run']+'-qa-overlay');overlay_root.mkdir(mode=0o700,exist_ok=False)
 for item in qa_overlay['files']:
  relative=item['relativePath']
  assert c['manifest'][relative]==item['candidateSha256']
  payload=base64.b64decode(item['contentBase64'],validate=True)
  assert hashlib.sha256(payload).hexdigest()==item['appliedSha256']
  overlay_path=overlay_root/relative
  overlay_path.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
  fd=os.open(overlay_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
  with os.fdopen(fd,'wb') as handle:handle.write(payload);handle.flush();os.fsync(handle.fileno())
  overlay_paths[relative]=overlay_path
  mounts.append((overlay_path,'/source/'+relative,True))
argv=['docker','run','--detach','--pull=never','--init','--read-only','--name',name,'--network',network,'--cpus','1','--memory','2g','--memory-swap','2g','--pids-limit','384','--shm-size','256m','--tmpfs','/tmp:rw,nosuid,nodev,size=536870912','--label','com.tadazz.qa=public-gallery-browser']
for origin,target,readonly in mounts:argv+=['--mount','type=bind,source='+str(origin)+',target='+target+(',readonly' if readonly else '')]
argv+=['--entrypoint','/bin/sleep',facts['Image'],'infinity'];subprocess.run(argv,check=True,stdout=subprocess.DEVNULL)
atexit.register(lambda:subprocess.run(['docker','stop','--time','10',name],check=True,stdout=subprocess.DEVNULL,timeout=25))
def verify_qa_overlay():
 if not qa_overlay:return
 facts=json.loads(subprocess.check_output(['docker','inspect',name]))[0]
 expected={}
 for item in qa_overlay['files']:
  relative=item['relativePath'];overlay_path=overlay_paths[relative];target='/source/'+relative
  assert hashlib.sha256(overlay_path.read_bytes()).hexdigest()==item['appliedSha256']
  matching=[mount for mount in facts['Mounts'] if mount['Destination']==target]
  assert len(matching)==1 and matching[0]['Source']==str(overlay_path) and matching[0]['Type']=='bind' and matching[0]['RW'] is False
  expected[target]=item['appliedSha256']
 script="const fs=require('node:fs'),c=require('node:crypto');process.stdout.write(JSON.stringify(Object.fromEntries(process.argv.slice(1).map(p=>[p,c.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))))"
 actual=json.loads(subprocess.check_output(['docker','exec',name,'node','-e',script,*expected]))
 assert actual==expected,'Runtime QA overlays differ from their reviewed pins'
verify_qa_overlay()
env={'TMPDIR':'/tmp','TSX_DISABLE_CACHE':'1','NODE_OPTIONS':'--max-old-space-size=1400','TADAZZ_GALLERY_SOURCE_SHA':c['sha'],'TADAZZ_GALLERY_EVIDENCE':'/evidence/browser','TADAZZ_INLINE_GAME_PREVIEW_ENABLED':'true','TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED':'true','TADAZZ_SITE_ENABLED':'true','TADAZZ_REMOTE_QA':'1'}
if c['mode']=='candidate':
 env.update({'TADAZZ_SITE_DIST_DIR':'/source/packages/web/dist','TADAZZ_GALLERY_BROWSER':'true'})
 command=['node','/cleanup/extensions/node_modules/tsx/dist/cli.mjs','--tsconfig','tsconfig.json','extensions/qa/public-gallery/account-verify.mjs']
else:
 env['TADAZZ_GALLERY_ORIGIN']='https://tadazz.com';command=['node','extensions/qa/public-gallery/browser-verify.mjs']
prefix=['docker','exec','-w','/source']
for key,value in env.items():prefix+=['-e',key+'='+value]
prefix += [name,'nice','-n','19','timeout','-k','5','1800']
start=time.time()
with (owned/'browser.stdout.log').open('wb') as out,(owned/'browser.stderr.log').open('wb') as err:
 result=subprocess.run(prefix+command,stdout=out,stderr=err,timeout=1820)
assert source_hashes()==c['manifest'],'Browser changed source'
verify_qa_overlay()
assert sdk_hashes()==entries,'Browser changed SDK dependency cache'
assert deployment()==deployed,'Deployment changed during live acceptance'
receipt_path=owned/'browser/receipt.json';inner=json.loads(receipt_path.read_text()) if receipt_path.exists() else None
state=json.loads(subprocess.check_output(['docker','inspect',name]))[0]['State']
report={'sha':c['sha'],'sourceRun':c['sourceRun'],'run':c['run'],'mode':c['mode'],'exit':result.returncode,'seconds':round(time.time()-start,2),'passed':result.returncode==0 and inner is not None and inner.get('passed') is True,'allSourceHashesVerified':True,'sourceReadOnly':True,'customerMountUsed':False,'productionChanged':False,'network':network,'deployment':deployed,'oomKilled':state.get('OOMKilled',False),'browserReceipt':inner}
report.update(candidateSourceHashesVerifiedBeforeAfter=True,sdkCacheHashesVerifiedBeforeAfter=True,applicationSourcesEqualCandidate=True,runtimeQaSourceEqualsCandidate=qa_overlay is None,sourceVerificationScope='Frozen candidate archive on host; explicit QA file overlays verified separately' if qa_overlay else 'Exact immutable candidate source')
if qa_overlay:
 report['qaOverlay']={key:value for key,value in qa_overlay.items() if key!='files'}
 report['qaOverlay']['files']=[{key:value for key,value in item.items() if key!='contentBase64'} for item in qa_overlay['files']]
 report['qaOverlay'].update(readOnly=True,hashVerifiedBeforeAfter=True,candidateOriginalUnchanged=True)
else:report['qaOverlay']=None
(owned/'receipt.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
'''.replace('c=CONFIG','c='+repr(config))
result=subprocess.run([*SSH,'sudo -n python3 -'],input=remote.encode(),capture_output=True,timeout=1900)
(evidence/'controller.stdout.log').write_bytes(result.stdout);(evidence/'controller.stderr.log').write_bytes(result.stderr)
if result.returncode:
 print(result.stderr.decode(errors='replace'));raise SystemExit('Linux gallery browser controller failed')
pull=r'''
import pathlib,tarfile,sys
root=pathlib.Path(sys.argv[1]);size=0
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz') as a:
 for p in root.rglob('*'):
  if p.is_file():
   size+=p.stat().st_size;assert size<100*1024**2;a.add(p,arcname=str(p.relative_to(root)))
'''
result=subprocess.run([*SSH,'sudo -n python3 -c '+shlex.quote(pull)+' '+shlex.quote('/home/ubuntu/tadazz-phase2-20261116/evidence/'+run)],capture_output=True,timeout=180,check=True)
with tarfile.open(fileobj=io.BytesIO(result.stdout),mode='r:gz') as archive:
 for m in archive:
  p=pathlib.PurePosixPath(m.name);assert m.isfile() and not p.is_absolute() and '..' not in p.parts
  target=evidence.joinpath(*p.parts);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.extractfile(m).read())
report=json.loads((evidence/'receipt.json').read_text(encoding='utf8'))
print(json.dumps({'run':run,'mode':mode,'passed':report['passed'],'seconds':report['seconds'],'evidence':str(evidence)}),flush=True)
raise SystemExit(0 if report['passed'] else 1)
