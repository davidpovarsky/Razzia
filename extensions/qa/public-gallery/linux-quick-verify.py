"""Snapshot the current worktree and run scoped checks only on the Linux server.

Formatting copies back only when the original local file still has its frozen
input hash. No shared source, customer mount, installed package or service is used.
"""
import hashlib
import io
import json
import pathlib
import shlex
import subprocess
import tarfile
import tempfile
import sys
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[3]
SSH = ["ssh", "-i", str(pathlib.Path.home() / ".ssh/tadazz_oracle_2026"),
       "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
       "-o", "ConnectTimeout=10", "ubuntu@132.145.25.168"]
HEAD = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip()
BASE = sys.argv[1] if len(sys.argv) > 1 else HEAD
ALL_UNIT_TESTS = "--all-unit-tests" in sys.argv[2:]
subprocess.run(["git", "merge-base", "--is-ancestor", BASE, HEAD], cwd=ROOT, check=True)
RUN = "tadazz-gallery-wip-" + HEAD[:12] + "-" + uuid.uuid4().hex[:8]
REMOTE_ROOT = "/home/ubuntu/tadazz-phase2-20261116/evidence/" + RUN
EVIDENCE = ROOT / "docs/extensions/plans/public-gallery-20261119" / RUN
EVIDENCE.mkdir(parents=True, exist_ok=False)
PATHS = ["extensions", "packages", "package.json", "tsconfig.json", "vitest.config.ts", "pnpm-workspace.yaml",
         "pnpm-lock.yaml", "oxlint.config.ts", ".prettierrc.json", ".gitignore", ".prettierignore",
         "docs/extensions/references/TADAZZ_Motion_Showcase_One_Click_20261105.html"]
names = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", *PATHS], cwd=ROOT).decode().split("\0")
files = sorted({name for name in names if name and '.bak.' not in name and (ROOT / name).is_file()})
changed = subprocess.check_output(["git", "diff", "--name-only", "-z", BASE, "--", *PATHS], cwd=ROOT).decode().split("\0")
untracked = subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard", "-z", "--", *PATHS], cwd=ROOT).decode().split("\0")
format_files = sorted({name for name in changed + untracked if name in files and pathlib.Path(name).suffix in {".ts", ".tsx", ".mjs", ".cjs", ".js", ".json", ".css"}})
manifest = {}
archive = pathlib.Path(tempfile.mkdtemp(prefix=RUN)) / "source.tar.gz"
total = 0
with tarfile.open(archive, "w:gz") as output:
    for name in files:
        path = ROOT / name
        assert not path.is_symlink(), "Source symlink: " + name
        data = path.read_bytes()
        total += len(data)
        assert total < 512 * 1024**2, "Source snapshot exceeds 512 MiB"
        manifest[name] = hashlib.sha256(data).hexdigest()
        info = tarfile.TarInfo(name)
        info.size = len(data)
        info.mode = 0o644
        output.addfile(info, io.BytesIO(data))
config = {"head": HEAD, "formatBase": BASE, "run": RUN, "remote": REMOTE_ROOT, "manifest": manifest,
          "formatFiles": format_files, "sourceBytes": total, "allUnitTests": ALL_UNIT_TESTS}
(EVIDENCE / "input-manifest.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf8")
extract = r'''
import pathlib,tarfile,sys,json
root=pathlib.Path(sys.argv[1]);root.mkdir(mode=0o700,parents=False,exist_ok=False)
source=root/'source';source.mkdir()
total=0;count=0
with tarfile.open(fileobj=sys.stdin.buffer,mode='r|gz') as archive:
 for member in archive:
  name=pathlib.PurePosixPath(member.name)
  assert not name.is_absolute() and '..' not in name.parts and member.isfile()
  total+=member.size;count+=1;assert total<512*1024**2 and count<20000
  target=source.joinpath(*name.parts);target.parent.mkdir(parents=True,exist_ok=True)
  with target.open('xb') as output:output.write(archive.extractfile(member).read())
print(json.dumps({'snapshot':str(source),'files':count,'bytes':total}))
'''
with archive.open("rb") as stream:
    result = subprocess.run([*SSH, "sudo -n python3 -c " + shlex.quote(extract) + " " + shlex.quote(REMOTE_ROOT)], stdin=stream, capture_output=True, timeout=180)
if result.returncode:
    (EVIDENCE / "transfer-error.log").write_bytes(result.stderr)
    raise SystemExit("Source transfer failed")
