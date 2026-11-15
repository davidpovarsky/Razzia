"""Capture the exact full UI guard, immutable source audit, and allocation release."""
from pathlib import Path
import subprocess,json,datetime,hashlib,sys,time
sha=sys.argv[1]
if len(sha)!=64 or any(c not in '0123456789abcdef' for c in sha):raise ValueError('sha')
root=Path('/home/ubuntu/tadazz-hq-qa-20261115'); name='tadazz-hq-sb3-assets-20261115'
e=root/('evidence/sb3-assets-'+sha); source=root/('source/sb3-assets-'+sha); fixtures=root/('fixtures/sb3-assets-'+sha)
info=json.loads(subprocess.check_output(['sudo','-n','docker','inspect',name]))[0]
start=time.time()
args=['sudo','-n','docker','exec',name,'pnpm','--dir','extensions','ui:check']
result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
(e/'full-ui-check.log').write_bytes(result.stdout)
out={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':args,'exitCode':result.returncode,'seconds':round(time.time()-start,3),'logSha256':hashlib.sha256(result.stdout).hexdigest(),'nanoCpus':info['HostConfig']['NanoCpus'],'memoryBytes':info['HostConfig']['Memory'],'network':info['HostConfig']['NetworkMode'],'ports':info['NetworkSettings']['Ports'],'imageId':info['Image']}
manifest=json.loads((fixtures/('port3-manifest-'+sha+'.json')).read_text())
errors=[]
for entry in manifest['baseline']:
 p=source/entry['path']; h=hashlib.sha1();h.update(('blob '+str(entry['bytes'])+'\0').encode());h.update(p.read_bytes())
 if h.hexdigest()!=entry['gitBlob']:errors.append(entry['path'])
for entry in manifest['files']:
 if hashlib.sha256((source/entry['path']).read_bytes()).hexdigest()!=entry['sha256']:errors.append(entry['path'])
out['sourceAfterFullUi']={'status':'PASS' if not errors else 'FAIL','baselineFiles':len(manifest['baseline']),'overlayFiles':len(manifest['files']),'errors':errors}
subprocess.run(['sudo','-n','docker','stop','--timeout','2',name],check=True,stdout=subprocess.PIPE)
subprocess.run(['sudo','-n','docker','rm',name],check=True,stdout=subprocess.PIPE)
out['allocationReleased']=True;out['releasedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
p=e/'full-ui-and-release.json.tmp';p.write_text(json.dumps(out,indent=2)+'\n');p.replace(e/'full-ui-and-release.json')
print(json.dumps(out))
