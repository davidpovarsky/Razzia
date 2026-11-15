"""Windows streaming transport only; never stage metadata archive on server."""
import hashlib,json,pathlib,subprocess
P=pathlib.Path(__file__).resolve().parent;OUT=P/'local-artifacts';OUT.mkdir(exist_ok=True)
partial=OUT/'metadata-full-85e.tar.gz.partial';final=OUT/'metadata-full-85e.tar.gz'
assert not partial.exists() and not final.exists()
ssh=['ssh','-i','C:/Users/DAVID/.ssh/tadazz_oracle_2026','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','ubuntu@132.145.25.168']
cmd=ssh+['sudo','-n','docker','exec','integrator-root-85e-20261115-metadata-keeper','python3','/evidence/export-ram.py']
h=hashlib.sha256();size=0
proc=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
with partial.open('xb') as f:
    for block in iter(lambda:proc.stdout.read(1024*1024),b''):
        size+=len(block);assert size<=128*1024**2,'archive exceeds128MiB'
        h.update(block);f.write(block)
stderr=proc.stderr.read().decode(errors='replace');code=proc.wait()
if code:
    (P/'archive-stream-failure.json').write_text(json.dumps({'exit':code,'stderr':stderr,'partial_path':str(partial),'bytes':size,'sha256':h.hexdigest()},indent=2)+'\n',encoding='utf-8',newline='\n')
    raise RuntimeError((code,stderr))
receipt=json.loads(subprocess.check_output(ssh+['cat','/home/ubuntu/tadazz-hq-qa-20261115/evidence/integrator-root-85e-20261115/metadata-hydration-r2/archive-export.json']))
assert receipt['sha256']==h.hexdigest() and receipt['bytes']==size and receipt['files']==459
partial.rename(final)
out={'private_archive_path':str(final),'archive_sha256':h.hexdigest(),'archive_bytes':size,'server_export_sha256_matches':True,'server_export':receipt,'not_committed_to_git':True,'streamed_directly_without_server_archive':True}
(P/'archive-local-receipt.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(out,indent=2))