print(result.stdout.decode(), flush=True)
remote = r'''
import pathlib,json,hashlib,subprocess,time,atexit
c=CONFIG
owned=pathlib.Path(c['remote']);source=owned/'source'
assert owned.is_dir() and source.is_dir() and not source.is_symlink()
assert {p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}==c['manifest']
facts=json.loads(subprocess.check_output(['docker','inspect','tadazz-phase2-20261116']))[0]
assert facts['State']['Running'] and facts['HostConfig']['NetworkMode']=='none'
rootfs=pathlib.Path('/var/lib/docker/rootfs/overlayfs')/facts['Id']
deps=pathlib.Path('/home/ubuntu/tadazz-phase2-20261116/evidence/tadazz-codex-browser-c4125d58a746-8e0c29d3/mcp-deps')
for package in ['server','client','core']:
 assert json.loads((deps/'node_modules/@modelcontextprotocol'/package/'package.json').read_text())['version']=='2.4.0'
for folder in ['', 'extensions','packages/common','packages/socket','packages/web','packages/e2e']:
 target=source/folder/'node_modules'
 if (rootfs/'cleanup'/folder/'node_modules').is_dir():target.symlink_to(pathlib.Path('/cleanup')/folder/'node_modules',target_is_directory=True)
(source/'extensions/src/mcp-app/node_modules').symlink_to('/tmp/phase3-999ed90c/deps/node_modules',target_is_directory=True)
name=c['run']+'-checks'
command=['docker','run','--detach','--pull=never','--init','--read-only','--name',name,'--network','none','--cpus','1','--memory','2g','--memory-swap','2g','--pids-limit','384','--shm-size','256m','--tmpfs','/tmp:rw,nosuid,nodev,size=536870912','--label','com.tadazz.qa=public-gallery']
for origin,target,readonly in [(owned,'/evidence',False),(rootfs/'cleanup','/cleanup',True),(deps,'/tmp/phase3-999ed90c/deps',True),(rootfs/'root/.cache/ms-playwright','/root/.cache/ms-playwright',True)]:
 command+=['--mount','type=bind,source='+str(origin)+',target='+target+(',readonly' if readonly else '')]
command+=['--entrypoint','/bin/sleep',facts['Image'],'infinity']
subprocess.run(command,check=True,stdout=subprocess.DEVNULL)
def stop():subprocess.run(['docker','stop','--time','10',name],check=True,stdout=subprocess.DEVNULL,timeout=25)
atexit.register(stop)
checks=[]
prefix=['docker','exec','-w','/evidence/source','-e','TMPDIR=/tmp','-e','XDG_DATA_HOME=/tmp/vitest-data','-e','TSX_DISABLE_CACHE=1','-e','NODE_OPTIONS=--max-old-space-size=1400',name,'nice','-n','19']
def run(label,argv,seconds,cwd='/evidence/source'):
 start=time.time()
 invocation=list(prefix);invocation[3]=cwd
 try:q=subprocess.run(invocation+['timeout','-k','5',str(seconds),*argv],capture_output=True,timeout=seconds+15);code=q.returncode;out=q.stdout;err=q.stderr
 except subprocess.TimeoutExpired as error:code=124;out=error.stdout or b'';err=error.stderr or b''
 (owned/(label+'.stdout.log')).write_bytes(out);(owned/(label+'.stderr.log')).write_bytes(err)
 row={'label':label,'exit':code,'seconds':round(time.time()-start,2),'command':argv};checks.append(row)
 (owned/'progress.json').write_text(json.dumps({'run':c['run'],'checks':checks},indent=2)+'\n')
 print(json.dumps(row),flush=True)
 return code==0
if c['formatFiles']:
 run('format',['node','/cleanup/node_modules/prettier/bin/prettier.cjs','--write',*c['formatFiles']],120)
formatted={p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}
(owned/'formatted-manifest.json').write_text(json.dumps(formatted,sort_keys=True,indent=2)+'\n')
tests=[]
for suffix in ['public-demo-catalogue.test.ts', 'show-themes.test.ts', 'public-catalogue-install.test.ts', 'account-preview-source.test.ts', 'application-preview-input.test.ts', 'site/tests/locales.test.ts', 'site/tests/client.test.ts', 'full-show-preview-timeline.test.ts', 'question-lead-in.test.ts', 'preview-stage-continuity.test.ts', 'tadazz-show/question-sequencing.test.ts', 'platform-controls.test.ts', 'end-answer-timer.test.ts', 'application-package-preview.test.ts', 'package-preview-scene.test.ts', 'package-runtime/projection.test.ts', 'package-runtime/question-family.test.ts', 'server/packages/transfers.test.ts', 'package-leaderboard-metadata.test.ts']:
 found=[p for p in c['manifest'] if p.startswith('extensions/') and p.endswith(suffix)];assert found,'Focused test missing: '+suffix;tests+=found
if c['allUnitTests']:
 run('extensions-unit-tests',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--configLoader','runner','--no-cache','--maxWorkers','1','--no-file-parallelism'],600,'/evidence/source/extensions')
 run('core-unit-tests',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--configLoader','runner','--no-cache','--maxWorkers','1','--no-file-parallelism'],600)
else:
 run('focused-tests',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--configLoader','runner','--no-cache',*[p.removeprefix('extensions/') for p in tests]],300,'/evidence/source/extensions')
 run('socket-demo-catalog',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--configLoader','runner','--no-cache','--project','socket','packages/socket/src/api/extensions/demo-catalog.test.ts','packages/socket/src/services/game/question-sequencing.test.ts','packages/socket/src/services/game/creating-worlds-repair.test.ts','packages/socket/src/handlers/end-answer-timer.test.ts'],180)
run('phone-question-sequencing',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','qa/phase3-phone/vitest.config.ts','--configLoader','runner','--no-cache','qa/phase3-phone/phone-v2-authority-startup.test.ts'],180,'/evidence/source/extensions')
run('extensions-types',['node','/cleanup/node_modules/typescript/bin/tsc','--noEmit','-p','extensions/tsconfig.json'],180)
run('socket-types',['node','/cleanup/node_modules/typescript/bin/tsc','--noEmit','-p','packages/socket/tsconfig.json'],180)
run('web-types',['node','/cleanup/node_modules/typescript/bin/tsc','--noEmit','-p','packages/web/tsconfig.app.json','--tsBuildInfoFile','/tmp/gallery-web.tsbuildinfo'],180)
lint_files=[p for p in c['formatFiles'] if pathlib.PurePosixPath(p).suffix in {'.ts','.tsx'}]
if lint_files:run('gallery-lint',['node','/cleanup/node_modules/oxlint/bin/oxlint',*lint_files],120)
run('account-native-http',['node','/cleanup/extensions/node_modules/tsx/dist/cli.mjs','--tsconfig','tsconfig.json','extensions/qa/public-gallery/account-verify.mjs'],150)
source_after={p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}
assert source_after==formatted,'Checks mutated source after formatting'
info=json.loads(subprocess.check_output(['docker','inspect',name]))[0]
report={'run':c['run'],'head':c['head'],'immutableCommit':False,'snapshotFiles':len(c['manifest']),'checks':checks,'passed':all(x['exit']==0 for x in checks),'network':'none','customerMountUsed':False,'productionChanged':False,'sourceUnchangedAfterFormatting':True,'oomKilled':info['State'].get('OOMKilled',False),'formattedPaths':[p for p in c['manifest'] if formatted[p]!=c['manifest'][p]]}
(owned/'receipt.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'final':report}),flush=True)
'''.replace("c=CONFIG", "c=" + repr(config))
result = subprocess.run([*SSH, "sudo -n python3 -"], input=remote.encode(), capture_output=True, timeout=2400 if ALL_UNIT_TESTS else 1600)
(EVIDENCE / "controller.stdout.log").write_bytes(result.stdout)
(EVIDENCE / "controller.stderr.log").write_bytes(result.stderr)
print(result.stdout.decode(errors="replace"), flush=True)
if result.returncode:
    print(result.stderr.decode(errors="replace"), flush=True)
    raise SystemExit("Linux quick checks controller failed")
