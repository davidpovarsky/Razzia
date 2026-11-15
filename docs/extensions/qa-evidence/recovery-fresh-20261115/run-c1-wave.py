"""Issue fresh developer-owned synthetic controls and invoke one frozen packet.

The short shared runtime claim must already exist. No production target is used.
"""
import base64
import hashlib
import json
import os
import pathlib
import shlex
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
version = int(sys.argv[1])
packet = HERE / ('c1-server-packet' + str(version))
plan = json.loads((packet / 'plan.json').read_bytes())
register_bytes = pathlib.Path(sys.argv[2]).read_bytes()
register = json.loads(register_bytes.decode('utf-8-sig'))
thread = os.environ['CODEX_THREAD_ID']
active = [v for v in register['active_claims'] if not v['terminal']]
assert register['new_claims_authorized']
own = [v for v in active if v['thread_id'] == thread and v['role'] == 'recovery']
assert len(own) == 1 and own[0]['cpu'] == .25 and own[0]['memory_mib'] == 2048
assert plan['resourceAdmission']['delegatedIssuerThreadId'] == thread
lanes = []
for claim in active:
    role = claim['role']
    budget = register['disk_budgets'][role]
    lanes.append({'laneId': 'Recovery-C1' if role == 'recovery' else role + ':' + claim['thread_id'],
                  'cpuGrant': claim['cpu'], 'memoryGrantBytes': claim['memory_mib'] * 1024**2,
                  'newPhysicalBudgetBytes': budget['ceiling_mib'] * 1024**2,
                  'consumedPhysicalBytes': budget['new_consumed_bytes']})
assert len({v['laneId'] for v in lanes}) == len(lanes)
config = {'source': plan['src'], 'thread': thread, 'lanes': lanes,
          'runtimeRegisterSha256': hashlib.sha256(register_bytes).hexdigest(),
          'cpuCeiling': register['cpu_ceiling'],
          'memoryCeilingBytes': register['memory_mib_ceiling'] * 1024**2,
          'metadataBytes': register['shared_metadata_mib'] * 1024**2,
          'marginBytes': register['margin_mib'] * 1024**2}
remote = r'''
import hashlib,json,os,pathlib,runpy,sys,time
c=json.loads(base64.b64decode(CONFIG))
source=pathlib.Path(c['source'])
assert source.parent == pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115/source')
assert 'packet' in source.name and source.name.endswith('-wave')
plan=json.loads((source/'plan.json').read_bytes())
assert plan['resourceAdmission']['delegatedIssuerThreadId']==c['thread']
controls=pathlib.Path(plan['resourceAdmission']['directory'])
assert controls.resolve()==controls and controls.is_dir()
st=controls.stat()
assert (os.getuid(),os.getgid())==(1001,1001) and (st.st_uid,st.st_gid)==(1001,1001) and st.st_mode&0o077==0
suffix=source.name.rsplit('-packet',1)[1]
ledger_path=controls/('recovery-wave-packet'+suffix+'.ledger.json')
admission_path=controls/('recovery-wave-packet'+suffix+'.admission.json')
now=time.time()
sha=lambda data:hashlib.sha256(data).hexdigest()
packet_hash=sha((source/'packet-hashes.json').read_bytes())
ledger={'schemaVersion':1,'snapshotId':'recovery-wave-packet'+suffix+'-'+str(int(now)),
        'issuerThreadId':c['thread'],'sourceCommit':plan['sourceCommit'],
        'packetHashesSha256':packet_hash,'capturedAtEpochSeconds':now,'expiresAtEpochSeconds':now+300,
        'exampleOnly':False,'lanes':c['lanes'],
        'aggregate':{'approvedCpu':c['cpuCeiling'],'approvedMemoryBytes':c['memoryCeilingBytes'],
                     'retainedSharedMetadataBytesOnce':c['metadataBytes']},
        'disk':{'floorBytes':2147483648,'futureReserveBytes':0,'marginBytes':c['marginBytes']},
        'ram':{'minimumHostAvailableBytes':sum(v['memoryGrantBytes'] for v in c['lanes'])},
        'runtimeRegisterSha256':c['runtimeRegisterSha256'],
        'authority':'Owner-activated developer claim; no independent packet review claimed'}
data=(json.dumps(ledger,indent=2)+'\n').encode()
def write_new(path,data):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  with os.fdopen(fd,'wb',closefd=False) as out:out.write(data);out.flush();os.fsync(fd)
 finally:os.close(fd)
write_new(ledger_path,data)
grant={'issuerThreadId':c['thread'],'executionAuthorized':True,
       'sourceDisposition':'APPROVE_WITH_EXACT_GATES','packetDisposition':'OWNER_AUTHORIZED_ISOLATED_ITERATION',
       'parentAuthorization':plan['parentAuthorization'],'syntheticFixtureOnly':True,'independentReviewClaimed':False,
       'admittedAtEpochSeconds':now,'sourceCommit':plan['sourceCommit'],
       'packetManifestSha256':sha((source/'manifest.json').read_bytes()),'packetHashesSha256':packet_hash,
       'laneLedgerPath':str(ledger_path),'laneLedgerSha256':sha(data),'laneLedgerSnapshotId':ledger['snapshotId']}
write_new(admission_path,(json.dumps(grant,indent=2)+'\n').encode())
sys.dont_write_bytecode=True
sys.path.insert(0,str(source))
sys.argv=[str(source/'server-run.py'),str(admission_path)]
runpy.run_path(sys.argv[0],run_name='__main__')
'''
remote = 'import base64\nCONFIG=' + repr(base64.b64encode(json.dumps(config).encode()).decode()) + '\n' + remote
ssh = ['ssh', '-i', 'C:/Users/DAVID/.ssh/tadazz_oracle_2026', '-o', 'BatchMode=yes',
       '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', 'ubuntu@132.145.25.168']
with (HERE / ('c1-wave-packet' + str(version) + '-driver.log')).open('xb') as output:
    result = subprocess.run(ssh + ['python3 -'], input=remote.encode(), stdout=output, stderr=subprocess.STDOUT)
print(json.dumps({'version':version,'remoteReturnCode':result.returncode,'independentReviewClaimed':False}))
sys.exit(result.returncode)
