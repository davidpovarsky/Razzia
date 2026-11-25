#!/usr/bin/env python3
"""Single-use retained synthetic rollback under owner-activated wave A; no production target."""
import hashlib, importlib.util, json, os, pathlib, stat, subprocess, sys, threading, time

N='175b5f805067a9953b75954abff0e839'
ROOT=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
FIX=ROOT/'fixtures'/('atomic-3527-fault-'+N)
CONTROL=FIX/'control'
OLD=pathlib.Path('/run/tadazz-atomic-qa')/N/'l'
PHASE=pathlib.Path('/run/tadazz-atomic-qa')/N/'phase2-wave-A'
TARGET='505772e38a7c0ecd700f82d189219f0b951a7cc95eb933ea58372ccf72b1fab8'
CONTROLLER='701c07ef1fab02d5772fb2af15b733f0fdd5383a170c46da69fb3a529f343757'
TSTART='2026-11-15T11:33:46.733525138Z'; CSTART='2026-11-15T11:33:47.11610192Z'
IMAGE='sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346'
HELPER='352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2'
DRIVER='88e1ce3a89edd45eccaf856e10adeabd17dd59b47f95cc7bd240518124877b26'
WITNESS='93916d077b6aa9a2be9329cdb765133656ad3ec097f855748b27abaa29eaadbb'
BASE='f79f270e5be9662e3f5b36c7de9bebb7077da387d92cfd37ddceaac7e1817ca9'
NEW='3f7b3942cca983f09a6fd15d335ac7b01895fc5c9530dd339ac0721a59a20b57'
LEASE='3d8aa4b2bd6e9f5b1c012d65473aba79c0498265fa4eb527ca30199ffd9eb803'
PAYLOAD='da1144d4c78ce7b1d377c56302074e60135ee9755ce03c7c34cf2e9cbf504827'
HOLD='8b825d6823fc4e01a9c158cf08594a09681375b6ba621c250424f7d45ecdc4cb'
PUBLISH_EXEC='0af8e929ebd92b1439a1a4b7c29fa8e86b849f8977f4ead97feeaa4ebbb15818'
TRANSCRIPT='571ed4039d6d78d27c2a6691b1b3db8dc9fa939af624ad734493e8f28174f350'
FINAL='c2ed24c2e78c92a6e6af9bae9bcbbfd17571d7b025145736a6d13e056aa48e8f'
ENV={'PATH':'/usr/bin:/bin','HOME':'/nonexistent','DOCKER_CONFIG':'/nonexistent'}
def sha(b): return hashlib.sha256(b).hexdigest()
def source(path, pin, uid=0, mode=0o400, limit=262144):
 raw,_=w.read(path,uid,mode,limit)
 if sha(raw)!=pin: raise ValueError('source pin '+str(path))
 return raw
def save(name, value):
 d=os.open(PHASE,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=d)
  try:
   data=(json.dumps(value,sort_keys=True)+'\n').encode(); view=memoryview(data)
   while view:
    n=os.write(fd,view)
    if n<=0: raise OSError('short write')
    view=view[n:]
   os.fsync(fd)
  finally: os.close(fd)
  os.fsync(d)
 finally: os.close(d)
def inspect(cid):
 return json.loads(subprocess.check_output(['/usr/bin/docker','--host','unix:///var/run/docker.sock','inspect',cid],env=ENV,timeout=30))[0]
def identity():
 a=inspect(TARGET); c=inspect(CONTROLLER)
 w.target({'target':TARGET,'targetStarted':TSTART})
 for obj,cid,start in ((a,TARGET,TSTART),(c,CONTROLLER,CSTART)):
  if obj['Id']!=cid or not obj['State']['Running'] or obj['State']['OOMKilled'] or obj['State']['StartedAt']!=start: raise ValueError('container state')
 h=a['HostConfig']; ch=c['HostConfig']
 if h.get('NanoCpus')!=250000000 or h.get('Memory')!=268435456: raise ValueError('app limit')
 if c['Name']!='/tadazz-atomic-controller-'+N or (c['Config'].get('Labels') or {}).get('codex.synthetic.nonce')!=N or (c['Config'].get('Labels') or {}).get('codex.synthetic.role')!='controller' or c['Image']!='sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647' or ch.get('NetworkMode')!='none' or ch.get('PortBindings') or c['NetworkSettings'].get('Ports') or ch.get('NanoCpus')!=62500000 or ch.get('Memory')!=1610612736 or not ch.get('ReadonlyRootfs'): raise ValueError('controller identity')
 # Compare complete current host config and mounts with the pinned start receipt.
 receipt=json.loads(w.read(PHASE/'rollback-controller-identity.json',0,0o400,262144)[0])
 if receipt!={'hostConfig':ch,'mounts':c['Mounts'],'config':c['Config']}: raise ValueError('controller configuration drift')
 return {'target':a['Id'],'controller':c['Id'],'targetStarted':TSTART,'controllerStarted':CSTART}
