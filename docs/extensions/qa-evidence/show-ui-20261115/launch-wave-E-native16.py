from pathlib import Path
import hashlib,json,subprocess,tarfile
root=Path('/home/ubuntu/tadazz-hq-qa-20261115')
packet=root/'source/show-ui-E-native16'
source=packet/'input';source.mkdir()
old=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','tadazz-show-ui-E-native15']))[0]
hashes={}
with tarfile.open(packet/'overlay.tar') as archive:
    for item in archive.getmembers():
        path=Path(item.name)
        if not item.isfile() or path.is_absolute() or '..' in path.parts:raise ValueError('unsafe overlay')
        target=source/path;target.parent.mkdir(parents=True,exist_ok=True)
        data=archive.extractfile(item).read();target.write_bytes(data);target.chmod(0o444)
        hashes[str(path)]=hashlib.sha256(data).hexdigest()
(packet/'source-sha256.json').write_text(json.dumps(hashes,indent=2))
consent='/work/extensions/src/components/oauth-consent'
replaced=['/work/'+path for path in hashes]
mounts=[]
cmd=['sudo','-n','docker','run','-d','--name','tadazz-show-ui-E-native16','--network','none','--read-only','--cpus','.25','--memory','2g','--memory-swap','2g','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--tmpfs','/out:rw,nosuid,nodev,size=128m','--workdir','/work','--env','TADAZZ_REMOTE_QA=1']
for m in old['Mounts']:
    dest=m['Destination']
    if m['Type']!='bind' or dest in ['/out','/run.sh'] or dest.startswith('/input-') or dest in replaced or dest.startswith(consent+'/'):continue
    mounts.append({'source':m['Source'],'destination':dest})
    cmd+=['--mount',f"type=bind,src={m['Source']},dst={dest},readonly"]
targets=[(source/'extensions/src/components/oauth-consent',consent)]+[(source/path,'/work/'+path) for path in hashes if '/components/oauth-consent/' not in path]
for path,dest in targets:
    mounts.append({'source':str(path),'destination':dest})
    cmd+=['--mount',f'type=bind,src={path},dst={dest},readonly']
(packet/'physical-mounts.json').write_text(json.dumps(mounts,indent=2))
for name in ['source-sha256.json','physical-mounts.json']:
    cmd+=['--mount',f'type=bind,src={packet}/{name},dst=/input-{name},readonly']
cmd+=['--mount',f'type=bind,src={packet}/run-wave-E-native16.sh,dst=/run.sh,readonly','--entrypoint','/bin/bash',old['Image'],'/run.sh']
(packet/'launch.json').write_text(json.dumps(cmd,indent=2))
print(subprocess.check_output(cmd,text=True).strip())
