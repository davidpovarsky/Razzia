from pathlib import Path
import hashlib,json,os,subprocess,tarfile
root=Path('/home/ubuntu/tadazz-hq-qa-20261115')
packet=root/'source/show-ui-E-font23'
old=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','tadazz-show-ui-E-native21']))[0]
qa='/work/docs/extensions/qa-evidence/show-ui-20261115'
parent=next(m['Source'] for m in old['Mounts'] if m['Destination']=='/work')
view=packet/'qa-view';view.mkdir()
for file in (Path(parent)/qa.removeprefix('/work/')).iterdir():
    if file.is_file() and not file.is_symlink():os.link(file,view/file.name)
hashes={}
with tarfile.open(packet/'own-source.tar') as archive:
    for member in archive.getmembers():
        path=Path(member.name)
        if not member.isfile() or path.is_absolute() or '..' in path.parts or str(path.parent)!='docs/extensions/qa-evidence/show-ui-20261115':raise ValueError('unsafe own source')
        body=archive.extractfile(member).read();temporary=view/(path.name+'.owned-overlay')
        temporary.write_bytes(body);temporary.chmod(0o444);temporary.replace(view/path.name)
        hashes[str(path)]=hashlib.sha256(body).hexdigest()
(packet/'source-sha256.json').write_text(json.dumps(hashes,indent=2))
(packet/'tsconfig-focused.json').write_text(json.dumps({'extends':'/work/extensions/tsconfig.json','include':[qa+'/qa-fixture-server.ts',qa+'/qa-rubik-resources.ts',qa+'/qa-native-font.spec.ts',qa+'/qa-native-font.config.ts'],'compilerOptions':{'typeRoots':['/work/extensions/node_modules/@types']}}))
cmd=['sudo','-n','docker','run','-d','--name','tadazz-show-ui-E-font23','--network','none','--read-only','--cpus','.25','--memory','2g','--memory-swap','2g','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--tmpfs','/out:rw,nosuid,nodev,size=128m','--workdir','/work','--env','TADAZZ_REMOTE_QA=1']
mounts=[]
for m in old['Mounts']:
    dest=m['Destination']
    if m['Type']!='bind' or dest in ['/out','/run.sh',qa] or dest.startswith('/input-'):continue
    mounts.append({'source':m['Source'],'destination':dest})
    cmd+=['--mount',f"type=bind,src={m['Source']},dst={dest},readonly"]
mounts.append({'source':str(view),'destination':qa})
cmd+=['--mount',f'type=bind,src={view},dst={qa},readonly']
(packet/'physical-mounts.json').write_text(json.dumps(mounts,indent=2))
for name in ['source-sha256.json','physical-mounts.json','tsconfig-focused.json']:
    cmd+=['--mount',f'type=bind,src={packet}/{name},dst=/input-{name},readonly']
cmd+=['--mount',f'type=bind,src={packet}/run-wave-E-font23.sh,dst=/run.sh,readonly','--entrypoint','/bin/bash',old['Image'],'/run.sh']
(packet/'launch.json').write_text(json.dumps(cmd,indent=2))
print(subprocess.check_output(cmd,text=True).strip())
