"""Build the exact thin delivery locally; no install/application execution."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
SOURCE = "2ba3f1cd9ad3394c5378bf3fc8de73f6d148f1a5"
BASELINE_SHA = "ce021e537e31af7cbc989d4b2c3e5abb0966de41413f994e2803276b31dec7d9"
OVERLAY_SHA = "c6741466fe6d45adaea5740f3ba625a0b5a1eee3f32de249276205e38a182b56"
sha = lambda data: hashlib.sha256(data).hexdigest()


def exact(path, expected):
    data = path.read_bytes()
    if sha(data) != expected:
        raise ValueError(f"Input manifest mismatch: {path.name}")
    return json.loads(data)


baseline = exact(HERE.parents[1] / "send-eb00/final-input-manifest.json", BASELINE_SHA)
overlay = exact(HERE.parent / "source-overlay-manifest.json", OVERLAY_SHA)
files = {row["path"]: row for row in baseline["files"]}
files.update({row["path"]: row for row in overlay["files"]})
if len(files) != 150 or len(overlay["files"]) != 23:
    raise ValueError("Unexpected source graph size")
for row in files.values():
    relative = Path(row["path"])
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Unsafe source graph path")
    actual = (ROOT / relative).read_bytes()
    if len(actual) != row["bytes"] or sha(actual) != row["sha256"]:
        raise ValueError(f"Frozen source changed: {relative}")
manifest = {"kind": "M3A_EXACT_SOURCE_BEFORE_OFFLINE_LOCK_RESOLUTION",
            "sourceCommit": SOURCE, "baselineManifestSha256": BASELINE_SHA,
            "overlayManifestSha256": OVERLAY_SHA, "files": [files[p] for p in sorted(files)]}
manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
(HERE / "full-input-manifest.json").write_bytes(manifest_bytes)
archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode="w") as tar:
    for row in overlay["files"]:
        data = (ROOT / row["path"]).read_bytes()
        entry = tarfile.TarInfo("app/" + row["path"])
        entry.size = len(data)
        entry.mode = 0o444
        entry.mtime = 0
        tar.addfile(entry, io.BytesIO(data))
    entry = tarfile.TarInfo("full-input-manifest.json")
    entry.size = len(manifest_bytes)
    entry.mode = 0o444
    entry.mtime = 0
    tar.addfile(entry, io.BytesIO(manifest_bytes))
compressed = gzip.compress(archive.getvalue(), mtime=0)
(HERE / "source-overlay.tar.gz").write_bytes(compressed)
receipt = {"kind": "LOCAL_SOURCE_PACKAGING_ONLY", "sourceCommit": SOURCE,
           "inputFiles": len(files), "overlayFiles": len(overlay["files"]),
           "overlayInputBytes": sum(row["bytes"] for row in overlay["files"]),
           "archiveBytes": len(compressed), "archiveSha256": sha(compressed),
           "fullInputManifestSha256": sha(manifest_bytes), "cacheReady": False,
           "runtimeInstallTestsTypecheck": "NOT_RUN"}
(HERE / "preparation.json").write_bytes((json.dumps(receipt, indent=2) + "\n").encode())
print(json.dumps(receipt))