pull = r'''
import pathlib,tarfile,sys,json
root=pathlib.Path(sys.argv[1]);report=json.loads((root/'receipt.json').read_text())
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz') as archive:
 for name in ['receipt.json','formatted-manifest.json','progress.json']+[p.name for p in root.glob('*.log')]:archive.add(root/name,arcname='evidence/'+name)
 for name in report['formattedPaths']:archive.add(root/'source'/name,arcname='formatted/'+name)
'''
result = subprocess.run([*SSH, "sudo -n python3 -c " + shlex.quote(pull) + " " + shlex.quote(REMOTE_ROOT)], capture_output=True, timeout=120, check=True)
copyback = []
with tarfile.open(fileobj=io.BytesIO(result.stdout), mode="r:gz") as archive:
    for member in archive:
        assert member.isfile()
        name = pathlib.PurePosixPath(member.name)
        assert not name.is_absolute() and ".." not in name.parts
        body = archive.extractfile(member).read()
        if member.name.startswith("evidence/"):
            (EVIDENCE / member.name.removeprefix("evidence/")).write_bytes(body)
        elif member.name.startswith("formatted/"):
            path = member.name.removeprefix("formatted/")
            assert path in format_files
            current = ROOT / path
            assert hashlib.sha256(current.read_bytes()).hexdigest() == manifest[path], "Concurrent source edit: " + path
            current.write_bytes(body)
            copyback.append(path)
(EVIDENCE / "format-copyback.json").write_text(json.dumps({"paths":copyback,"inputHashGuarded":True},indent=2)+"\n",encoding="utf8")
report=json.loads((EVIDENCE/'receipt.json').read_text(encoding='utf8'))
print(json.dumps({"run":RUN,"evidence":str(EVIDENCE),"remote":REMOTE_ROOT,"passed":report['passed'],"formatCopiedBack":len(copyback)}),flush=True)
raise SystemExit(0 if report['passed'] else 1)
