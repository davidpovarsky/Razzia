"""Launch fresh network-none consumer only after successful metadata hydration."""
import hashlib,json,os,pathlib,subprocess,sys
H=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115');N='integrator-root-85e-20261115'
BASE=H/'evidence'/N;HYDRATE=BASE/'metadata-hydration';E=BASE/'run-r4'
receipt=json.loads((HYDRATE/'hydration-receipt.json').read_text())
assert receipt['complete'] and not receipt['failures']
archive=HYDRATE/'metadata-full.tar.gz'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==receipt['archive']['sha256']
assert E.exists() and (E/'runner.py').is_file()
minimum_mib=int(sys.argv[1]) if len(sys.argv)>1 else 2336
v=os.statvfs(H);free=v.f_bavail*v.f_frsize
assert free>=minimum_mib*1024**2 and free>=2*1024**3, ('resource startup gate',free,minimum_mib)
ROOT=H/'fixtures/sb3-assets-755faf0f2e2719e20f9711231a0bf84da95b6b4a3a618e2a07827ffd78cf8aa9/pnpm-store'
SDK=H/'fixtures/mcp-send-ce021e537e31af7cbc989d4b2c3e5abb0966de41413f994e2803276b31dec7d9/pnpm-store'
cmd=['sudo','-n','docker','run','-d','--name',N+'-r4','--network','none','--cpus','.5','--memory','3g','--memory-swap','3g','--pids-limit','192','--read-only','--cap-drop','ALL','--group-add',str(os.getgid()),'--security-opt','no-new-privileges','--tmpfs','/work:rw,nosuid,nodev,size=1073741824,mode=1777','-v',str(H/'source'/N)+':/input:ro','-v',str(ROOT)+':/cache-root:ro','-v',str(SDK)+':/cache-sdk:ro','-v',str(archive)+':/metadata-input.tar.gz:ro','-v',str(HYDRATE/'hydration-receipt.json')+':/metadata-receipt.json:ro','-v',str(BASE/'run-r3/cache-before.json')+':/cache-audit-baseline.json:ro','-v',str(E)+':/evidence:rw','--entrypoint','python3','tadazz:design-system-qa-20261110','/evidence/runner.py']
(E/'launch.json').write_text(json.dumps({'free_before_bytes':free,'minimum_free_mib':minimum_mib,'metadata_hydration_receipt_sha256':hashlib.sha256((HYDRATE/'hydration-receipt.json').read_bytes()).hexdigest(),'command':cmd},indent=2)+'\n')
r=subprocess.run(cmd,capture_output=True,text=True);(E/'launch.stdout').write_text(r.stdout);(E/'launch.stderr').write_text(r.stderr);print(json.dumps({'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr}));raise SystemExit(r.returncode)
