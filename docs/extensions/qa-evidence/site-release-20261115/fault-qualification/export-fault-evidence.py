"""Read-only originals -> exclusive evidence copies; no helper action."""
import json,os,pathlib,hashlib,stat
ROOT=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115/evidence/site-fault-A-20261115')
SHORT=pathlib.Path('/run/tadazz-atomic-qa')
NONCES=['e56ad13c4b404aa7a752e0c6e822a61d','f8e1688d4d504cddbf90113c70c26998','83e631a8f8b94f469665beef772b02b8','2a3e9f85a62f40bfa452c29028d174da','49a3b323aede4e87a75d582cb338a4d4']
OUT=ROOT/'export';OUT.mkdir(mode=0o700);os.chown(OUT,1001,1001)
receipts={};results=[]
def copy(source,dest):
 fd=os.open(source,os.O_RDONLY|os.O_NOFOLLOW);st=os.fstat(fd)
 try:
  assert stat.S_ISREG(st.st_mode) and st.st_size<=2097152
  b=os.read(fd,2097153);assert len(b)==st.st_size
 finally:os.close(fd)
 with dest.open('xb') as f:f.write(b)
 os.chmod(dest,0o644);receipts[str(dest.relative_to(OUT))]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
for nonce in NONCES:
 log=SHORT/nonce/'l'; dest=OUT/nonce;dest.mkdir(mode=0o700);os.chown(dest,1001,1001)
 for name in ['identity.json','created.json','before.json','growth-before.json','dispatch-intent.json','controller.stdout','controller.stderr','transcript.jsonl','transcript.sha256','native.strace','strace.stderr','trace-ready.json','result.json','fault-proxy.py','atomic-web-publish.py']:
  if (log/name).exists():copy(log/name,dest/name)
 control=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115/fixtures')/('atomic-3527-fault-'+nonce)/'control'
 for name in ['production-operation-hold.json','hq-lease.json']:copy(control/name,dest/name)
 result=json.loads((log/'result.json').read_bytes());results.append({k:v for k,v in result.items() if k not in ['live','hold','protected','coordinator']})
for name in ['run.log','run.exit','readback-write.log','readback-write.exit','continuation.log','continuation.exit','readback-inconclusive-rofs.log','readback-inconclusive-rofs.exit']:
 copy(ROOT/name,OUT/name)
for name in ['run.log','run.exit']:copy(ROOT/'kernel-rofs-successor'/name,OUT/('kernel-rofs-'+name))
for path in [pathlib.Path('/run/tadazz-site-fault-wave-A-20261115/run-fault-qualification.py'),pathlib.Path('/run/tadazz-site-fault-wave-A-20261115/finalize-write-witness.py'),pathlib.Path('/run/tadazz-site-fault-wave-A-20261115/finalize-inconclusive-rofs.py'),pathlib.Path('/run/tadazz-site-fault-cont-wave-A-20261115/run-fault-qualification.py'),pathlib.Path('/run/tadazz-site-fault-rofs-wave-A-20261115/run-fault-qualification.py')]:copy(path,OUT/(path.parent.name+'-'+path.name))
summary={'status':'FOUR_SCOPED_FAULT_WITNESSES_AND_ONE_RETAINED_INCONCLUSIVE','results':results,'hold_no_retry':'All holds retained unchanged; only source eligibility evaluated after faults, no helper replay','receipts':receipts}
(OUT/'export-index.json').write_text(json.dumps(summary,indent=2)+'\n');os.chmod(OUT/'export-index.json',0o644)
print(json.dumps({'export':str(OUT),'files':len(receipts),'results':[{k:r.get(k) for k in ['mode','status','execId']} for r in results]}))
