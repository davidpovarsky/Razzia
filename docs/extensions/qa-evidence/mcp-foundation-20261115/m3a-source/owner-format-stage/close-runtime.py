"""Verify final source/dependencies, naturally finish only this owned fixture,
collect all attempts, then apply the five proven formatter outputs locally."""
import hashlib
import io
import json
from pathlib import Path,PurePosixPath
import subprocess
import tarfile

HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'.git').exists())
NAME='mcp-runtime-F-20261115-01a1dfaa'
CONTAINER='tadazz-hq-'+NAME
SSH=['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-i',
     'C:/Users/DAVID/.ssh/tadazz_oracle_2026','ubuntu@132.145.25.168']
verify=r'''
import hashlib,json,os
from pathlib import Path
E=Path('/evidence');root=Path('/ram/work-accepted');module='extensions/src/mcp-app/'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((E/'accepted-formatted-input-manifest.json').read_text())
assert len(manifest['files'])==165
for row in manifest['files']:
    p=root/row['path'];assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'],row['path']
checks={}
for name,version in {'@modelcontextprotocol/server':'2.4.0','@modelcontextprotocol/client':'2.4.0',
    '@modelcontextprotocol/core':'2.4.0','@modelcontextprotocol/ext-apps':'2.1.0',
    'zod':'4.6.6','typescript':'5.9.3','tsx':'4.21.0','hono':'4.13.13',
    'uuid':'14.0.3','socket.io':'4.8.4','http-status-codes':'2.3.0','@types/node':'26.6.5'}.items():
    p=root/module/'node_modules'/name/'package.json';package=json.loads(p.read_text())
    assert package['version']==version,(name,package['version'])
    entry=package.get('module') or package.get('main')
    item={'version':version,'packageJsonSha256':sha(p),'resolved':str(p.resolve())}
    if isinstance(entry,str) and (p.parent/entry).is_file():item['entrySha256']=sha(p.parent/entry)
    checks[name]=item
assert sha(root/module/'pnpm-lock.yaml')=='e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838'
for phase in ['15-accepted-format','16-accepted-typecheck','17-accepted-sdk-tests']:
    result=json.loads((E/(phase+'.json')).read_text())
    assert result['actualReturnCode']==result['shellExit']==0 and not result['logTruncated']
    assert sha(E/(phase+'.log'))==result['logSha256']
log=(E/'17-accepted-sdk-tests.log').read_text()
for text in ['tests 53','pass 53','fail 0','cancelled 0','skipped 0']:assert text in log,text
(E/'final-source-dependency-check.json').write_text(json.dumps({'sourceInputs':165,
    'manifestSha256':sha(E/'accepted-formatted-input-manifest.json'),'packages':checks,
    'privateLockSha256':sha(root/module/'pnpm-lock.yaml'),
    'directNodeFinalCommands':True,'finalFunctionalTests':53,'actualHostInstallation':False},indent=2)+'\n')
(E/'finish-owned-fixture').write_text('Final accepted candidate verified; retain all attempts.\n')
print(json.dumps({'sourceInputs':165,'finalPass':53,'dependencyPackages':len(checks)}))
'''
r=subprocess.run(SSH+['sudo -n docker exec -i '+CONTAINER+' python3 -'],input=verify,text=True,capture_output=True)
assert r.returncode==0,r.stderr
print(r.stdout)
script=r'''
from pathlib import Path
import hashlib,json,os,subprocess,sys,tarfile,time
base=Path('/home/ubuntu/tadazz-hq-qa-20261115');source=base/'source'/NAME;evidence=base/'evidence'/NAME
for _ in range(10):
    state=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','tadazz-hq-'+NAME]))[0]
    if not state['State']['Running']:break
    time.sleep(1)
assert not state['State']['Running'] and state['State']['Pid']==0
def physical(root):
    value=root.lstat().st_blocks*512
    for parent,dirs,files in os.walk(root):value+=sum((Path(parent)/n).lstat().st_blocks*512 for n in dirs+files)
    return value
v=os.statvfs(base)
receipt={'state':state['State'],'id':state['Id'],'sourcePhysicalBytes':physical(source),
    'evidencePhysicalBytes':physical(evidence),'dockerAllowanceBytes':2*1024**2,
    'freeBytes':v.f_bavail*v.f_frsize,'initialAttemptExitIsNotFinalCandidateResult':True}
(evidence/'terminal.json').write_text(json.dumps(receipt,indent=2)+'\n')
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz') as archive:
    for p in sorted(evidence.rglob('*')):
        if p.is_file() and not p.is_symlink():archive.add(p,arcname=p.relative_to(evidence).as_posix(),recursive=False)
'''.replace('NAME',repr(NAME))
r=subprocess.run(SSH+['python3 -'],input=script.encode(),capture_output=True)
assert r.returncode==0,r.stderr.decode()
(HERE/'runtime-01/server-receipts.tar.gz').write_bytes(r.stdout)
target=HERE/'runtime-01/server-receipts'
with tarfile.open(fileobj=io.BytesIO(r.stdout),mode='r:gz') as archive:
    for member in archive.getmembers():
        p=PurePosixPath(member.name)
        assert member.isfile() and not p.is_absolute() and '..' not in p.parts
        out=target/member.name;assert not out.exists()
        out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(archive.extractfile(member).read())
raw=json.loads((target/'accepted-raw-input-manifest.json').read_text())
after=json.loads((target/'accepted-formatted-input-manifest.json').read_text())
before={r['path']:r for r in raw['files']}
sha=lambda data:hashlib.sha256(data).hexdigest()
changed=[]
for file in sorted((target/'accepted-formatted').rglob('*.ts')):
    relative=file.relative_to(target/'accepted-formatted').as_posix()
    path='extensions/src/mcp-app/'+relative
    assert sha((ROOT/path).read_bytes())==before[path]['sha256'],path
    changed.append((ROOT/path,file.read_bytes()))
assert len(changed)==5
for path,data in changed:path.write_bytes(data)
for row in after['files']:assert sha((ROOT/row['path']).read_bytes())==row['sha256'],row['path']
print(json.dumps({'appliedTypeScriptFiles':5,'allLocalInputsMatch':165,
    'archiveSha256':sha(r.stdout),'terminal':json.loads((target/'terminal.json').read_text())},indent=2))
