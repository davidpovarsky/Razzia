"""Run the gallery's native editor and public browsers on the Linux server.

Usage: python extensions/qa/public-gallery/linux-browser-verify.py SOURCE_RUN
       python .../linux-browser-verify.py SOURCE_RUN --live-container FULL_ID
Both modes verify the immutable source archive used by the successful native build.
The live mode additionally binds the result to the running deployment's revision.
"""
import argparse
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
args=parser.parse_args()
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip()
assert re.fullmatch('tadazz-codex-'+sha[:12]+'-[a-f0-9]{8}',args.source_run)
if args.live_container:assert re.fullmatch('[a-f0-9]{64}',args.live_container)
previous=ROOT/'docs/extensions/plans/phase3-takeover-20261117'/args.source_run
source=json.loads((previous/'input-manifest.json').read_text(encoding='utf8'))
build=json.loads((previous/'receipt.json').read_text(encoding='utf8'))
assert source['sha']==sha and build['sha']==sha and build['allHashesVerifiedBeforeAfter']
assert all(x['exit']==0 for x in build['checks'])
assert {'native-site-build','native-application-preview-build'}.issubset({x['label'] for x in build['checks']})
mode='live' if args.live_container else 'candidate'
run='tadazz-gallery-'+mode+'-'+sha[:12]+'-'+uuid.uuid4().hex[:8]
evidence=ROOT/'docs/extensions/plans/public-gallery-20261119'/run
evidence.mkdir(parents=True,exist_ok=False)
config={'sha':sha,'sourceRun':args.source_run,'manifest':source['files'],'run':run,'mode':mode,'liveContainer':args.live_container}
(evidence/'input-manifest.json').write_text(json.dumps(config,indent=2)+'\n',encoding='utf8')
SSH=['ssh','-i',str(pathlib.Path.home()/'.ssh/tadazz_oracle_2026'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','ubuntu@132.145.25.168']
remote=r'''
import pathlib,json,hashlib,subprocess,time,atexit
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
entries={str(p.relative_to(deps)):('link:'+str(p.readlink()) if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest()) for p in deps.rglob('*') if p.is_file() or p.is_symlink()}
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
argv=['docker','run','--detach','--pull=never','--init','--read-only','--name',name,'--network',network,'--cpus','1','--memory','2g','--memory-swap','2g','--pids-limit','384','--shm-size','256m','--tmpfs','/tmp:rw,nosuid,nodev,size=536870912','--label','com.tadazz.qa=public-gallery-browser']
for origin,target,readonly in mounts:argv+=['--mount','type=bind,source='+str(origin)+',target='+target+(',readonly' if readonly else '')]
argv+=['--entrypoint','/bin/sleep',facts['Image'],'infinity'];subprocess.run(argv,check=True,stdout=subprocess.DEVNULL)
atexit.register(lambda:subprocess.run(['docker','stop','--time','10',name],check=True,stdout=subprocess.DEVNULL,timeout=25))
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
assert deployment()==deployed,'Deployment changed during live acceptance'
receipt_path=owned/'browser/receipt.json';inner=json.loads(receipt_path.read_text()) if receipt_path.exists() else None
state=json.loads(subprocess.check_output(['docker','inspect',name]))[0]['State']
report={'sha':c['sha'],'sourceRun':c['sourceRun'],'run':c['run'],'mode':c['mode'],'exit':result.returncode,'seconds':round(time.time()-start,2),'passed':result.returncode==0 and inner is not None and inner.get('passed') is True,'allSourceHashesVerified':True,'sourceReadOnly':True,'customerMountUsed':False,'productionChanged':False,'network':network,'deployment':deployed,'oomKilled':state.get('OOMKilled',False),'browserReceipt':inner}
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
