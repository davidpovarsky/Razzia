"""Transport the immutable source and minimal runner; no local application work."""
import ast
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[7]
PARENT = HERE.parent
NAME = "mcp-bfb160-87ffbfdbe45d43fdbe5e7f799c18036d"
REMOTE = "/home/ubuntu/tadazz-hq-qa-20261115/source/" + NAME
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
    "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", "ubuntu@132.145.25.168"]
sha = lambda data: hashlib.sha256(data).hexdigest()
grant = json.loads((HERE / "grant.json").read_bytes())
assert grant["execution_authorized"] and grant["manifest160_sha256"] == "4c02c37421191cd8ea2fe46e35c0b8a37467a7d89708a11bf8cd68047bac29ab"
assert sha((PARENT / "final-input-manifest.json").read_bytes()) == grant["manifest160_sha256"]
assert sha((PARENT / "final-source-overlay.tar.gz").read_bytes()) == grant["overlay_sha256"]
assert sha((PARENT / "MINIMAL_COMMANDS.md").read_bytes()) == grant["minimal_commands_sha256"]
manifest = json.loads((PARENT / "final-input-manifest.json").read_bytes())
for row in manifest["files"]:
    data = (ROOT / row["path"]).read_bytes()
    assert len(data) == row["bytes"] and sha(data) == row["sha256"]
members = {name: (HERE / name).read_bytes() for name in ["consumer.py", "launch.py", "run-phase.py", "grant.json"]}
members.update({name: (PARENT / name).read_bytes() for name in ["final-source-overlay.tar.gz", "MINIMAL_COMMANDS.md"]})
for name, raw in members.items():
    if name.endswith(".py"):
        ast.parse(raw, filename=name)
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode="w") as archive:
    for name, raw in members.items():
        info = tarfile.TarInfo(name)
        info.size, info.mode, info.mtime = len(raw), 0o444, 0
        archive.addfile(info, io.BytesIO(raw))
compressed = gzip.compress(buffer.getvalue(), mtime=0)
(HERE / "delivery.tar.gz").write_bytes(compressed)
archive_sha = sha(compressed)
(HERE / "prepared-delivery.json").write_text(json.dumps({"grant": grant["grant_id"],
    "sourceManifestSha256": grant["manifest160_sha256"], "sourceOverlaySha256": grant["overlay_sha256"],
    "transportBytes": len(compressed), "transportSha256": archive_sha,
    "members": {name: {"bytes": len(raw), "sha256": sha(raw)} for name, raw in members.items()},
    "all160LocalInputsUnchanged": True, "runnerPythonSyntax": "PASS",
    "localAppImportOrInstall": False}, indent=2) + "\n")
bootstrap = f"""
from pathlib import Path
import json,os
base=Path('/home/ubuntu/tadazz-hq-qa-20261115')
source=Path({REMOTE!r}); evidence=base/'evidence'/{NAME!r}
assert source.parent==base/'source' and evidence.parent==base/'evidence'
assert not source.exists() and not evidence.exists()
v=os.statvfs(base);free=v.f_bavail*v.f_frsize
assert free>=2320*1024**2,free
source.mkdir(mode=0o700); evidence.mkdir(mode=0o700)
print(json.dumps({{'source':str(source),'evidence':str(evidence),'freeBefore':free}}))
"""
def receipt(name, result):
    data = {"exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
    (HERE / name).write_text(json.dumps(data, indent=2) + "\n")
    return data

result = subprocess.run(SSH + ["python3 -"], input=bootstrap, text=True, capture_output=True)
print(json.dumps({"bootstrap": receipt("transport-bootstrap.json", result)}))
if result.returncode:
    raise SystemExit(result.returncode)
scp = ["scp", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
    "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", str(HERE / "delivery.tar.gz"),
    "ubuntu@132.145.25.168:" + REMOTE + "/delivery.tar.gz"]
result = subprocess.run(scp, capture_output=True, text=True)
receipt("transport-scp.json", result)
if result.returncode:
    raise SystemExit(result.returncode)
extract = f"""
from pathlib import Path,PurePosixPath
import hashlib,json,os,tarfile
root=Path({REMOTE!r}); evidence=root.parents[1]/'evidence'/{NAME!r}
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
assert sha(root/'delivery.tar.gz')=={archive_sha!r}
def unpack(path,expected):
    with tarfile.open(path,'r:gz') as archive:
        members=archive.getmembers()
        assert len(members)==len(expected) and {{m.name for m in members}}==set(expected)
        for m in members:
            p=PurePosixPath(m.name)
            assert m.isfile() and not p.is_absolute() and '..' not in p.parts and m.size<1024*1024
            target=root/str(p); assert not target.exists()
            target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            target.write_bytes(archive.extractfile(m).read()); target.chmod(0o444)
unpack(root/'delivery.tar.gz',{list(members)!r})
grant=json.loads((root/'grant.json').read_text())
assert sha(root/'final-source-overlay.tar.gz')==grant['overlay_sha256']
assert sha(root/'MINIMAL_COMMANDS.md')==grant['minimal_commands_sha256']
with tarfile.open(root/'final-source-overlay.tar.gz','r:gz') as archive:
    manifest_bytes=archive.extractfile('final-input-manifest.json').read()
assert hashlib.sha256(manifest_bytes).hexdigest()==grant['manifest160_sha256']
manifest=json.loads(manifest_bytes)
unpack(root/'final-source-overlay.tar.gz',['app/'+p for p in manifest['deltaPaths']]+['final-input-manifest.json'])
assert len(manifest['files'])==160
def physical(folder):
    total=folder.stat().st_blocks*512
    for parent,dirs,files in os.walk(folder):
        total+=sum((Path(parent)/name).lstat().st_blocks*512 for name in dirs+files)
    return total
owned=physical(root)+physical(evidence)+2*1024**2
assert owned<=8*1024**2,owned
v=os.statvfs(root);free=v.f_bavail*v.f_frsize
assert free>=(2048+200+64)*1024**2+max(0,8*1024**2-owned),free
print(json.dumps({{'transportSha256':{archive_sha!r},'sourceManifestSha256':sha(root/'final-input-manifest.json'),'files':160,'delta':16,'ownPhysicalUpperBound':owned,'freeBytes':free}}))
"""
result = subprocess.run(SSH + ["python3 -"], input=extract, text=True, capture_output=True)
print(json.dumps({"extraction": receipt("transport-extract.json", result)}))
if result.returncode:
    raise SystemExit(result.returncode)
result = subprocess.run(SSH + ["python3 " + REMOTE + "/launch.py"], text=True, capture_output=True)
print(json.dumps({"launch": receipt("remote-launch.json", result)}))
raise SystemExit(result.returncode)
