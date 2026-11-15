from pathlib import Path
import subprocess,json,hashlib,shutil,time,datetime,sys
ROOT=Path('/home/ubuntu/tadazz-hq-qa-20261115');TAG=sys.argv[1]
if len(TAG)!=64 or any(c not in '0123456789abcdef' for c in TAG):raise ValueError('tag')
F=ROOT/('fixtures/theme-installation-trace-'+TAG);E=ROOT/('evidence/theme-installation-trace-'+TAG)
M=json.loads((F/'trace-input.json').read_text());S=Path(M['baseSource']);C='tadazz-hq-theme-installation-trace-20261115';created=False
if shutil.disk_usage(ROOT).free<2344*1048576:raise RuntimeError('HOLD_BELOW_2344MiB_START')
E.mkdir(exist_ok=False)
r={'mode':M['mode'],'harnessSha256':TAG,'originalTimeoutMs':30000,'commands':[],'status':'RUNNING','freeBefore':shutil.disk_usage(ROOT).free,'processWatchdogSeconds':45,'watchdogIsNotTestTimeoutOverride':True}
def save():
 p=E/'receipt.json.tmp';p.write_text(json.dumps(r,indent=2)+'\n');p.replace(E/'receipt.json')
def size():return sum(p.stat().st_size for root in [F,E] for p in root.iterdir() if p.is_file())
def budget():
 free=shutil.disk_usage(ROOT).free
 if free<2147483648:raise RuntimeError('HOLD_DISK_RESERVE_2GiB')
 if size()>8*1048576:raise RuntimeError('HOLD_NEW_DISK_8MiB')
def audit():
 errors=[]
 for entry in M['records']:
  if hashlib.sha256((S/entry['path']).read_bytes()).hexdigest()!=entry['sha256']:errors.append(entry['path'])
 for entry in M['dependencyHashes']:
  if hashlib.sha256((S/'extensions/node_modules/vitest'/entry['path']).read_bytes()).hexdigest()!=entry['sha256']:errors.append('dependency:'+entry['path'])
 if errors:raise RuntimeError('INPUT_MISMATCH:'+str(errors))
 return {'status':'PASS','unchangedSourceDataAndConfigFiles':len(M['records']),'executedVitestFiles':len(M['dependencyHashes'])}
def run(label,args,timeout=15):
 budget();t=time.time();result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
 (E/(label+'.log')).write_bytes(result.stdout);item={'label':label,'args':args,'exitCode':result.returncode,'seconds':round(time.time()-t,3),'logSha256':hashlib.sha256(result.stdout).hexdigest()};r['commands'].append(item);save();print(json.dumps(item),flush=True);return result.returncode
try:
 r['inputBefore']=audit();h=F/'installation.public-step-trace.test.ts'
 if hashlib.sha256(h.read_bytes()).hexdigest()!=TAG:raise RuntimeError('HARNESS_SHA')
 args=['sudo','-n','docker','run','-d','--pull=never','--name',C,'--read-only','--cpus=0.25','--memory=2g','--pids-limit=128','--network=none','--workdir=/workspace/extensions','--env','XDG_DATA_HOME=/tmp/vitest-private','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--mount','type=bind,src='+str(S)+',dst=/workspace,readonly','--mount','type=bind,src='+str(h)+',dst=/workspace/'+M['maskedPath']+',readonly','--mount','type=bind,src='+str(E)+',dst=/evidence','--entrypoint=sleep','tadazz:design-system-qa-20261110','infinity']
 if run('container-create',args):raise RuntimeError('container create')
 created=True;info=json.loads(subprocess.check_output(['sudo','-n','docker','inspect',C]))[0]
 r['allocation']={'imageId':info['Image'],'nanoCpus':info['HostConfig']['NanoCpus'],'memoryBytes':info['HostConfig']['Memory'],'network':info['HostConfig']['NetworkMode'],'readonlyRootfs':info['HostConfig']['ReadonlyRootfs'],'tmpfs':info['HostConfig']['Tmpfs'],'ports':info['NetworkSettings']['Ports']}
 args=['sudo','-n','docker','exec',C,'node','node_modules/vitest/vitest.mjs','run','src/server/show-themes/installation.test.ts','--maxWorkers=1','--no-file-parallelism','--no-cache','--configLoader=runner','--reporter=json','--outputFile=/evidence/vitest-diagnostic.json']
 start=time.time();proc=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 with (E/'resource-monitor.jsonl').open('w') as monitor:
  while proc.poll() is None:
   budget();monitor.write(json.dumps({'wallSeconds':round(time.time()-start,3),'freeBytes':shutil.disk_usage(ROOT).free,'newFixtureEvidenceBytes':size()})+'\n');monitor.flush()
   if time.time()-start>45:
    subprocess.run(['sudo','-n','docker','stop','--timeout','2',C],check=True,stdout=subprocess.PIPE);r['watchdogTriggered']=True;break
   time.sleep(1)
 output,_=proc.communicate(timeout=5);(E/'vitest-diagnostic.log').write_bytes(output)
 r['commands'].append({'label':'vitest-diagnostic','args':args,'exitCode':proc.returncode,'seconds':round(time.time()-start,3),'logSha256':hashlib.sha256(output).hexdigest()});r['inputAfter']=audit();budget()
 r['measuredFixtureEvidenceBytes']=size();r['status']='FINISHED_DIAGNOSTIC_NOT_ORIGINAL_ACCEPTANCE';save()
except Exception as error:
 r['status']='FAILED';r['failure']=str(error);print(json.dumps({'failure':str(error)}),flush=True)
finally:
 if created:
  state=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','--size',C]))[0];r['containerWritableBytes']=state['SizeRw']
  subprocess.run(['sudo','-n','docker','stop','--timeout','2',C],check=True,stdout=subprocess.PIPE)
  subprocess.run(['sudo','-n','docker','rm',C],check=True,stdout=subprocess.PIPE);r['allocationReleased']=True
 r['finishedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();r['freeAfter']=shutil.disk_usage(ROOT).free;save();print(json.dumps({'status':r['status'],'allocationReleased':r.get('allocationReleased',False),'freeAfter':r['freeAfter']}),flush=True)
