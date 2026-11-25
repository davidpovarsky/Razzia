from pathlib import Path
import hashlib,json,os,subprocess,tarfile
packet=Path('/home/ubuntu/tadazz-hq-qa-20261115/source/show-ui-E-boundary27')
old=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','tadazz-show-ui-E-native21']))[0]
base=Path(next(m['Source'] for m in old['Mounts'] if m['Destination']=='/work'))
view=packet/'qa-view';view.mkdir()
for file in (base/'extensions/qa/theme-builder').iterdir():
    if file.is_file() and not file.is_symlink():os.link(file,view/file.name)
hashes={}
with tarfile.open(packet/'own-source.tar') as archive:
    for member in archive.getmembers():
        path=Path(member.name)
        if not member.isfile() or path.is_absolute() or '..' in path.parts:raise ValueError('unsafe source')
        if str(path.parent)=='extensions/qa/theme-builder':target=view/path.name
        elif str(path)=='extensions/src/components/theme-builder/StudioThemeBuilder.tsx':target=packet/'StudioThemeBuilder.tsx'
        else:raise ValueError('unexpected source')
        body=archive.extractfile(member).read();temporary=target.with_name(target.name+'.owned-overlay')
        temporary.write_bytes(body);temporary.chmod(0o444);temporary.replace(target)
        hashes[str(path)]=hashlib.sha256(body).hexdigest()
(packet/'source-sha256.json').write_text(json.dumps(hashes,indent=2))
qa='/work/extensions/qa/theme-builder'
(packet/'tsconfig-focused.json').write_text(json.dumps({'extends':'/work/extensions/tsconfig.json','include':['/work/extensions/src/components/theme-builder/StudioThemeBuilder.tsx',qa+'/account-boundary*.ts',qa+'/account-boundary*.tsx','/work/extensions/src/site/env.d.ts'],'compilerOptions':{'typeRoots':['/work/extensions/node_modules/@types']}}))
target='/work/extensions/src/components/theme-builder/StudioThemeBuilder.tsx'
mounts=[]
cmd=['sudo','-n','docker','run','-d','--name','tadazz-show-ui-E-boundary27','--network','none','--read-only','--cpus','.25','--memory','2g','--memory-swap','2g','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--tmpfs','/out:rw,nosuid,nodev,size=128m','--workdir','/work','--env','TADAZZ_REMOTE_QA=1']
for m in old['Mounts']:
    dest=m['Destination']
    if m['Type']!='bind' or dest in ['/out','/run.sh',target,qa] or dest.startswith('/input-'):continue
    mounts.append({'source':m['Source'],'destination':dest})
    cmd+=['--mount',f"type=bind,src={m['Source']},dst={dest},readonly"]
for origin,dest in [(view,qa),(packet/'StudioThemeBuilder.tsx',target),(packet/'originalStudio.tsx','/input-originalStudio.tsx')]:
    mounts.append({'source':str(origin),'destination':dest});cmd+=['--mount',f'type=bind,src={origin},dst={dest},readonly']
(packet/'physical-mounts.json').write_text(json.dumps(mounts,indent=2))
for name in ['source-sha256.json','physical-mounts.json','tsconfig-focused.json']:
    cmd+=['--mount',f'type=bind,src={packet}/{name},dst=/input-{name},readonly']
cmd+=['--mount',f'type=bind,src={packet}/run-wave-E-boundary27.sh,dst=/run.sh,readonly','--entrypoint','/bin/bash',old['Image'],'/run.sh']
(packet/'launch.json').write_text(json.dumps(cmd,indent=2))
print(subprocess.check_output(cmd,text=True).strip())
