"""Bounded read-only delta validation: one test overlay, existing immutable source/deps."""
from pathlib import Path
import subprocess,json,hashlib,shutil,datetime,time,sys
ROOT=Path('/home/ubuntu/tadazz-hq-qa-20261115');PIN=sys.argv[1]
if len(PIN)!=64 or any(c not in '0123456789abcdef' for c in PIN):raise ValueError('pin')
BASE='f9eaba0259c24a98394d4b61aa783e24c39beff1ca801c24c573d88852c96bf0'
SOURCE=ROOT/('source/sb-metadata-'+BASE);OLD=ROOT/('fixtures/sb-metadata-'+BASE)
FIXTURES=ROOT/('fixtures/sb-metadata-delta-'+PIN);EVIDENCE=ROOT/('evidence/sb-metadata-delta-'+PIN)
CONTAINER='tadazz-hq-sb-metadata-20261115';created=False
if shutil.disk_usage(ROOT).free<2600*1048576:raise RuntimeError('START_RESERVE_BELOW_2600MiB')
EVIDENCE.mkdir(exist_ok=False)
manifest=json.loads((FIXTURES/('metadata-delta-'+PIN+'.json')).read_text())
content={k:v for k,v in manifest.items() if k!='deltaSourcePin'}
if hashlib.sha256(json.dumps(content,sort_keys=True,separators=(',',':')).encode('ascii')).hexdigest()!=PIN:raise ValueError('delta pin')
base=json.loads((OLD/('port3-manifest-'+BASE+'.json')).read_text())
receipt={'deltaSourcePin':PIN,'baseOverlaySha256':BASE,'status':'RUNNING','commands':[],'diskFreeBefore':shutil.disk_usage(ROOT).free,'sourceReadonly':True,'install':'NOT_RUN','newClone':'NONE','broaderRegressions':'NOT_REPEATED_UNCHANGED_BYTES','overlayBytes':sum(p.stat().st_size for p in FIXTURES.iterdir() if p.is_file())}
if receipt['overlayBytes']>1048576:raise ValueError('overlay budget')

def save():
 p=EVIDENCE/'receipt.json.tmp';p.write_text(json.dumps(receipt,indent=2)+'\n');p.replace(EVIDENCE/'receipt.json')
def reserve():
 free=shutil.disk_usage(ROOT).free;receipt['lastDiskFreeBytes']=free
 if free<2147483648:raise RuntimeError('HOLD_RESERVE_BELOW_2GiB')
def original_hashes():
 errors=[]
 for entry in base['files']:
  if hashlib.sha256((SOURCE/entry['path']).read_bytes()).hexdigest()!=entry['sha256']:errors.append(entry['path'])
 if errors:raise RuntimeError('immutable source changed: '+str(errors))
 return {'status':'PASS','moduleFiles':len(base['files'])}
def run(label,args):
 reserve();start=time.time();r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 (EVIDENCE/(label+'.log')).write_bytes(r.stdout)
 item={'label':label,'args':args,'exitCode':r.returncode,'seconds':round(time.time()-start,3),'logSha256':hashlib.sha256(r.stdout).hexdigest()}
 receipt['commands'].append(item);save();print(json.dumps(item),flush=True);reserve();return r.returncode
