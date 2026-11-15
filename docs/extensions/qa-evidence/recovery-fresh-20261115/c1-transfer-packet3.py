"""Local strict-key transport only; never invokes the runner/preflight/container."""
import hashlib
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
PACKET = HERE / 'c1-server-packet3'
TARGET = '/home/ubuntu/tadazz-hq-qa-20261115/source/recovery-c1-e1fb1b28420a62acca17ddd69f1e72b3a9d27907-packet3-process'
SSH = ['ssh', '-i', 'C:/Users/DAVID/.ssh/tadazz_oracle_2026', '-o', 'BatchMode=yes',
       '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', 'ubuntu@132.145.25.168']

INSPECT = r'''
import os,json,pathlib,shutil
r=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
s=r/'source/recovery-c1-e1fb1b28420a62acca17ddd69f1e72b3a9d27907-packet3-process'
b=r/'fixtures/recovery-r2-9593f24f287f2e404f387f6359e89453cd8a971e/work'
o=r/'source/recovery-r2-991f38f216ad265e06aec53313db8928437da248/overlay'
assert (os.getuid(),os.getgid())==(1001,1001)
assert r.is_dir() and b.is_dir() and o.is_dir()
assert not os.path.lexists(s), 'PREEXISTING SOURCE; STOP'
assert shutil.disk_usage(r).free >= 2147483648+2*1024*1024
print(json.dumps({'uid':os.getuid(),'gid':os.getgid(),'sourcePath':str(s),'sourceExists':False,'baseExists':True,'r2OverlayExists':True,'freeBytes':shutil.disk_usage(r).free,'fixtureOrContainerCreated':False}))
'''