def scope():
 lines=pathlib.Path('/proc/self/cgroup').read_text().splitlines()
 if len(lines)!=1 or not lines[0].startswith('0::/') or ('tadazz-atomic-rollback-'+N+'-wave-A.scope') not in lines[0].split('/'): raise ValueError('scope')
 p=(pathlib.Path('/sys/fs/cgroup')/lines[0][4:]).resolve(); q,period=(p/'cpu.max').read_text().split(); m=(p/'memory.max').read_text().strip()
 if not p.is_relative_to('/sys/fs/cgroup') or q=='max' or int(q)*16>int(period) or m=='max' or int(m)>128*1024*1024 or (p/'memory.swap.max').read_text().strip()!='0': raise ValueError('resource scope')
def check_hold():
 raw,st=w.read(CONTROL/'production-operation-hold.json',1001,0o600,65536); h=json.loads(raw)
 if sha(raw)!=HOLD or (st.st_dev,st.st_ino)!=(2049,1689493) or h.get('phase')!='closed' or h.get('execId')!=PUBLISH_EXEC or h.get('action')!='publish' or h.get('exitCode')!=0: raise ValueError('original hold')
 return h

def runtime_snapshot(asset):
 # HTTP is loopback-only inside the existing no-network target. Process identity
 # includes pid/starttime/executable and is compared before and after.
 code=r'''import hashlib,http.client,json,os
out={"processes":[],"http":{}}
for p in os.listdir('/proc'):
 if not p.isdigit(): continue
 try:
  cmd=open('/proc/'+p+'/cmdline','rb').read().replace(b'\0',b' ').decode(errors='replace')
  exe=os.readlink('/proc/'+p+'/exe'); s=open('/proc/'+p+'/stat').read(); start=s[s.rfind(')')+2:].split()[19]
  if os.path.basename(exe) in ('node','nginx') or cmd.startswith('nginx:'): out['processes'].append([int(p),start,exe,cmd])
 except (OSError,IndexError): pass
for path in ('/', '/'+os.environ['QA_ASSET']):
 c=http.client.HTTPConnection('127.0.0.1',3000,timeout=10);c.request('GET',path);r=c.getresponse(); b=r.read(8388609);c.close()
 if len(b)>8388608: raise ValueError('http bound')
 out['http'][path]=[r.status,hashlib.sha256(b).hexdigest()]
out['processes'].sort();print(json.dumps(out,sort_keys=True))'''
 raw=subprocess.check_output(['/usr/bin/docker','--host','unix:///var/run/docker.sock','exec','-e','QA_ASSET='+asset,TARGET,'python3','-B','-c',code],env=ENV,timeout=45)
 obj=json.loads(raw); procs=obj['processes']
 if not any(pathlib.PurePath(x[2]).name=='node' for x in procs) or not any(pathlib.PurePath(x[2]).name=='nginx' or x[3].startswith('nginx:') for x in procs): raise ValueError('missing Node/nginx')
 return obj

def allocated(paths):
 # No following symlinks, no cross-device traversal, deduplicate hard links.
 seen=set(); total=0
 def walk(p, device=None):
  nonlocal total
  st=os.lstat(p)
  if stat.S_ISLNK(st.st_mode) or not (stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode)): raise ValueError('foreign accounting entry')
  if device is not None and st.st_dev!=device: raise ValueError('accounting device crossing')
  key=(st.st_dev,st.st_ino)
  if key in seen: return
  seen.add(key);total+=st.st_blocks*512
  if stat.S_ISDIR(st.st_mode):
   with os.scandir(p) as entries:
    for entry in entries: walk(entry.path,st.st_dev)
 for path in paths: walk(path)
 return total

