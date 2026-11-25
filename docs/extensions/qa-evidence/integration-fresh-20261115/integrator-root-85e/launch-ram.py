"""Server-only: retained bounded RAM volume, keeper and final hydration grant."""
import json,os,pathlib,subprocess
H=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115');N='integrator-root-85e-20261115'
E=H/'evidence'/N/'metadata-hydration-r2';VOL=N+'-metadata-ram';KEEP=N+'-metadata-keeper'
v=os.statvfs(H);free=v.f_bavail*v.f_frsize
assert free>=2336*1024**2 and free>=2*1024**3,('fresh physical gate',free)
mem={k:int(v.split()[0])*1024 for k,v in (line.split(':',1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())}
assert mem['MemAvailable']>=5*1024**3,('host RAM margin',mem['MemAvailable'])
def call(label,args):
    r=subprocess.run(args,capture_output=True,text=True)
    (E/(label+'.json')).write_text(json.dumps({'command':args,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr},indent=2)+'\n')
    assert r.returncode==0,(label,r.stderr)
    return r.stdout.strip()
call('volume-create',['sudo','-n','docker','volume','create','--driver','local','--opt','type=tmpfs','--opt','device=tmpfs','--opt','o=size=805306368,mode=1777','--label','tadazz.owner=integrator-01a1de4d-71ba-76d1-b4ca-b7ae28236a40','--label','tadazz.scope=85e-public-metadata',VOL])
common=['--cpus','.5','--memory','3g','--memory-swap','3g','--pids-limit','192','--read-only','--cap-drop','ALL','--group-add',str(os.getgid()),'--security-opt','no-new-privileges']
call('keeper-start',['sudo','-n','docker','run','-d','--name',KEEP,'--network','none',*common,'--mount','type=volume,src='+VOL+',dst=/ram,volume-nocopy','-v',str(E)+':/evidence:rw','--entrypoint','sleep','tadazz:design-system-qa-20261110','infinity'])
sdk=H/'fixtures/mcp-send-ce021e537e31af7cbc989d4b2c3e5abb0966de41413f994e2803276b31dec7d9/home/.cache/pnpm/v12/metadata-full'
lock=H/'source'/N/'pnpm-lock.yaml'
container=call('hydrator-start',['sudo','-n','docker','run','-d','--name',N+'-metadata-hydration-r2','--network','bridge',*common,'--mount','type=volume,src='+VOL+',dst=/ram,volume-nocopy','-v',str(sdk)+':/metadata-sdk:ro','-v',str(lock)+':/input/pnpm-lock.yaml:ro','-v',str(E)+':/evidence:rw','--entrypoint','python3','tadazz:design-system-qa-20261110','/evidence/hydrate-ram.py'])
(E/'allocation.json').write_text(json.dumps({'volume':VOL,'keeper':KEEP,'hydrator':container,'metadata_tmpfs_cap_bytes':768*1024**2,'future_consumer_work_tmpfs_cap_bytes':768*1024**2,'aggregate_mount_caps_bytes':1536*1024**2,'physical_free_before':free,'host_memory_before':mem,'accounting':'Shared tmpfs pages are charged on allocation to the writing cgroup, then may be reparented when it exits; keeper and consumer do not each account a fresh physical copy. Separate tmpfs size caps bound aggregate file data independently of cgroup attribution. Keeper remains mounted until release.'},indent=2)+'\n')
print(json.dumps({'volume':VOL,'keeper':KEEP,'hydrator':container}))
