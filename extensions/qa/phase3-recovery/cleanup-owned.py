"""Owner-authorized cleanup of two exact failed Codex source copies only.

Dry-run by default. Preserve fixtures, logs, all accepted source and old workers.
Validate every source/archive byte against the already committed input manifest
before any deletion. Never follow dependency links or delete a run directory.
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT / "docs/extensions/plans/phase3-takeover-20261117"
assert sys.argv[1:] in ([], ["--apply"], ["--failed-native-c412"], ["--failed-native-c412", "--apply"], ["--failed-native-714"], ["--failed-native-714", "--apply"], ["--failed-native-163"], ["--failed-native-163", "--apply"])
RUNS = (["tadazz-codex-163cb92e7a93-7e32e936"] if "--failed-native-163" in sys.argv else
        ["tadazz-codex-7141211d6932-e5d56c61"] if "--failed-native-714" in sys.argv else
        ["tadazz-codex-c4125d58a746-2fea79ad"] if "--failed-native-c412" in sys.argv else
        ["tadazz-codex-45b266bd74ae-6f7c237d", "tadazz-codex-a9a3fe2d68aa-da23916f"])
inputs = {}
for run in RUNS:
    path = BASE / run / "input-manifest.json"
    relative = path.relative_to(ROOT).as_posix()
    subprocess.run(["git", "ls-files", "--error-unmatch", relative], cwd=ROOT, check=True, capture_output=True)
    assert not subprocess.check_output(["git", "status", "--porcelain", "--", relative], cwd=ROOT)
    inputs[run] = json.loads(path.read_text(encoding="utf8"))
config = {"apply": "--apply" in sys.argv, "inputs": inputs,
          "evidenceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()}
REMOTE = r'''
import hashlib,json,pathlib,shutil,tarfile
c=CONFIG
base=pathlib.Path('/home/ubuntu/tadazz-phase2-20261116/evidence')
assert base.resolve()==base and shutil.rmtree.avoids_symlink_attacks
targets=[]
proofs=[]
preserve=[]
for run,item in c['inputs'].items():
    assert run in ('tadazz-codex-45b266bd74ae-6f7c237d','tadazz-codex-a9a3fe2d68aa-da23916f','tadazz-codex-c4125d58a746-2fea79ad','tadazz-codex-7141211d6932-e5d56c61','tadazz-codex-163cb92e7a93-7e32e936')
    source=base/run/'source'
    assert source.resolve()==source and source.is_dir() and not source.is_symlink()
    manifest=item['files']
    for name,expected in manifest.items():
        relative=pathlib.PurePosixPath(name)
        assert not relative.is_absolute() and '..' not in relative.parts
        file=source/name
        assert file.resolve()==file and file.is_file()
        assert hashlib.sha256(file.read_bytes()).hexdigest()==expected,name
    extra=[p.relative_to(source).as_posix() for p in source.rglob('*') if p.is_file() and not p.is_symlink() and p.relative_to(source).as_posix() not in manifest]
    assert all(run in ('tadazz-codex-c4125d58a746-2fea79ad','tadazz-codex-7141211d6932-e5d56c61','tadazz-codex-163cb92e7a93-7e32e936') and name.startswith(('packages/web/dist/','extensions/test-results/')) for name in extra),extra
    generated={name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in extra}
    traces=source/'extensions/test-results'
    if traces.exists():
        destination=base/run/'preserved-test-results'
        assert traces.resolve()==traces and traces.is_dir() and not traces.is_symlink()
        assert not destination.exists() and destination.resolve()==destination
        preserve.append((traces,destination))
    targets.append(source)
    proofs.append({'target':str(source),'sourceSha':item['sha'],'verifiedFiles':len(manifest),'generatedSiteFiles':generated})
    archive=base/run/'source.tar.gz'
    if archive.exists():
        assert archive.resolve()==archive and not archive.is_symlink()
        seen=set()
        with tarfile.open(archive,'r:gz') as stream:
            for member in stream:
                assert member.isdir() or member.isfile()
                if member.isfile():
                    assert member.name in manifest
                    assert hashlib.sha256(stream.extractfile(member).read()).hexdigest()==manifest[member.name]
                    seen.add(member.name)
        assert seen==set(manifest)
        targets.append(archive)
        proofs.append({'target':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'verifiedFiles':len(seen)})
before=shutil.disk_usage(base).free
if c['apply']:
    # All targets validated above, before any mutation. Fixtures/logs stay put.
    for origin,destination in preserve: origin.rename(destination)
    for target in targets:
        assert target.parent.parent==base and target.name in ('source','source.tar.gz')
        if target.is_dir(): shutil.rmtree(target)
        else: target.unlink()
print(json.dumps({'apply':c['apply'],'preservedEvidenceCommit':c['evidenceCommit'],'targets':proofs,'preservedTraceDirectories':[{ 'from':str(a),'to':str(b)} for a,b in preserve],'freeBefore':before,'freeAfter':shutil.disk_usage(base).free,'fixturesAndLogsPreserved':True,'oldWorkersAndCustomerDataAccessed':False},indent=2))
'''
remote = REMOTE.replace("c=CONFIG", "c=" + repr(config))
result = subprocess.run(["ssh", "-i", str(pathlib.Path.home()/".ssh/tadazz_oracle_2026"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "ubuntu@132.145.25.168", "sudo -n python3 -"], input=remote, capture_output=True, text=True, encoding="utf8", timeout=90)
prefix = ("cleanup-owned-native-163" if "--failed-native-163" in sys.argv else
          "cleanup-owned-native-714" if "--failed-native-714" in sys.argv else
          "cleanup-owned-native-c412" if "--failed-native-c412" in sys.argv else "cleanup-owned")
output = BASE / (prefix + ("-applied.json" if config["apply"] else "-dry-run.json"))
if result.returncode:
    print(result.stderr)
    raise SystemExit(result.returncode)
receipt = json.loads(result.stdout)
output.write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf8",newline="\n")
print(result.stdout)
