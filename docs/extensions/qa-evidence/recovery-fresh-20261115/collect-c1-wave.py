"""Read-only, hash-verified collection and cumulative accounting for one stopped trial."""
import hashlib
import json
import pathlib
import shlex
import subprocess
import sys
import tarfile

HERE = pathlib.Path(__file__).resolve().parent
version = int(sys.argv[1])
assert version >= 5
OUT = HERE / ('c1-execution-wave-packet' + str(version))
SSH = ['ssh', '-i', 'C:/Users/DAVID/.ssh/tadazz_oracle_2026', '-o', 'BatchMode=yes',
       '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', 'ubuntu@132.145.25.168']
REMOTE = r'''
import pathlib,json,hashlib,tarfile,sys,io,stat,os,subprocess
r=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
suffix='recovery-c1-e1fb1b28420a62acca17ddd69f1e72b3a9d27907-packetVERSION-wave'
e=r/'evidence'/suffix; f=r/'fixtures'/suffix; s=r/'source'/suffix
stopped=json.loads((e/'runner-after-stop.json').read_text())
assert stopped['state']['Running'] is False, 'RUNNER NOT STOPPED; DO NOT COLLECT'
actual=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','--size',stopped['id']],text=True))[0]
assert actual['Id']==stopped['id'] and not actual['State']['Running'] and actual['State']['Pid']==0
records=[]; total=0
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz') as archive:
 for prefix,root in [('host',e),('child-results',f/'child-results'),('child-receipts',f/'child-receipts')]:
  for p in sorted(root.rglob('*')):
   value=p.lstat()
   if stat.S_ISDIR(value.st_mode): continue
   assert stat.S_ISREG(value.st_mode) and not p.is_symlink(), 'Unexpected evidence entry'
   data=p.read_bytes(); name=prefix+'/'+p.relative_to(root).as_posix()
   total+=len(data); assert total<64*1024*1024 and len(records)<1000
   records.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
   entry=tarfile.TarInfo(name); entry.size=len(data); entry.mode=0o600
   archive.addfile(entry,io.BytesIO(data))
 inputs=[]
 for p in sorted(s.iterdir()):
  if p.is_file():
   data=p.read_bytes(); value=p.lstat()
   inputs.append({'path':p.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'mode':oct(stat.S_IMODE(value.st_mode))})
 plan=json.loads((s/'plan.json').read_bytes())
 seen=set(); physical=0
 for root in [e,f,s]:
  for directory,dirs,files in os.walk(root,followlinks=False):
   for name in ['.']+dirs+files:
    p=pathlib.Path(directory) if name=='.' else pathlib.Path(directory)/name
    st=p.lstat(); key=(st.st_dev,st.st_ino)
    if key not in seen: physical+=st.st_blocks*512; seen.add(key)
 controls=[]
 for p in sorted((r/'admissions').glob('recovery-wave-packetVERSION-wave.*.json')):
  st=p.lstat(); assert stat.S_ISREG(st.st_mode) and not p.is_symlink()
  physical+=st.st_blocks*512; controls.append({'path':str(p),'physicalBytes':st.st_blocks*512})
 own=physical+actual.get('SizeRw',0)+2*1024**2
 cumulative=plan['priorLeasePhysicalBytes']+own
 assert cumulative<=64*1024**2
 manifest={'sourceCommit':plan['sourceCommit'],'files':records,'sourceInputsAfterRun':inputs,
           'runnerStopped':True,'serverDataBytes':total,'collectionReadOnly':True,
           'accounting':{'priorLeasePhysicalBytes':plan['priorLeasePhysicalBytes'],'thisIterationPhysicalBytes':own,
                         'cumulativeConsumedBytes':cumulative,'controls':controls,'containerMetadataReserveBytes':2*1024**2,
                         'stoppedContainerSizeRw':actual.get('SizeRw',0)}}
 data=(json.dumps(manifest,indent=2)+'\n').encode(); entry=tarfile.TarInfo('server-download-manifest.json'); entry.size=len(data); entry.mode=0o600
 archive.addfile(entry,io.BytesIO(data))
'''.replace('VERSION', str(version))

assert not OUT.exists(), 'Never overwrite an earlier execution/readback'
OUT.mkdir()
archive_path = OUT / 'server-evidence.tar.gz'
with archive_path.open('xb') as target:
    result = subprocess.run(SSH + ['python3 -c ' + shlex.quote(REMOTE)], stdout=target, stderr=subprocess.PIPE)
(OUT / 'collection.stderr.log').write_bytes(result.stderr)
result.check_returncode()
with tarfile.open(archive_path, 'r:gz') as archive:
    members = archive.getmembers()
    assert len({m.name for m in members}) == len(members)
    for member in members:
        p = pathlib.PurePosixPath(member.name)
        assert member.isfile() and not p.is_absolute() and '..' not in p.parts
        assert p.parts[0] in ('host', 'child-results', 'child-receipts') or member.name == 'server-download-manifest.json'
        destination = OUT / member.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open('xb') as target:
            target.write(archive.extractfile(member).read())
manifest = json.loads((OUT / 'server-download-manifest.json').read_bytes())
for record in manifest['files']:
    data = (OUT / record['path']).read_bytes()
    assert len(data) == record['bytes'] and hashlib.sha256(data).hexdigest() == record['sha256']
packet = HERE / ('c1-server-packet' + str(version))
lock_bytes = (packet / 'packet-hashes.json').read_bytes()
lock = json.loads(lock_bytes)
expected = lock['files'] + [{'path': 'packet-hashes.json', 'size': len(lock_bytes),
                           'sha256': hashlib.sha256(lock_bytes).hexdigest()}]
for entry in expected:
    actual = next(v for v in manifest['sourceInputsAfterRun'] if v['path'] == entry['path'])
    assert actual['sha256'] == entry['sha256'] and actual['bytes'] == entry['size']
receipt = {'downloadedFiles': len(manifest['files']), 'serverDataBytes': manifest['serverDataBytes'],
           'allDownloadedSha256Matched': True, 'frozenPacketInputHashesUnchanged': len(expected),
           'collectionReadOnly': True,'accounting':manifest['accounting'],
           'archiveBytes': archive_path.stat().st_size, 'archiveSha256': hashlib.sha256(archive_path.read_bytes()).hexdigest()}
(OUT / 'readback-verified.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