AUDIT=r"""const fs=require('fs'),c=require('crypto');const m=JSON.parse(fs.readFileSync('/baseline-manifest.json')),d=JSON.parse(fs.readFileSync('/delta/metadata-delta-"""+PIN+r""".json'));let errors=[];for(const e of m.baseline){const b=fs.readFileSync('/workspace/'+e.path);if(b.length!==e.bytes||c.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex')!==e.gitBlob)errors.push(e.path)}for(const e of d.files){const b=fs.readFileSync('/workspace/'+e.path);if(b.length!==e.bytes||c.createHash('sha256').update(b).digest('hex')!==e.sha256)errors.push(e.path)}console.log(JSON.stringify({status:errors.length?'FAIL':'PASS',baselineFiles:m.baseline.length,overlayFiles:d.files.length,errors}));if(errors.length)process.exit(1)"""
try:
 receipt['immutableBefore']=original_hashes();reserve()
 changed=manifest['changedPath'];test=FIXTURES/'stage-metadata.test.ts';entry=next(e for e in manifest['files'] if e['path']==changed)
 if hashlib.sha256(test.read_bytes()).hexdigest()!=entry['sha256']:raise ValueError('test SHA')
 args=['sudo','-n','docker','run','-d','--pull=never','--name',CONTAINER,'--read-only','--cpus=0.25','--memory=2g','--pids-limit=128','--network=none','--workdir=/workspace','--tmpfs','/tmp:rw,nosuid,size=128m','--mount','type=bind,src='+str(SOURCE)+',dst=/workspace,readonly','--mount','type=bind,src='+str(FIXTURES)+',dst=/delta,readonly','--mount','type=bind,src='+str(test)+',dst=/workspace/'+changed+',readonly','--mount','type=bind,src='+str(OLD/('port3-manifest-'+BASE+'.json'))+',dst=/baseline-manifest.json,readonly','--mount','type=bind,src='+str(EVIDENCE)+',dst=/evidence','--entrypoint=sleep','tadazz:design-system-qa-20261110','infinity']
 if run('container-create',args):raise RuntimeError('container create')
 created=True
 info=json.loads(subprocess.check_output(['sudo','-n','docker','inspect',CONTAINER]))[0]
 receipt['allocation']={'nanoCpus':info['HostConfig']['NanoCpus'],'memoryBytes':info['HostConfig']['Memory'],'network':info['HostConfig']['NetworkMode'],'readonlyRootfs':info['HostConfig']['ReadonlyRootfs'],'ports':info['NetworkSettings']['Ports'],'imageId':info['Image']}
 prefix=['sudo','-n','docker','exec',CONTAINER]
 if run('source-before',prefix+['node','-e',AUDIT]):raise RuntimeError('source before')
 run('focused-tests',['sudo','-n','docker','exec','-w','/workspace/extensions',CONTAINER,'node','node_modules/vitest/vitest.mjs','run','src/core/show-library/stage-metadata.test.ts','--maxWorkers=1','--no-file-parallelism','--no-cache','--configLoader=runner','--reporter=json','--outputFile=/evidence/focused-tests.json'])
 run('focused-types',prefix+['node','extensions/node_modules/typescript/bin/tsc','--project','extensions/src/core/show-library/tsconfig.focused.json'])
 if run('source-after',prefix+['node','-e',AUDIT]):raise RuntimeError('source after')
 receipt['immutableAfter']=original_hashes()
 info=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','--size',CONTAINER]))[0]
 receipt['containerWritableBytes']=info['SizeRw'];receipt['evidenceAndOverlayBytes']=sum(p.stat().st_size for folder in [FIXTURES,EVIDENCE] for p in folder.iterdir() if p.is_file())
 if receipt['containerWritableBytes']+receipt['evidenceAndOverlayBytes']>64*1048576:raise RuntimeError('new disk budget')
 receipt['status']='FINISHED_CHECK_RECEIPTS'
except Exception as error:
 receipt['status']='FAILED';receipt['failure']=str(error);print(json.dumps({'failure':str(error)}),flush=True)
finally:
 if created:
  subprocess.run(['sudo','-n','docker','stop','--timeout','2',CONTAINER],check=True,stdout=subprocess.PIPE)
  subprocess.run(['sudo','-n','docker','rm',CONTAINER],check=True,stdout=subprocess.PIPE)
  receipt['allocationReleased']=True
 receipt['finishedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();receipt['diskFreeAfter']=shutil.disk_usage(ROOT).free;save();print(json.dumps({'status':receipt['status'],'allocationReleased':receipt.get('allocationReleased',False),'diskFreeAfter':receipt['diskFreeAfter']}),flush=True)
