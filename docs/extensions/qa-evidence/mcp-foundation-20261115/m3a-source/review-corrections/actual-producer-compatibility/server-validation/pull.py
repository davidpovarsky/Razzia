"""Read-only receipt stream directly to Windows; no server archive is created."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
REMOTE = "/home/ubuntu/tadazz-hq-qa-20261115/evidence/mcp-bfb160-87ffbfdbe45d43fdbe5e7f799c18036d"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
    "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", "ubuntu@132.145.25.168", "python3 -"]
result = subprocess.run(SSH, input=(HERE / "release-server.py").read_bytes(), capture_output=True)
(HERE / "release-transport.json").write_text(json.dumps({"exit": result.returncode,
    "stdout": result.stdout.decode(), "stderr": result.stderr.decode()}, indent=2) + "\n")
print(result.stdout.decode())
if result.returncode:
    raise SystemExit(result.returncode)
script = f"""
from pathlib import Path
import sys,tarfile
root=Path({REMOTE!r})
assert (root/'allocation-release.json').is_file()
files=sorted(root.rglob('*'))
assert all(p.is_file() or p.is_dir() for p in files)
assert not any(p.is_symlink() for p in files)
assert sum(p.stat().st_size for p in files if p.is_file())<4*1024**2
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz') as archive:
    for path in files:
        if path.is_file():
            archive.add(path,arcname=path.relative_to(root).as_posix(),recursive=False)
"""
result = subprocess.run(SSH, input=script.encode(), capture_output=True)
if result.returncode:
    (HERE / "pull-failure.json").write_text(json.dumps({"exit": result.returncode,
        "stderr": result.stderr.decode()}, indent=2) + "\n")
    raise SystemExit(result.returncode)
data = result.stdout
(HERE / "server-receipts.tar.gz").write_bytes(data)
target = HERE / "server-receipts"
assert not target.exists()
target.mkdir()
rows = []
with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
    for member in archive.getmembers():
        relative = PurePosixPath(member.name)
        assert member.isfile() and not relative.is_absolute() and ".." not in relative.parts
        assert member.size <= 1024 * 1024
        raw = archive.extractfile(member).read()
        file = target / str(relative)
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(raw)
        rows.append({"path": member.name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
receipt = {"kind": "BINARY_SSH_RECEIPT_STREAM_NO_SERVER_ARCHIVE", "files": len(rows),
    "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "exit": result.returncode,
    "rawFiles": rows, "serverEvidencePreserved": True}
(HERE / "receipt-transport.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({key: value for key, value in receipt.items() if key != "rawFiles"}))
