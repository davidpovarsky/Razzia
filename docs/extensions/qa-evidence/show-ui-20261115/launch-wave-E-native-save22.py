from pathlib import Path
import hashlib,json,os,subprocess,tarfile
root=Path('/home/ubuntu/tadazz-hq-qa-20261115')
packet=root/'source/show-ui-E-native-save22'
old=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','tadazz-show-ui-E-native21']))[0]
base=Path(next(m['Source'] for m in old['Mounts'] if m['Destination']=='/work'))
source=packet/'input';source.mkdir()
hashes={}
with tarfile.open(packet/'own-source.tar') as archive:
    for item in archive.getmembers():
        path=Path(item.name)
        if not item.isfile() or path.is_absolute() or '..' in path.parts:raise ValueError('unsafe own source')
        target=source/path;target.parent.mkdir(parents=True,exist_ok=True)
        data=archive.extractfile(item).read();target.write_bytes(data);target.chmod(0o444)
        hashes[str(path)]=hashlib.sha256(data).hexdigest()
def retained_links(origin,destination):
    destination.mkdir()
    for directory,dirs,files in os.walk(origin):
        dirs[:]=[name for name in dirs if name!='node_modules']
        target=destination/Path(directory).relative_to(origin)
        for name in dirs:(target/name).mkdir()
        for name in files:
            oldfile=Path(directory)/name;newfile=target/name
            if oldfile.is_symlink():newfile.symlink_to(os.readlink(oldfile))
            else:os.link(oldfile,newfile)
src=packet/'src-view';qa=packet/'qa-view'
retained_links(base/'extensions/src',src)
retained_links(base/'extensions/qa/theme-builder',qa)
for path in hashes:
    rel=Path(path)
    if path.startswith('extensions/src/'):
        dest=src/rel.relative_to('extensions/src')
    elif path.startswith('extensions/qa/theme-builder/'):
        dest=qa/rel.relative_to('extensions/qa/theme-builder')
    else:raise ValueError('unexpected own source path')
    dest.parent.mkdir(parents=True,exist_ok=True)
    temporary=dest.with_name(dest.name+'.owned-overlay')
    os.link(source/rel,temporary);temporary.replace(dest)
foreign=json.loads((packet/'foreign-inputs.json').read_text())
for entry in foreign['inputs']:
    body=packet/'foreign-F'/Path(entry['path']).name
    if len(body.read_bytes())!=entry['bytes'] or hashlib.sha256(body.read_bytes()).hexdigest()!=entry['sha256']:raise ValueError('foreign immutable DTO mismatch')
    body.chmod(0o444)
    target=src/Path(entry['path']).relative_to('extensions/src')
    target.parent.mkdir(parents=True,exist_ok=True);target.touch(exist_ok=False)
(packet/'source-sha256.json').write_text(json.dumps(hashes,indent=2))
includes=['/work/extensions/src/components/native-save-consent/**/*','/work/extensions/qa/theme-builder/native-save*.ts','/work/extensions/qa/theme-builder/native-save*.tsx','/work/extensions/src/site/env.d.ts']
(packet/'tsconfig-focused.json').write_text(json.dumps({'extends':'/work/extensions/tsconfig.json','include':includes,'compilerOptions':{'typeRoots':['/work/extensions/node_modules/@types']}}))
(packet/'format-scope.json').write_text(json.dumps([p for p in hashes if p.endswith(('.ts','.tsx','.mjs'))]))
mounts=[]
cmd=['sudo','-n','docker','run','-d','--name','tadazz-show-ui-E-native-save22','--network','none','--read-only','--cpus','.25','--memory','2g','--memory-swap','2g','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--tmpfs','/out:rw,nosuid,nodev,size=128m','--workdir','/work','--env','TADAZZ_REMOTE_QA=1']
for m in old['Mounts']:
    dest=m['Destination']
    if m['Type']!='bind' or dest in ['/out','/run.sh','/work/extensions/src','/work/extensions/qa/theme-builder'] or dest.startswith('/input-'):continue
    mounts.append({'source':m['Source'],'destination':dest})
    cmd+=['--mount',f"type=bind,src={m['Source']},dst={dest},readonly"]
for origin,dest in [(src,'/work/extensions/src'),(qa,'/work/extensions/qa/theme-builder')]+[(packet/'foreign-F'/Path(e['path']).name,'/work/'+e['path']) for e in foreign['inputs']]:
    mounts.append({'source':str(origin),'destination':dest})
    cmd+=['--mount',f'type=bind,src={origin},dst={dest},readonly']
(packet/'physical-mounts.json').write_text(json.dumps(mounts,indent=2))
for name in ['source-sha256.json','physical-mounts.json','foreign-inputs.json','tsconfig-focused.json','format-scope.json']:
    cmd+=['--mount',f'type=bind,src={packet}/{name},dst=/input-{name},readonly']
cmd+=['--mount',f'type=bind,src={packet}/run-wave-E-native-save22.sh,dst=/run.sh,readonly','--entrypoint','/bin/bash',old['Image'],'/run.sh']
(packet/'launch.json').write_text(json.dumps(cmd,indent=2))
print(subprocess.check_output(cmd,text=True).strip())
