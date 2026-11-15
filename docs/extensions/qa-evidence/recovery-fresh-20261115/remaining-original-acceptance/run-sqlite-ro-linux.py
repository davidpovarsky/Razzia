"""One capped builtin-SQLite probe in a new owned synthetic namespace."""
import base64,json,pathlib,subprocess,sys
HERE=pathlib.Path(__file__).resolve().parent
remote=r'''
import base64,hashlib,json,os,pathlib,shutil,subprocess
root=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
source=root/'source/recovery-owner-ro-probe8-20261115'
fixture=root/'fixtures/recovery-owner-ro-probe8-20261115'
assert (os.getuid(),os.getgid())==(1001,1001)
assert shutil.disk_usage(root).free>2147483648+64*1024**2
available=int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024
assert available>2147483648
assert not source.exists() and not fixture.exists()
source.mkdir(mode=0o700);fixture.mkdir(mode=0o700)
data=base64.b64decode(PAYLOAD)
(source/'probe.mjs').write_bytes(data);(source/'probe.mjs').chmod(0o400)
D=['sudo','-n','docker']
name='tadazz-recovery-owner-ro-probe8-20261115'
image='sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647'
args=D+['create','--name',name,'--pull=never','--user','1001:1001','--cpus=.25','--memory=2g','--memory-swap=2g','--pids-limit=96','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--log-driver=none','--mount',f'type=bind,src={source},dst=/inputs,readonly','--mount',f'type=bind,src={fixture},dst=/scratch','--env','TMPDIR=/scratch',image,'node','/inputs/probe.mjs']
cid=subprocess.check_output(args,text=True).strip()
run=subprocess.run(D+['start','--attach',cid],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
identity=json.loads(subprocess.check_output(D+['inspect','--size',cid],text=True))[0]
assert identity['Name']=='/'+name and not identity['State']['Running'] and identity['State']['Pid']==0
paths=[source,fixture,source/'probe.mjs']
physical=sum(p.lstat().st_blocks*512 for p in paths)+identity.get('SizeRw',0)+2097152
print(json.dumps({'container':cid,'state':identity['State'],'probeSha256':hashlib.sha256(data).hexdigest(),'stdout':run.stdout.decode(),'stderr':run.stderr.decode(),'code':run.returncode,'newAccountedBytes':physical,'freeBytesAfter':shutil.disk_usage(root).free,'availableRamBefore':available}))
'''
remote='PAYLOAD='+repr(base64.b64encode((HERE/'sqlite-ro-probe.mjs').read_bytes()).decode())+'\n'+remote
ssh=['ssh','-i','C:/Users/DAVID/.ssh/tadazz_oracle_2026','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','ubuntu@132.145.25.168','python3 -']
r=subprocess.run(ssh,input=remote.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
(HERE/'sqlite-ro-probe-linux.stderr.log').write_bytes(r.stderr)
(HERE/'sqlite-ro-probe-linux.json').write_bytes(r.stdout)
sys.stderr.buffer.write(r.stderr);r.check_returncode()
v=json.loads(r.stdout);print(json.dumps({k:v[k] for k in ['container','code','newAccountedBytes','freeBytesAfter']}));print(v['stdout'])
