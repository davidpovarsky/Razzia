"""Server launch only, after the manager's current resource startup gate."""
import json,os,pathlib,subprocess,sys
H=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
E=H/'evidence/integrator-root-85e-20261115/metadata-hydration'
minimum_mib=int(sys.argv[1]) if len(sys.argv)>1 else 2528
v=os.statvfs(H);free=v.f_bavail*v.f_frsize
assert free>=minimum_mib*1024**2 and free-16*1024**2>=2*1024**3, ('resource startup gate',free,minimum_mib)
sdk=H/'fixtures/mcp-send-ce021e537e31af7cbc989d4b2c3e5abb0966de41413f994e2803276b31dec7d9/home/.cache/pnpm/v12/metadata-full'
lock=H/'source/integrator-root-85e-20261115/pnpm-lock.yaml'
cmd=['sudo','-n','docker','run','-d','--name','integrator-root-85e-metadata-hydration','--network','bridge','--cpus','.5','--memory','3g','--memory-swap','3g','--pids-limit','192','--read-only','--cap-drop','ALL','--group-add',str(os.getgid()),'--security-opt','no-new-privileges','--tmpfs','/work:rw,nosuid,nodev,size=1073741824,mode=1777','-v',str(sdk)+':/metadata-sdk:ro','-v',str(lock)+':/input/pnpm-lock.yaml:ro','-v',str(E)+':/evidence:rw','--entrypoint','python3','tadazz:design-system-qa-20261110','/evidence/hydrate.py']
(E/'launch.json').write_text(json.dumps({'free_before_bytes':free,'minimum_free_mib':minimum_mib,'reserve_bytes':2*1024**3,'authorization':'Manager authorized narrow public registry metadata hydration; no package bodies, installs, scripts, private endpoints or policy changes','command':cmd},indent=2)+'\n')
r=subprocess.run(cmd,capture_output=True,text=True);(E/'launch.stdout').write_text(r.stdout);(E/'launch.stderr').write_text(r.stderr);print(json.dumps({'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr}));raise SystemExit(r.returncode)