def account(additions):
 # /proc/PID/root is the sole intentional symlink; PID and start are pinned
 # to this exact live container on both sides of the sample. All paths below
 # it are checked as regular files/directories without following symlinks.
 a=inspect(TARGET); pid=a['State']['Pid']
 if a['Id']!=TARGET or a['State']['StartedAt']!=TSTART or not a['State']['Running'] or type(pid)!=int or pid<=0: raise ValueError('accounting target')
 statline=pathlib.Path('/proc',str(pid),'stat').read_text(); started=statline[statline.rfind(')')+2:].split()[19]
 root=pathlib.Path('/proc')/str(pid)/'root'; app=root/'app'; web=app/'web'
 for p in (app,web,web/'assets'):
  st=os.lstat(p)
  if not stat.S_ISDIR(st.st_mode): raise ValueError('unsafe app accounting path')
 apppaths=[app/'.tadazz-web-release-31b3cb0',web/'index.html']
 for name in sorted(additions):
  parts=pathlib.PurePosixPath(name).parts
  if not parts or any(x in ('','.','..') for x in parts): raise ValueError('unsafe addition')
  p=web
  for component in parts:
   p=p/component; s=os.lstat(p)
   if stat.S_ISLNK(s.st_mode): raise ValueError('symlink addition')
  apppaths.append(p)
 appblocks=allocated(apppaths)
 rootdir=subprocess.check_output(['/usr/bin/docker','--host','unix:///var/run/docker.sock','info','--format','{{.DockerRootDir}}'],env=ENV,text=True,timeout=30).strip()
 if rootdir!='/var/lib/docker': raise ValueError('unexpected docker root')
 sized=json.loads(subprocess.check_output(['/usr/bin/docker','--host','unix:///var/run/docker.sock','inspect','--size',TARGET],env=ENV,timeout=30))[0]
 if sized['Id']!=TARGET or sized['State']['StartedAt']!=TSTART or type(sized.get('SizeRw'))!=int or sized['SizeRw']<0: raise ValueError('docker size')
 paths=[FIX, ROOT/'evidence'/'atomic-3527-provision-175b', OLD, PHASE,
        pathlib.Path(rootdir)/'containers'/TARGET,pathlib.Path(rootdir)/'containers'/CONTROLLER]
 own=allocated(paths); overlay=max(appblocks,sized['SizeRw'])
 # Explicit conservative additional allowance covers metadata/log rounding;
 # SizeRw is Docker's logical/proxy measure, not measured physical UpperDir.
 allowance=8*1024*1024; used=own+overlay+allowance
 again=inspect(TARGET); line=pathlib.Path('/proc',str(pid),'stat').read_text()
 if again['State']['Pid']!=pid or again['State']['StartedAt']!=TSTART or line[line.rfind(')')+2:].split()[19]!=started: raise ValueError('accounting identity changed')
 fs=os.statvfs(ROOT);free=fs.f_bavail*fs.f_frsize
 oldindex=os.lstat(app/'.tadazz-web-release-31b3cb0'/'backup'/'index.html')
 if not stat.S_ISREG(oldindex.st_mode): raise ValueError('old index')
 return {'timeNs':time.time_ns(),'ownedAllocatedBytes':own,'appPathAllocatedBytes':appblocks,'dockerSizeRwProxyBytes':sized['SizeRw'],'metadataLogAllowanceBytes':allowance,'conservativeBytes':used,'freeBytes':free,'targetPid':pid,'targetPidStart':started,'oldIndexBytes':oldindex.st_size}

def budget_ok(sample,headroom=0):
 if sample['freeBytes']<2*1024**3+headroom or sample['conservativeBytes']+headroom>200*1024**2: raise ValueError('sampled budget')

def sample_budget(stop, additions, samples, errors, ready):
 ready.set()
 while not stop.is_set():
  try:
   sample=account(additions);samples.append(sample);budget_ok(sample)
  except Exception as exc:
   errors.append(type(exc).__name__);return
  if len(samples)>=256:return
  stop.wait(2)

def observe(mod, stop, records):
 engine=mod.EngineAdapter()
 while not stop.is_set():
  try:
   raw,_=w.read(CONTROL/'production-operation-hold.json',1001,0o600,65536); h=json.loads(raw)
   eid=h.get('execId')
   if h.get('action')=='rollback' and h.get('targetId')==TARGET and h.get('inputHash')==PAYLOAD and h.get('leaseHash')==LEASE and isinstance(eid,str) and len(eid)==64:
    v=engine.inspect(eid,TARGET); records.append({'whenNs':time.time_ns(),**v})
    if len(records)>=4096: return
  except (FileNotFoundError,ValueError,KeyError,OSError): pass
  stop.wait(0.02)

