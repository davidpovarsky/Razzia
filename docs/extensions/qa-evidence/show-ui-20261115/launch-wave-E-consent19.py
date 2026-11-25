from pathlib import Path
import hashlib,json,subprocess
root=Path('/home/ubuntu/tadazz-hq-qa-20261115')
packet=root/'source/show-ui-E-consent19'
old=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','tadazz-show-ui-E-native17']))[0]
target='/work/extensions/src/components/oauth-consent/OAuthConsentPage.tsx'
testTarget='/work/extensions/qa/theme-builder/oauth-consent.spec.ts'
mounts=[]
cmd=['sudo','-n','docker','run','-d','--name','tadazz-show-ui-E-consent19','--network','none','--read-only','--cpus','.25','--memory','2g','--memory-swap','2g','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--tmpfs','/out:rw,nosuid,nodev,size=128m','--workdir','/work','--env','TADAZZ_REMOTE_QA=1']
for m in old['Mounts']:
    dest=m['Destination']
    if m['Type']!='bind' or dest in ['/out','/run.sh',target,testTarget,'/original-v2-entry.tsx','/verify-native-v2-type-bridge.mjs'] or dest.startswith('/input-'):continue
    mounts.append({'source':m['Source'],'destination':dest})
    cmd+=['--mount',f"type=bind,src={m['Source']},dst={dest},readonly"]
for filename,dest in [('OAuthConsentPage.tsx',target),('oauth-consent.spec.ts',testTarget)]:
    mounts.append({'source':str(packet/filename),'destination':dest})
    cmd+=['--mount',f'type=bind,src={packet/filename},dst={dest},readonly']
(packet/'source-sha256.json').write_text(json.dumps({target.removeprefix('/work/'):hashlib.sha256((packet/'OAuthConsentPage.tsx').read_bytes()).hexdigest(),testTarget.removeprefix('/work/'):hashlib.sha256((packet/'oauth-consent.spec.ts').read_bytes()).hexdigest()},indent=2))
(packet/'physical-mounts.json').write_text(json.dumps(mounts,indent=2))
for name in ['source-sha256.json','physical-mounts.json']:
    cmd+=['--mount',f'type=bind,src={packet}/{name},dst=/input-{name},readonly']
cmd+=['--mount',f'type=bind,src={packet}/run-wave-E-consent19.sh,dst=/run.sh,readonly','--entrypoint','/bin/bash',old['Image'],'/run.sh']
(packet/'launch.json').write_text(json.dumps(cmd,indent=2))
print(subprocess.check_output(cmd,text=True).strip())
