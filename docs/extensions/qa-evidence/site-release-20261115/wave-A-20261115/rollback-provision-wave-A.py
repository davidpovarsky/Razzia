import hashlib,json,os,pathlib,stat,subprocess
N='175b5f805067a9953b75954abff0e839'; T='505772e38a7c0ecd700f82d189219f0b951a7cc95eb933ea58372ccf72b1fab8'; C='701c07ef1fab02d5772fb2af15b733f0fdd5383a170c46da69fb3a529f343757'; TS='2026-11-15T11:33:46.733525138Z'; CS='2026-11-15T11:33:47.11610192Z'
R=pathlib.Path('/run/tadazz-atomic-qa')/N; OLD=R/'l'; P=R/'phase2-wave-A'; E=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115/evidence/atomic-3527-provision-175b'); FIX=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115/fixtures')/('atomic-3527-fault-'+N)
D='181a24131ec13a3b83dc46333b1a85ca09dc5e8f2e2a69964c31e1ecf1d4c79c'; H='352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2'; L='3d8aa4b2bd6e9f5b1c012d65473aba79c0498265fa4eb527ca30199ffd9eb803'; I='da1144d4c78ce7b1d377c56302074e60135ee9755ce03c7c34cf2e9cbf504827'; HOLD='8b825d6823fc4e01a9c158cf08594a09681375b6ba621c250424f7d45ecdc4cb'; FINAL='c2ed24c2e78c92a6e6af9bae9bcbbfd17571d7b025145736a6d13e056aa48e8f'; PE='0af8e929ebd92b1439a1a4b7c29fa8e86b849f8977f4ead97feeaa4ebbb15818'
def digest(b):return hashlib.sha256(b).hexdigest()
def read(path,pin):
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW);s=os.fstat(fd)
 try:
  if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>262144:raise ValueError('unsafe file')
  data=os.read(fd,262145)
  if digest(data)!=pin:raise ValueError('pin')
  return data
 finally:os.close(fd)
def write(n,b):
 fd=os.open(P/n,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
 try:os.write(fd,b);os.fsync(fd)
 finally:os.close(fd)
def inspect(cid):return json.loads(subprocess.check_output(['/usr/bin/docker','--host','unix:///var/run/docker.sock','inspect',cid],env={'PATH':'/usr/bin:/bin','HOME':'/nonexistent','DOCKER_CONFIG':'/nonexistent'}))[0]
if os.geteuid()!=0:raise ValueError('root')
driver=read(E/'rollback-phase2-wave-A.py',D); helper=read(OLD/'atomic-web-publish.py',H);read(OLD/'transparent-final.json',FINAL);read(FIX/'control'/'hq-lease.json',L);hold=read(FIX/'control'/'production-operation-hold.json',HOLD)
if (lambda s:(s.st_dev,s.st_ino)!=(2049,1689493))(os.lstat(FIX/'control'/'production-operation-hold.json')):raise ValueError('hold identity')
a=inspect(T);c=inspect(C)
for obj,cid,started in ((a,T,TS),(c,C,CS)):
 if obj['Id']!=cid or obj['State']['StartedAt']!=started or not obj['State']['Running'] or obj['State']['OOMKilled']:raise ValueError('identity')
old=json.load(open(E/'running-receipt.json'))['containers']['controller']; h=c['HostConfig'];cfg=c['Config']
if c['Name']!=old['name'] or c['Image']!=old['image'] or h['NanoCpus']!=old['nanoCpus'] or h['Memory']!=old['memory'] or h['NetworkMode']!=old['network'] or c['Mounts']!=old['mounts'] or cfg['Labels']!=old['labels'] or h['ReadonlyRootfs']!=old['readonlyRootfs']:raise ValueError('controller drift')
os.mkdir(P,0o700);os.chmod(P,0o700)
write('rollback-phase2.py',driver);write('atomic-web-publish.py',helper)
idbytes=(json.dumps({'hostConfig':h,'mounts':c['Mounts'],'config':cfg},sort_keys=True)+'\n').encode();write('rollback-controller-identity.json',idbytes)
approval={'issuer':'01a1dfa9-3316-7a02-afef-3dccd5939e79','parentAuthorization':'SINGLE_MANAGER_WAVE_RESTART_20261115','action':'rollback','nonce':N,'target':T,'targetStarted':TS,'controller':C,'controllerStarted':CS,'helper':H,'driver':D,'lease':L,'payload':I,'publishExec':PE,'hold':HOLD,'final':FINAL,'identityReceipt':digest(idbytes)}
write('agent-approval.json',(json.dumps(approval,sort_keys=True)+'\n').encode());fd=os.open(P,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)
print(json.dumps({'status':'phase2-controls-created','issuer':approval['issuer'],'parent':approval['parentAuthorization'],'source':D,'identityReceipt':approval['identityReceipt']}))

