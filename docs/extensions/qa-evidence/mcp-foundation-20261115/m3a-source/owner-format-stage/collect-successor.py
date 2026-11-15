"""Collect immutable receipts and apply only eight proven formatter outputs."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / ".git").exists())
NAME = "mcp-format-F-20261115-01a1dfaa"
BASE = "/home/ubuntu/tadazz-hq-qa-20261115"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
       "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", "ubuntu@132.145.25.168"]
script = r'''
from pathlib import Path
import json,os,subprocess,sys,tarfile
base=Path(BASE);source=base/'source'/NAME;evidence=base/'evidence'/NAME
state=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','tadazz-hq-'+NAME]))[0]
assert not state['State']['Running'] and state['State']['Pid']==0
def physical(root):
    result=root.lstat().st_blocks*512
    for parent,dirs,files in os.walk(root):
        result+=sum((Path(parent)/n).lstat().st_blocks*512 for n in dirs+files)
    return result
v=os.statvfs(base)
receipt={'state':state['State'],'id':state['Id'],'sourcePhysicalBytes':physical(source),'evidencePhysicalBytes':physical(evidence),
    'dockerAllowanceBytes':2*1024**2,'freeBytes':v.f_bavail*v.f_frsize}
(evidence/'terminal.json').write_text(json.dumps(receipt,indent=2)+'\n')
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz') as archive:
    for path in sorted(evidence.rglob('*')):
        if path.is_file() and not path.is_symlink():archive.add(path,arcname=path.relative_to(evidence).as_posix(),recursive=False)
'''.replace('BASE', repr(BASE)).replace('NAME', repr(NAME))
result = subprocess.run(SSH + ["python3 -"], input=script.encode(), capture_output=True)
assert result.returncode == 0, result.stderr.decode()
(HERE / "server-receipts.tar.gz").write_bytes(result.stdout)
target = HERE / "server-receipts"
with tarfile.open(fileobj=io.BytesIO(result.stdout), mode="r:gz") as archive:
    for member in archive.getmembers():
        relative = PurePosixPath(member.name)
        assert member.isfile() and not relative.is_absolute() and ".." not in relative.parts
        path = target / member.name
        path.parent.mkdir(parents=True, exist_ok=True)
        assert not path.exists()
        path.write_bytes(archive.extractfile(member).read())
proof = json.loads((target / "semantic-equivalence.json").read_text())
assert len(proof["files"]) == 8 and proof["unchangedOtherInputs"] == 152
sha = lambda data: hashlib.sha256(data).hexdigest()
for row in proof["files"]:
    path = ROOT / row["path"]
    formatted = target / "formatted" / path.relative_to(ROOT / "extensions/src/mcp-app")
    assert sha(path.read_bytes()) == row["beforeSha256"], str(path)
    assert sha(formatted.read_bytes()) == row["afterSha256"]
for row in proof["files"]:
    path = ROOT / row["path"]
    path.write_bytes((target / "formatted" / path.relative_to(ROOT / "extensions/src/mcp-app")).read_bytes())
print(json.dumps({"appliedFiles": 8,"archiveSha256":sha(result.stdout),"terminal":json.loads((target/'terminal.json').read_text())},indent=2))
