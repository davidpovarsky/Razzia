# Operator-only stricter grant/resource enforcement. Does not change pinned runner.
from pathlib import Path
import json,sys,subprocess,shutil,hashlib,time,datetime
payload=json.load(sys.stdin);g=payload['grant'];fixture=Path(payload['fixture'])
sha=lambda b:hashlib.sha256(b).hexdigest()
if sha((fixture/'overlay-plan.json').read_bytes())!=g['plan_sha256'] or sha((fixture/'transfer-manifest.json').read_bytes())!=g['transfer_manifest_sha256']:raise SystemExit('HOLD: pinned manifest mismatch')
m=json.loads((fixture/'overlay-plan.json').read_bytes());transfer=json.loads((fixture/'transfer-manifest.json').read_bytes());evidence=Path(m['evidencePath']);root=Path(m['serverRoot'])
for f in transfer['files']:
 p=fixture/f['name']
 if p.is_symlink() or p.stat().st_size!=f['bytes'] or sha(p.read_bytes())!=f['sha256']:raise SystemExit('HOLD: uploaded byte mismatch')
def ram():
 return {s.split(':')[0]:int(s.split()[1])*1024 for s in Path('/proc/meminfo').read_text().splitlines() if s.startswith(('MemAvailable:','MemTotal:'))}
free=shutil.disk_usage(root).free;memory=ram()
pre={'mode':'OPERATOR_FRESH_GATE_BEFORE_SINGLE_LAUNCH','freeBytes':free,'freshGateBytes':g['fresh_disk_gate_mib']*1048576,'ram':memory,'planUnchanged':True,'transferUnchanged':True,'sourceUnchanged':True,'grantId':g['grant_id']}
print(json.dumps(pre),flush=True)
if free<g['fresh_disk_gate_mib']*1048576 or memory['MemAvailable']<g['memory_gib']*1073741824:raise SystemExit('HOLD: fresh2396MiB/2GiB RAM gate')
docker_root=subprocess.check_output(['sudo','-n','docker','info','--format','{{.DockerRootDir}}'],timeout=15).decode().strip()
if not docker_root.startswith('/var/lib/'):raise SystemExit('HOLD: unexpected Docker storage root')
container=m['container'];samples=[];peak=0;reason=None
command=['python3',str(fixture/'run-compiled-index.py'),'--expected-plan-sha256',g['plan_sha256'],'--expected-transfer-sha256',g['transfer_manifest_sha256'],'--root-grant-id',g['grant_id'],'--execute-after-root-grant']
started=time.monotonic();child=subprocess.Popen(command,stdout=sys.stdout,stderr=subprocess.STDOUT)
def physical(paths,sudo=False):
 if not paths:return 0
 args=(['sudo','-n'] if sudo else [])+['du','-s','-B1','--']+paths
 r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
 if r.returncode:raise RuntimeError('HOLD: physical usage measurement failed')
 return sum(int(line.split()[0]) for line in r.stdout.decode().splitlines())
def sample():
 free=shutil.disk_usage(root).free
 persistent=physical([str(p) for p in (fixture,evidence) if p.exists()])
 writable=metadata=0;layer_observed=False;exists=False
 inspect=subprocess.run(['sudo','-n','docker','inspect','--size',container],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
 if inspect.returncode==0:
  info=json.loads(inspect.stdout)[0];labels=info['Config'].get('Labels') or {}
  if labels.get('tadazz.qa.root-grant')!=g['grant_id'] or labels.get('tadazz.qa.source-bundle')!=m['diagnosticSourceBundleSha256']:raise RuntimeError('HOLD: observer ownership mismatch')
  exists=True;cid=info['Id']
  if len(cid)!=64 or any(c not in '0123456789abcdef' for c in cid):raise RuntimeError('HOLD: invalid owned container ID')
  upper=(info.get('GraphDriver',{}).get('Data') or {}).get('UpperDir')
  if upper:
   if not upper.startswith(docker_root+'/'):raise RuntimeError('HOLD: unexpected own upper directory')
   writable=physical([upper],True);layer_observed=True
  else:writable=info.get('SizeRw',0)
  metadata=physical([docker_root+'/containers/'+cid],True)
 observed=persistent+writable+metadata
 # One MiB conservative allowance covers shared Docker dispatcher metadata,
 # while own persistent/layer/container-directory bytes are measured directly.
 bounded=observed+1048576
 row={'elapsedSeconds':round(time.monotonic()-started,3),'freeBytes':free,'ram':ram(),'fixtureEvidencePhysicalBytes':persistent,'ownedWritableLayerBytes':writable,'layerPhysicalObserved':layer_observed,'ownedContainerMetadataPhysicalBytes':metadata,'containerObserved':exists,'measuredOwnedPhysicalBytes':observed,'sharedDockerMetadataAllowanceBytes':1048576,'boundedNewPhysicalBytes':bounded}
 return row
try:
 while child.poll() is None:
  row=sample();samples.append(row);peak=max(peak,row['boundedNewPhysicalBytes']);print(json.dumps({'resourceSample':row}),flush=True)
  if row['freeBytes']<g['absolute_disk_reserve_mib']*1048576 or row['boundedNewPhysicalBytes']>g['max_new_disk_mib']*1048576 or time.monotonic()-started>m['resourceProposalNotGrant']['jobWatchdogSeconds']:
   raise RuntimeError('HOLD: operator resource floor/new-physical/watchdog')
  time.sleep(3)
except BaseException as error:
 reason=str(error)
 if child.poll() is None:
  child.terminate()
  try:child.wait(timeout=35)
  except subprocess.TimeoutExpired:reason+='; child did not finish cleanup in35s'
finally:
 if child.poll() is None:raise SystemExit('HOLD: owned runner cleanup requires review')
 final=sample();samples.append(final);peak=max(peak,final['boundedNewPhysicalBytes'])
 summary={'mode':'STRICTER2396MiB_OPERATOR_GATE_AND_PHYSICAL_MONITOR','grantId':g['grant_id'],'freshBeforeLaunch':pre,'runnerExitCode':child.returncode,'operatorFailure':reason,'peakBoundedNewPhysicalBytes':peak,'maxNewPhysicalBytes':g['max_new_disk_mib']*1048576,'final':final,'sourceOrPinnedPlanEdits':'NONE','singleRunnerLaunches':1,'finishedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 if evidence.exists():
  (evidence/'operator-resource-monitor.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in samples))
  (evidence/'operator-resource-receipt.json').write_text(json.dumps(summary,indent=2)+'\n')
  summary['finalPersistedPhysicalBytes']=physical([str(fixture),str(evidence)])
 print(json.dumps({'operatorFinal':summary}),flush=True)
raise SystemExit(child.returncode if reason is None else 1)
