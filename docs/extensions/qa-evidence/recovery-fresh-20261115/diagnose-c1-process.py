"""Read only the stopped owned container metadata/cgroup, never restart it."""
import json
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / 'c1-process-diagnosis'
SSH = ['ssh', '-i', 'C:/Users/DAVID/.ssh/tadazz_oracle_2026', '-o', 'BatchMode=yes',
       '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', 'ubuntu@132.145.25.168']
SCRIPT = r'''
import json,pathlib,subprocess,os,shutil,time
cid='77bf6b4467255991f45c3ec71ebcedde77838e5e87b91ab192d82bafb542c570'
d=['sudo','-n','docker']
identity=json.loads(subprocess.check_output(d+['inspect',cid],text=True))[0]
assert identity['Id']==cid and identity['State']['Running'] is False and identity['State']['Pid']==0
info=json.loads(subprocess.check_output(d+['info','--format','{"cgroupDriver":{{json .CgroupDriver}},"cgroupVersion":{{json .CgroupVersion}},"initBinary":{{json .InitBinary}}}'],text=True))
scopes=[]
for scope in [pathlib.Path('/sys/fs/cgroup/system.slice')/('docker-'+cid+'.scope'),pathlib.Path('/sys/fs/cgroup/docker')/cid]:
 item={'path':str(scope),'existsAfterStop':scope.exists(),'files':{},'ownedProcesses':[]}
 if scope.exists():
  for name in ['pids.current','pids.max','pids.events','pids.peak','cgroup.procs']:
   p=scope/name
   item['files'][name]=p.read_text()[:8192] if p.exists() else None
  for value in (item['files'].get('cgroup.procs') or '').split():
   pid=int(value); proc=pathlib.Path('/proc')/str(pid)
   try:
    cg=(proc/'cgroup').read_text()
    if cid not in cg: continue
    status={k:v.strip() for k,v in (line.split(':',1) for line in (proc/'status').read_text().splitlines() if ':' in line)}
    item['ownedProcesses'].append({k:status.get(k) for k in ['Name','State','Tgid','Pid','PPid','Uid','Gid','Threads']})
   except FileNotFoundError: item['ownedProcesses'].append({'pid':pid,'exitedDuringRead':True})
 scopes.append(item)
init=shutil.which(info['initBinary'])
result={'time':time.time(),'readOnly':True,'containerId':cid,'state':identity['State'],
        'hostConfig':{k:identity['HostConfig'].get(k) for k in ['PidsLimit','Init','Ulimits','Memory','MemorySwap','NanoCpus','CgroupParent','PidMode']},
        'containerPath':identity['Path'],'containerArgs':identity['Args'],'docker':info,
        'existingInitPath':init,'existingInitRegularFile':bool(init and pathlib.Path(init).is_file()),
        'stoppedCgroupScopes':scopes,'historicalPidsCurrentMaxEventsCaptured':False,
        'historicalZombieAndThreadCountsCaptured':False,'startedOrChangedAnything':False}
print(json.dumps(result,indent=2))
'''
assert not OUT.exists(), 'Never overwrite earlier diagnosis'
OUT.mkdir()
result = subprocess.run(SSH + ['python3 -'], input=SCRIPT.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
(OUT / 'stopped-container.stderr.log').write_bytes(result.stderr)
(OUT / 'stopped-container-readonly.json').write_bytes(result.stdout)
result.check_returncode()
print(result.stdout.decode())