RECEIVE = r'''
import os,sys,json,pathlib,hashlib,stat,shutil
s=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115/source/recovery-c1-e1fb1b28420a62acca17ddd69f1e72b3a9d27907-packet3-process')
assert (os.getuid(),os.getgid())==(1001,1001)
assert not os.path.lexists(s), 'PREEXISTING SOURCE; STOP'
assert s.parent.resolve()==s.parent and s.parent.is_dir()
assert shutil.disk_usage(s.parent).free >= 2147483648+2*1024*1024
length=int.from_bytes(sys.stdin.buffer.read(8),'big')
assert 0<length<16384
header=json.loads(sys.stdin.buffer.read(length))
expected='5158038dd2d5b859a9e27c807b7280833f2b381b6a8ede21448ca2393464874d'
allowed={'manifest.json','plan.json','overlay.tar.gz','server-run.py','runner_host.py','runner_base.py','pid_observer.py','node-observer.delta.patch','verify-merged.cjs','analyze-results.cjs','packet-hashes.json'}
assert header['target']==str(s) and header['packetHashesSha256']==expected
assert len(header['files'])==11 and {v['path'] for v in header['files']}==allowed
assert sum(v['size'] for v in header['files'])<1024*1024
root=s.parent.parent
suffix=s.name
assert not os.path.lexists(root/'fixtures'/suffix) and not os.path.lexists(root/'evidence'/suffix), 'PREEXISTING FIXTURE/EVIDENCE; STOP'
os.mkdir(s,0o700)
dfd=os.open(s,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
try:
 for v in header['files']:
  remaining=v['size']; h=hashlib.sha256()
  fd=os.open(v['path'],os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=dfd)
  try:
   while remaining:
    chunk=sys.stdin.buffer.read(min(65536,remaining))
    assert chunk,'Incomplete transport'
    h.update(chunk); offset=0
    while offset<len(chunk):
     n=os.write(fd,chunk[offset:]); assert n>0; offset+=n
    remaining-=len(chunk)
   assert h.hexdigest()==v['sha256'],'Transport hash mismatch'
   os.fchmod(fd,0o400); os.fsync(fd)
  finally: os.close(fd)
 assert sys.stdin.buffer.read(1)==b'','Unexpected trailing payload'
 os.fsync(dfd)
finally: os.close(dfd)
assert hashlib.sha256((s/'packet-hashes.json').read_bytes()).hexdigest()==expected
lock=json.loads((s/'packet-hashes.json').read_text())
assert sum(v['size'] for v in lock['files'])==766154 and len(lock['files'])==10
receipts=[]
for v in header['files']:
 p=s/v['path']; st=p.lstat(); data=p.read_bytes()
 assert stat.S_ISREG(st.st_mode) and (st.st_uid,st.st_gid)==(1001,1001) and stat.S_IMODE(st.st_mode)==0o400
 assert len(data)==v['size'] and hashlib.sha256(data).hexdigest()==v['sha256']
 receipts.append({**v,'uid':st.st_uid,'gid':st.st_gid,'mode':'0400'})
assert {v['path'] for v in lock['files']}==allowed-{'packet-hashes.json'}
assert all(any(v['path']==w['path'] and v['sha256']==w['sha256'] and v['size']==w['size'] for w in header['files']) for v in lock['files'])
plan=json.loads((s/'plan.json').read_text())
paths=[]; deferred=[]
for m in plan['mounts']:
 if not m['readonly']: continue
 p=pathlib.Path(m['source'])
 if p.is_relative_to(s) and p!=s or p.is_relative_to(pathlib.Path(plan['fixture'])):
  deferred.append({'source':str(p),'destination':m['destination'],'reason':'namespace/fixture remains uncreated until fresh admission'})
  continue
 st=p.lstat()
 assert not p.is_symlink() and (p.is_file() or p.is_dir())
 assert os.access(p,os.R_OK|(os.X_OK if p.is_dir() else 0))
 paths.append({'source':str(p),'destination':m['destination'],'declaredReadOnly':True,'readableByUid1001':True,'dev':st.st_dev,'ino':st.st_ino})
prior=[]
for v in plan['prior37Evidence']:
 matches=[m for m in plan['mounts'] if m['destination']=='/prior-results/'+v['group']+'.results.json']
 assert len(matches)==1 and matches[0]['readonly']
 data=pathlib.Path(matches[0]['source']).read_bytes()
 assert hashlib.sha256(data).hexdigest()==v['rawResultSha256']
 prior.append({'group':v['group'],'sha256':v['rawResultSha256'],'profile':'OLD packet2 only'})
st=s.stat()
assert stat.S_IMODE(st.st_mode)==0o700 and (st.st_uid,st.st_gid)==(1001,1001)
assert not os.path.lexists(root/'fixtures'/suffix) and not os.path.lexists(root/'evidence'/suffix)
assert not os.path.lexists(s/'namespace')
assert set(p.name for p in s.iterdir())==allowed
print(json.dumps({'kind':'TRANSFER_READY_ONLY','sourcePath':str(s),'uid':1001,'gid':1001,'sourceMode':'0700','packetHashesSha256':expected,'files':receipts,'runtimeAndReviewDeltaBytes':766154,'runtimeMemberCount':9,'reviewDeltaMemberCount':1,'oldProfileEvidenceHashes':prior,'readOnlyInputPaths':paths,'deferredNamespacePaths':deferred,'freeBytesAfter':shutil.disk_usage(s).free,'runnerOrPreflightExecuted':False,'fixtureOrContainerCreated':False}))
'''

if sys.argv[1] == 'inspect':
    subprocess.run(SSH + ['python3 -'], input=INSPECT.encode(), check=True)
elif sys.argv[1] == 'transfer':
    import shlex
    lock_bytes = (PACKET / 'packet-hashes.json').read_bytes()
    lock_hash = hashlib.sha256(lock_bytes).hexdigest()
    assert lock_hash == '5158038dd2d5b859a9e27c807b7280833f2b381b6a8ede21448ca2393464874d'
    lock = json.loads(lock_bytes)
    entries = lock['files'] + [{'path': 'packet-hashes.json', 'size': len(lock_bytes), 'sha256': lock_hash}]
    chunks = []
    for entry in entries:
        data = (PACKET / entry['path']).read_bytes()
        assert len(data) == entry['size'] and hashlib.sha256(data).hexdigest() == entry['sha256']
        chunks.append(data)
    header = json.dumps({'target': TARGET, 'packetHashesSha256': lock_hash, 'files': entries}).encode()
    payload = len(header).to_bytes(8, 'big') + header + b''.join(chunks)
    result = subprocess.run(SSH + ['python3 -c ' + shlex.quote(RECEIVE)], input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    (HERE / 'c1-transfer-packet3.stderr.log').write_bytes(result.stderr)
    (HERE / 'c1-transfer-packet3-receipt.json').write_bytes(result.stdout)
    sys.stdout.buffer.write(result.stdout)
    sys.stderr.buffer.write(result.stderr)
    result.check_returncode()
else:
    raise RuntimeError('Require inspect or transfer')
