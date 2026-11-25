"""Server-side preparation and launch; all new paths belong to this receipt."""
import hashlib,json,os,pathlib,stat,subprocess,tarfile

ROOT=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
NAME='integrator-root-85e-20261115'
E=ROOT/'evidence'/NAME
VIEW=ROOT/'source'/NAME
OLD=ROOT/'source/integration-types-47e-20261115'
v=os.statvfs(ROOT);free=v.f_bavail*v.f_frsize
assert free>=2600*1024**2 and free-64*1024**2>=2*1024**3, ('disk reserve',free)
assert not VIEW.exists(), 'owned source view already exists; preserve prior attempt'
manifest=json.loads((E/'manifest.json').read_text())
assert hashlib.sha256((E/'overlay.tar').read_bytes()).hexdigest()==manifest['overlay_sha256']
VIEW.mkdir(mode=0o700)
with tarfile.open(E/'overlay.tar') as archive:
    members={x.name:x for x in archive.getmembers()}
    assert set(members)==set(manifest['overlay'])
    for x in manifest['entries']:
        name=x['path'];p=VIEW/name;p.parent.mkdir(parents=True,exist_ok=True)
        if name in members:
            data=archive.extractfile(members[name]).read();tmp=p.with_name(p.name+'.new');tmp.write_bytes(data);os.chmod(tmp,int(x['mode'],8)&0o777);os.replace(tmp,p)
        else:
            os.link(OLD/name,p)
        data=p.read_bytes()
        assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==x['blob'],name
        assert stat.S_IMODE(p.stat().st_mode)==(int(x['mode'],8)&0o777),name
rootcache=ROOT/'fixtures/sb3-assets-755faf0f2e2719e20f9711231a0bf84da95b6b4a3a618e2a07827ffd78cf8aa9/pnpm-store'
sdkcache=ROOT/'fixtures/mcp-send-ce021e537e31af7cbc989d4b2c3e5abb0966de41413f994e2803276b31dec7d9/pnpm-store'
cmd=['sudo','-n','docker','run','-d','--name',NAME,'--user',str(os.getuid())+':'+str(os.getgid()),'--network','none','--cpus','.5','--memory','3g','--memory-swap','3g','--pids-limit','192','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/work:rw,nosuid,nodev,size=1073741824,mode=1777','-v',str(VIEW)+':/input:ro','-v',str(rootcache)+':/cache-root:ro','-v',str(sdkcache)+':/cache-sdk:ro','-v',str(E)+':/evidence:rw','--entrypoint','python3','tadazz:design-system-qa-20261110','/evidence/runner.py']
(E/'launch.json').write_text(json.dumps({'free_before':free,'source_entries':len(manifest['entries']),'overlay_bytes':manifest['overlay_bytes'],'command':cmd},indent=2)+'\n')
result=subprocess.run(cmd,capture_output=True,text=True)
(E/'launch.stdout').write_text(result.stdout);(E/'launch.stderr').write_text(result.stderr)
print(json.dumps({'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr}))
raise SystemExit(result.returncode)
