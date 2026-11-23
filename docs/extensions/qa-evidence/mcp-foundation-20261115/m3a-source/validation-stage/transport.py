"""Local source transport only; every install/test runs in the server container."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
PIN = "e538db2b931fa6c223facffa9a7e0b0ac31b6270d8f629d8bf8e8d72245bc1f6"
REMOTE = "/home/ubuntu/tadazz-hq-qa-20261115/source/mcp-m3a-" + PIN + "/attempt-06"
ARTIFACTS = HERE / "deliveries/attempt-06"
ARTIFACTS.mkdir(parents=True, exist_ok=True)
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
       "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", "ubuntu@132.145.25.168"]
names = ["source-overlay.tar.gz", "server-launch.py", "consumer.py", "materialize-source.mjs", "check-source.mjs",
         "get-observer.mjs", "analyze-get-trace.mjs", "validate-private.sh", "run-phase.py", "reuse-sdk.py"]
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode="w") as archive:
    for name in names:
        data = (HERE / ("corrected-source-overlay.tar.gz" if name == "source-overlay.tar.gz" else name)).read_bytes()
        member = tarfile.TarInfo(name)
        member.size, member.mode, member.mtime = len(data), 0o444, 0
        archive.addfile(member, io.BytesIO(data))
compressed = gzip.compress(buffer.getvalue(), mtime=0)
archive_sha = hashlib.sha256(compressed).hexdigest()
(ARTIFACTS / "server-delivery.tar.gz").write_bytes(compressed)
bootstrap = f'''
from pathlib import Path
import json,os
base=Path('/home/ubuntu/tadazz-hq-qa-20261115')
source=Path({REMOTE!r});evidence=base/'evidence'/('mcp-m3a-'+{PIN!r})
assert source.parent==base/'source'/('mcp-m3a-'+{PIN!r}) and not source.exists() and evidence.is_dir()
v=os.statvfs(base);free=v.f_bavail*v.f_frsize
assert free>=2400*1024**2,free
source.mkdir(mode=0o700)
print(json.dumps({{'createdSource':str(source),'createdEvidence':str(evidence),'freeBefore':free}}))
'''
result = subprocess.run(SSH + ["python3 -"], input=bootstrap, text=True, capture_output=True)
(ARTIFACTS / "transport-bootstrap.json").write_text(json.dumps({"exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr}, indent=2) + "\n", encoding="utf-8")
if result.returncode:
    print(result.stderr)
    raise SystemExit(result.returncode)
scp = ["scp", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026",
       str(ARTIFACTS / "server-delivery.tar.gz"), "ubuntu@132.145.25.168:" + REMOTE + "/server-delivery.tar.gz"]
subprocess.run(scp, check=True)
extract = f'''
from pathlib import Path,PurePosixPath
import hashlib,io,json,tarfile
root=Path({REMOTE!r});archive=root/'server-delivery.tar.gz'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=={archive_sha!r}
def unpack(file,expected=None):
    with tarfile.open(file,'r:gz') as tar:
        rows=tar.getmembers()
        if expected is not None:assert set(m.name for m in rows)==set(expected)
        for m in rows:
            p=PurePosixPath(m.name)
            assert m.isfile() and not p.is_absolute() and '..' not in p.parts and m.size<1024*1024
            target=root/str(p);assert not target.exists()
            target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            target.write_bytes(tar.extractfile(m).read());target.chmod(0o444)
unpack(archive,{names!r})
assert hashlib.sha256((root/'source-overlay.tar.gz').read_bytes()).hexdigest()=='fb0febd5df8b394273a6e04a7bf6a3760f85bc932c11d8c805a515332af0ec91'
unpack(root/'source-overlay.tar.gz')
manifest=root/'full-input-manifest.json'
assert hashlib.sha256(manifest.read_bytes()).hexdigest()=='d758084a11829061530a123dfdc6e371396b348196392dd8b8893b8e33303d4c'
print(json.dumps({{'deliveryArchiveSha256':{archive_sha!r},'selectedSourceFiles':24,'fullGraphFiles':len(json.loads(manifest.read_text())['files'])}}))
'''
result = subprocess.run(SSH + ["python3 -"], input=extract, text=True, capture_output=True)
receipt = {"kind": "THIN_SOURCE_AND_RUNNER_DELIVERY", "archiveBytes": len(compressed), "archiveSha256": archive_sha,
           "exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr, "localApplicationExecuted": False}
(ARTIFACTS / "transport.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
print(json.dumps(receipt))
raise SystemExit(result.returncode)
