"""Server-only bounded combined-source delta validation under renewed grant."""
import hashlib,json,os,pathlib,stat,subprocess,tarfile
H=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115');N='integrator-root-85e-wave2-58cf-20261115';E=H/'evidence'/N;VIEW=H/'source'/N
v=os.statvfs(H);free=v.f_bavail*v.f_frsize;assert free>=2464*1024**2 and free>=2*1024**3,('fresh2464MiB gate',free)
mem={k:int(v.split()[0])*1024 for k,v in (line.split(':',1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())};assert mem['MemAvailable']>=4*1024**3,('actual RAM margin',mem['MemAvailable'])
m=json.loads((E/'manifest.json').read_text());assert m['head']=='58cfb5c7a734518c715ae56d74666441f0743f5d';assert hashlib.sha256((E/'overlay.tar').read_bytes()).hexdigest()==m['overlay_sha256'];assert not VIEW.exists();VIEW.mkdir(mode=0o750)
with tarfile.open(E/'overlay.tar') as archive:
    members={x.name:x for x in archive.getmembers()};assert set(members)==set(m['overlay'])
    for x in m['entries']:
        p=VIEW/x['path'];p.parent.mkdir(parents=True,exist_ok=True)
        if x['input']=='overlay':
            data=archive.extractfile(members[x['path']]).read();tmp=p.with_name(p.name+'.new');tmp.write_bytes(data);os.chmod(tmp,int(x['mode'],8)&0o777);os.replace(tmp,p)
        else:
            old='integrator-root-85e-20261115-complete' if x['input']=='prior-complete' else 'integration-types-47e-20261115';os.link(H/'source'/old/x['path'],p)
        data=p.read_bytes();assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==x['blob'],x['path'];assert stat.S_IMODE(p.stat().st_mode)==int(x['mode'],8)&0o777
ROOT=H/'fixtures/sb3-assets-755faf0f2e2719e20f9711231a0bf84da95b6b4a3a618e2a07827ffd78cf8aa9/pnpm-store';SDK=H/'fixtures/mcp-send-ce021e537e31af7cbc989d4b2c3e5abb0966de41413f994e2803276b31dec7d9/pnpm-store';BASE=H/'evidence/integrator-root-85e-20261115'
cmd=['sudo','-n','docker','run','-d','--name',N,'--network','none','--cpus','.5','--memory','3g','--memory-swap','3g','--pids-limit','192','--read-only','--cap-drop','ALL','--group-add',str(os.getgid()),'--security-opt','no-new-privileges','--tmpfs','/work:rw,exec,nosuid,nodev,size=788529152,mode=1777','--tmpfs','/fake:rw,noexec,nosuid,nodev,size=16777216,mode=1777','--mount','type=volume,src=integrator-root-85e-20261115-metadata-ram,dst=/snapshot,readonly,volume-nocopy','-v',str(VIEW)+':/input:ro','-v',str(ROOT)+':/cache-root:ro','-v',str(SDK)+':/cache-sdk:ro','-v',str(BASE/'metadata-vite-repair/hydration-receipt.json')+':/metadata-receipt.json:ro','-v',str(BASE/'run-r3/cache-before.json')+':/cache-audit-baseline.json:ro','-v',str(E)+':/evidence:rw','--entrypoint','python3','tadazz:design-system-qa-20261110','/evidence/wave-runner.py']
(E/'launch.json').write_text(json.dumps({'new_target_head':m['head'],'free_before_bytes':free,'host_memory_before':mem,'fresh_gate_mib':2464,'command':cmd,'grant':'.5CPU3GiB, metadata768+work752+fake16=1536MiB aggregate;64MiB physical TOTAL retained as stricter boundary','bootstrap_reason':'Prior real graph was ephemeral; reconstruct same frozen graph once for newsource checks, no new resolution/network/SDK41 repeat.'},indent=2)+'\n');r=subprocess.run(cmd,capture_output=True,text=True);(E/'launch.stdout').write_text(r.stdout);(E/'launch.stderr').write_text(r.stderr);print(json.dumps({'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr}));raise SystemExit(r.returncode)