def main():
 global w
 if os.geteuid()!=0 or not sys.flags.isolated or pathlib.Path(__file__)!=PHASE/'rollback-phase2.py': raise ValueError('root isolated source')
 # Bootstrap reviewed witness read/inventory helpers from the immutable original.
 fd=os.open(OLD/'atomic-3527-transparent-witness.py',os.O_RDONLY|os.O_NOFOLLOW)
 try:
  st=os.fstat(fd)
  if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_nlink!=1 or stat.S_IMODE(st.st_mode)!=0o400 or st.st_size>262144: raise ValueError('unsafe witness')
  raw=os.read(fd,262145)
 finally: os.close(fd)
 if sha(raw)!=WITNESS: raise ValueError('witness bytes')
 spec=importlib.util.spec_from_file_location('phase1_witness',OLD/'atomic-3527-transparent-witness.py'); w=importlib.util.module_from_spec(spec);exec(compile(raw,str(OLD/'atomic-3527-transparent-witness.py'),'exec'),w.__dict__)
 source(OLD/'atomic-3527-transparent-witness.py',WITNESS); scope()
 st=PHASE.stat()
 if st.st_uid!=0 or stat.S_IMODE(st.st_mode)!=0o700: raise ValueError('phase directory')
 selfraw,_=w.read(PHASE/'rollback-phase2.py',0,0o400,262144)
 approval=json.loads(w.read(PHASE/'agent-approval.json',0,0o400,65536)[0])
 expected={'issuer':'01a1dfa9-3316-7a02-afef-3dccd5939e79','parentAuthorization':'SINGLE_MANAGER_WAVE_RESTART_20261115','action':'rollback','nonce':N,'target':TARGET,'targetStarted':TSTART,'controller':CONTROLLER,'controllerStarted':CSTART,'helper':HELPER,'driver':sha(selfraw),'lease':LEASE,'payload':PAYLOAD,'publishExec':PUBLISH_EXEC,'hold':HOLD,'final':FINAL,'identityReceipt':sha(w.read(PHASE/'rollback-controller-identity.json',0,0o400,262144)[0])}
 if approval!=expected: raise ValueError('approval')
 if subprocess.check_output(['/usr/bin/systemctl','show','tadazz-atomic-proxy-'+N+'.service','--property=ActiveState','--value'],env=ENV,text=True).strip()!='inactive': raise ValueError('proxy active')
 source(OLD/'transparent-final.json',FINAL,0,0o600);source(OLD/'transcript.jsonl',TRANSCRIPT,0,0o600,1048576)
 source(FIX/'driver.py',DRIVER,1001,0o400);source(FIX/'atomic-web-publish.py',HELPER,1001,0o400);source(CONTROL/'hq-lease.json',LEASE,1001,0o600)
 helper=source(PHASE/'atomic-web-publish.py',HELPER)
 spec=importlib.util.spec_from_file_location('phase2_exact_helper',PHASE/'atomic-web-publish.py'); mod=importlib.util.module_from_spec(spec);sys.modules[spec.name]=mod;exec(compile(helper,str(PHASE/'atomic-web-publish.py'),'exec'),mod.__dict__)
 target=mod.FixtureTarget(container_id=TARGET,name='tadazz-atomic-qa-'+N,nonce=N,image=IMAGE,started=TSTART,operator=str(FIX/'operator'),control=str(CONTROL),receipt=str(CONTROL/'public-file-sizes-and-controls.json'),lock_name='qa-release.lock',owner_uid=1001,helper_sha256=HELPER,mounts=(),tmpfs=(('/app/config','rw,nosuid,nodev,size=128m,mode=0700'),))
 def inputs():
  target.verify_helper();target.validate(mod.EngineAdapter())
  if mod.verify_hq_lease(target,'rollback')!=LEASE or sha(mod.build_payload(FIX/'operator',CONTROL))!=PAYLOAD: raise ValueError('inputs')
  check_hold(); identity()
 inputs()
 baseline=json.loads(source(FIX/'operator'/'base-web-inventory.json',BASE,1001,0o664))['files']; new=json.loads(source(FIX/'operator'/'candidate-web-inventory.json',NEW,1001,0o664))['files']
 recorded=json.loads(w.read(OLD/'transparent-public-hashes.json',0,0o600,262144)[0])
 if len(new)!=242 or len(baseline)!=202 or recorded!={'live':new,'backup':baseline}: raise ValueError('recorded inventories')
 live=w.inventory(TARGET); backup=w.inventory(TARGET,True)
 if live!=new or backup!=baseline: raise ValueError('pre inventory')
 # Select an asset present in both versions and matching the expected public map.
 assets=sorted(x for x in new if x.startswith('assets/') and x not in baseline)
 if len(set(new)-set(baseline))!=40 or not assets: raise ValueError('retained additions')
 asset=assets[0]; before=runtime_snapshot(asset)
 if before['http']['/']!=[200,new['index.html']] or before['http']['/'+asset]!=[200,new[asset]]: raise ValueError('pre http')
 save('before.json',{'live':live,'backup':backup,'runtime':before,'hold':check_hold(),'asset':asset,'identity':identity()})
 additions=set(new)-set(baseline)
 initial=account(additions)
 # The helper writes one old-index staging file, renames it, and writes two
 # success journals (or a bounded failure journal). Four rounded index copies
 # plus 16 MiB cover unobserved index, journals, output and metadata allowance.
 headroom=4*((initial['oldIndexBytes']+4095)//4096*4096)+16*1024*1024
 budget_ok(initial,headroom);save('budget-before.json',{'sample':initial,'additionalBoundBytes':headroom,'method':'allocated-block inode dedup; max app-path blocks/Docker SizeRw proxy; plus metadata/log allowance; sampled, not quota'})
 inputs()
 # The previously witnessed closed exec may be evicted from Docker; the pinned
 # closed hold and stage-one transcript supply its contemporaneous evidence.
 save('dispatch-intent.json',{'action':'rollback','target':TARGET,'priorExec':PUBLISH_EXEC,'timeNs':time.time_ns()})
 stop=threading.Event(); observations=[]; samples=[]; errors=[]; ready=threading.Event(); budget_ready=threading.Event()
 def runner(): ready.set();observe(mod,stop,observations)
 thread=threading.Thread(target=runner,daemon=False);sampler=threading.Thread(target=sample_budget,args=(stop,additions,samples,errors,budget_ready),daemon=False)
 thread.start();sampler.start();ready.wait();budget_ready.wait();dispatch_ns=time.time_ns()
 try: result=mod.coordinate_fixture(target,'rollback')
 finally: end_ns=time.time_ns();stop.set();thread.join();sampler.join()
 save('action.json',{'result':result,'observations':observations,'budgetSamples':samples,'budgetErrors':errors})
 if errors or not any(dispatch_ns<=s['timeNs']<=end_ns for s in samples): raise ValueError('budget observation inconclusive')
 if result.get('status')!='verified' or result.get('classification')!='old-entry-full-additions' or result.get('filesystemPhase')!='journal-fenced': raise ValueError('coordinator verdict')
 raw,holdstat=w.read(CONTROL/'production-operation-hold.json',1001,0o600,65536); hold=json.loads(raw); eid=hold.get('execId')
 if hold.get('phase')!='closed' or hold.get('action')!='rollback' or hold.get('targetId')!=TARGET or hold.get('started')!=TSTART or hold.get('inputHash')!=PAYLOAD or hold.get('leaseHash')!=LEASE or hold.get('helper')!=HELPER or hold.get('classification')!='old-entry-full-additions' or hold.get('failure',{}).get('kind')!='none' or hold.get('exitCode')!=0 or not any(x.get('execId')==PUBLISH_EXEC and x.get('action')=='publish' for x in hold.get('history',[])): raise ValueError('rollback hold')
 terminal=mod.EngineAdapter().inspect(eid,TARGET); observations.append({'whenNs':time.time_ns(),**terminal})
 if not any(x['execId']==eid and x['running'] is True for x in observations) or terminal['running'] or terminal['exitCode']!=0: raise ValueError('running/terminal evidence missing')
 afterlive=w.inventory(TARGET); afterbackup=w.inventory(TARGET,True); restored=dict(new);restored['index.html']=baseline['index.html']
 if afterlive!=restored or afterbackup!=baseline: raise ValueError('post inventory')
 after=runtime_snapshot(asset)
 if after['processes']!=before['processes'] or after['http']['/']!=[200,baseline['index.html']] or after['http']['/'+asset]!=[200,new[asset]]: raise ValueError('post http/process')
 identity();source(CONTROL/'hq-lease.json',LEASE,1001,0o600)
 terminal_budget=account(additions);budget_ok(terminal_budget)
 save('after.json',{'status':'PROVISIONAL_REVIEW_REQUIRED','result':result,'observations':observations,'hold':hold,'holdSha256':sha(raw),'holdDevice':holdstat.st_dev,'holdInode':holdstat.st_ino,'live':afterlive,'backup':afterbackup,'runtime':after,'budgetTerminal':terminal_budget})
if __name__=='__main__': main()





