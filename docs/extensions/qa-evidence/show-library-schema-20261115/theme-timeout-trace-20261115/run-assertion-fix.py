from pathlib import Path
import subprocess,json,hashlib,shutil,time,datetime,sys
R=Path('/home/ubuntu/tadazz-hq-qa-20261115');TAG=sys.argv[1]
if len(TAG)!=64 or any(c not in '0123456789abcdef' for c in TAG):raise ValueError('tag')
F=R/('fixtures/theme-byte-assertion-fix-'+TAG);E=R/('evidence/theme-byte-assertion-fix-'+TAG);M=json.loads((F/'fix-input.json').read_text());S=Path(M['baseSource']);C='tadazz-hq-theme-assertion-fix-20261115';created=False
if shutil.disk_usage(R).free<2344*1048576:raise RuntimeError('HOLD_START_2344MiB')
E.mkdir(exist_ok=False)
r={'mode':M['mode'],'originalTimeoutMs':30000,'fixedTestSha256':TAG,'commands':[],'status':'RUNNING','freeBefore':shutil.disk_usage(R).free,'full819':'NOT_RUN'}
def save():
 p=E/'receipt.json.tmp';p.write_text(json.dumps(r,indent=2)+'\n');p.replace(E/'receipt.json')
def size():return sum(p.stat().st_size for folder in [F,E] for p in folder.iterdir() if p.is_file())
def budget():
 if shutil.disk_usage(R).free<2147483648 or size()>8*1048576:raise RuntimeError('HOLD_RESOURCE_BOUND')
def audit():
 errors=[]
 for e in M['records']:
  if hashlib.sha256((S/e['path']).read_bytes()).hexdigest()!=e['sha256']:errors.append(e['path'])
 for e in M['dependencyHashes']:
  if hashlib.sha256((S/'extensions/node_modules/vitest'/e['path']).read_bytes()).hexdigest()!=e['sha256']:errors.append('dependency:'+e['path'])
 if errors:raise RuntimeError('BASE_SOURCE_CHANGED:'+str(errors))
 return {'status':'PASS','baseFiles':len(M['records']),'executedVitestFiles':len(M['dependencyHashes'])}
def run(label,args,timeout=40):
 budget();start=time.time();result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout);(E/(label+'.log')).write_bytes(result.stdout);item={'label':label,'args':args,'exitCode':result.returncode,'seconds':round(time.time()-start,3),'logSha256':hashlib.sha256(result.stdout).hexdigest()};r['commands'].append(item);save();print(json.dumps(item),flush=True);budget();return result.returncode
try:
 r['baseBefore']=audit();test=F/'installation.fixed.test.ts'
 if hashlib.sha256(test.read_bytes()).hexdigest()!=TAG:raise RuntimeError('fixed test hash')
 args=['sudo','-n','docker','run','-d','--pull=never','--name',C,'--read-only','--cpus=0.25','--memory=2g','--pids-limit=128','--network=none','--workdir=/workspace/extensions','--env','XDG_DATA_HOME=/tmp/vitest-private','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--mount','type=bind,src='+str(S)+',dst=/workspace,readonly','--mount','type=bind,src='+str(test)+',dst=/workspace/'+M['changedPath']+',readonly','--mount','type=bind,src='+str(F)+',dst=/fixture,readonly','--mount','type=bind,src='+str(E)+',dst=/evidence','--entrypoint=sleep','tadazz:design-system-qa-20261110','infinity']
 if run('container-create',args,15):raise RuntimeError('container')
 created=True;info=json.loads(subprocess.check_output(['sudo','-n','docker','inspect',C]))[0];r['allocation']={'imageId':info['Image'],'nanoCpus':info['HostConfig']['NanoCpus'],'memoryBytes':info['HostConfig']['Memory'],'network':info['HostConfig']['NetworkMode'],'readonlyRootfs':info['HostConfig']['ReadonlyRootfs'],'tmpfs':info['HostConfig']['Tmpfs'],'ports':info['NetworkSettings']['Ports']}
 prefix=['sudo','-n','docker','exec',C]
 effective="const fs=require('fs'),c=require('crypto');const b=fs.readFileSync('/workspace/"+M['changedPath']+"');const h=c.createHash('sha256').update(b).digest('hex');console.log(JSON.stringify({sha256:h,expected:'"+TAG+"',match:h==='"+TAG+"'}));if(h!=='"+TAG+"')process.exit(1)"
 if run('effective-before',prefix+['node','-e',effective]):raise RuntimeError('view hash')
 run('byte-strength',prefix+['node','/fixture/byte-equality-strength.cjs'])
 run('original-five-cases',prefix+['node','node_modules/vitest/vitest.mjs','run','src/server/show-themes/installation.test.ts','--maxWorkers=1','--no-file-parallelism','--no-cache','--configLoader=runner','--reporter=json','--outputFile=/evidence/original-five-cases.json'])
 run('focused-types',prefix+['node','node_modules/typescript/bin/tsc','--project','/fixture/theme-assertion-tsconfig.json'])
 run('changed-file-format',prefix+['node','/workspace/node_modules/prettier/bin/prettier.cjs','--check','--no-config','--no-semi','--tab-width','2','--single-quote','false','--print-width','80','--trailing-comma','all','src/server/show-themes/installation.test.ts'])
 if run('effective-after',prefix+['node','-e',effective]):raise RuntimeError('view changed')
 r['baseAfter']=audit();r['measuredFixtureEvidenceBytes']=size();r['status']='FINISHED_CHECK_RECEIPTS'
except Exception as error:
 r['status']='FAILED';r['failure']=str(error);print(json.dumps({'failure':str(error)}),flush=True)
finally:
 if created:
  info=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','--size',C]))[0];r['containerWritableBytes']=info['SizeRw'];r['oomKilled']=info['State']['OOMKilled']
  subprocess.run(['sudo','-n','docker','stop','--timeout','2',C],check=True,stdout=subprocess.PIPE);subprocess.run(['sudo','-n','docker','rm',C],check=True,stdout=subprocess.PIPE);r['allocationReleased']=True
 r['finishedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();r['freeAfter']=shutil.disk_usage(R).free;save();print(json.dumps({'status':r['status'],'allocationReleased':r.get('allocationReleased',False),'freeAfter':r['freeAfter']}),flush=True)
