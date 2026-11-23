"""Remove one stopped failed QA's duplicate SDK copy, never the original cache."""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = ROOT / "docs/extensions/plans/phase3-takeover-20261117"
assert sys.argv[1:] in ([], ["--apply"])
proof = BASE / "tadazz-codex-browser-163cb92e7a93-c273b12c/receipt.json"
relative = proof.relative_to(ROOT).as_posix()
subprocess.run(["git", "ls-files", "--error-unmatch", relative], cwd=ROOT, check=True, capture_output=True)
assert not subprocess.check_output(["git", "status", "--porcelain", "--", relative], cwd=ROOT)
receipt = json.loads(proof.read_text(encoding="utf8"))
assert receipt["sdkCacheHashesVerifiedBeforeAfter"] and receipt["exit"] == 1
config = {"apply": bool(sys.argv[1:]), "hash": receipt["sdkCacheManifestSha256"], "files": receipt["sdkCacheFileCount"]}
REMOTE = r'''
import hashlib,json,pathlib,shutil,subprocess
c=CONFIG
base=pathlib.Path('/home/ubuntu/tadazz-phase2-20261116/evidence')
target=base/'tadazz-codex-browser-7141211d6932-0be4fb77/mcp-deps'
assert target.resolve()==target and target.is_dir() and not target.is_symlink()
assert target.parent.parent==base and shutil.rmtree.avoids_symlink_attacks
running=subprocess.check_output(['docker','ps','-q'],text=True).split()
if running:
    for container in json.loads(subprocess.check_output(['docker','inspect',*running])):
        for mount in container['Mounts']:
            source=pathlib.Path(mount['Source']).resolve()
            assert source!=target and not source.is_relative_to(target),'SDK copy is mounted in a running container'
files={p.relative_to(target).as_posix(): ('link:'+p.readlink().as_posix() if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest()) for p in target.rglob('*') if p.is_symlink() or p.is_file()}
digest=hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()
assert digest==c['hash'] and len(files)==c['files']
before=shutil.disk_usage(base).free
if c['apply']: shutil.rmtree(target)
print(json.dumps({'apply':c['apply'],'target':str(target),'files':len(files),'sha256':digest,'freeBefore':before,'freeAfter':shutil.disk_usage(base).free,'originalCacheAndAllLogsPreserved':True},indent=2))
'''
result = subprocess.run(["ssh", "-i", str(pathlib.Path.home()/".ssh/tadazz_oracle_2026"), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "ubuntu@132.145.25.168", "sudo -n python3 -"], input=REMOTE.replace("c=CONFIG", "c="+repr(config)), capture_output=True, text=True, encoding="utf8", timeout=60)
if result.returncode:
    print(result.stderr)
    raise SystemExit(result.returncode)
output = BASE / ("cleanup-owned-sdk-applied.json" if config["apply"] else "cleanup-owned-sdk-dry-run.json")
output.write_text(json.dumps(json.loads(result.stdout),indent=2)+"\n",encoding="utf8",newline="\n")
print(result.stdout)
