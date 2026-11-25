from pathlib import Path
import hashlib,json,subprocess
root=Path('/home/ubuntu/tadazz-hq-qa-20261115')
packet=root/'source/show-ui-E-native15'
old=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','tadazz-show-ui-E-followup14']))[0]
target='/work/extensions/src/presentation/show-library-preview/NativePreviewStage.tsx'
source=packet/'NativePreviewStage.tsx'
(packet/'source-sha256.json').write_text(json.dumps({target.removeprefix('/work/'):hashlib.sha256(source.read_bytes()).hexdigest()},indent=2))
mounts=[]
cmd=['sudo','-n','docker','run','-d','--name','tadazz-show-ui-E-native15','--network','none','--read-only','--cpus','.25','--memory','2g','--memory-swap','2g','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--tmpfs','/out:rw,nosuid,nodev,size=128m','--workdir','/work','--env','TADAZZ_REMOTE_QA=1']
for m in old['Mounts']:
    if m['Type']!='bind' or m['Destination'] in ['/out','/run.sh'] or m['Destination'].startswith('/input-'):continue
    mounts.append({'source':m['Source'],'destination':m['Destination']})
    cmd+=['--mount',f"type=bind,src={m['Source']},dst={m['Destination']},readonly"]
mounts.append({'source':str(source),'destination':target})
cmd+=['--mount',f'type=bind,src={source},dst={target},readonly']
(packet/'physical-mounts.json').write_text(json.dumps(mounts,indent=2))
for name in ['source-sha256.json','physical-mounts.json']:
    cmd+=['--mount',f'type=bind,src={packet}/{name},dst=/input-{name},readonly']
cmd+=['--mount',f'type=bind,src={packet}/run-wave-E-native15.sh,dst=/run.sh,readonly','--entrypoint','/bin/bash',old['Image'],'/run.sh']
(packet/'launch.json').write_text(json.dumps(cmd,indent=2))
print(subprocess.check_output(cmd,text=True).strip())
