"""Exact source859 overlay; retain the original source2ba manifests/archives."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
sha = lambda data: hashlib.sha256(data).hexdigest()
original = json.loads((HERE / "full-input-manifest.json").read_bytes())
overlay = json.loads((HERE.parent / "source-overlay-manifest.json").read_bytes())
allowed = {"extensions/src/mcp-app/first-party/ingress.ts", "extensions/src/mcp-app/tests/first-party/store.nodecheck.ts", "extensions/src/mcp-app/pnpm-lock.yaml"}
current = []
changed = set()
for row in original["files"]:
    data = (ROOT / row["path"]).read_bytes()
    now = {"path": row["path"], "bytes": len(data), "sha256": sha(data)}
    current.append(now)
    if now != row: changed.add(row["path"])
assert changed == allowed, changed
assert sha((ROOT / "extensions/src/mcp-app/pnpm-lock.yaml").read_bytes()) == "e0bcdd5163a144d53ed743c57e526866083cf7500d4e2cfdfea88b88fbe09838"
manifest = {"kind": "M3A_CORRECTED_SOURCE_FOR_ACTUAL_VALIDATION", "sourceCommit": "ad8955327a56213b3a437379fcc7ccc6e05a261a",
    "baseSourceCommit": original["sourceCommit"], "baseFullManifestSha256": sha((HERE / "full-input-manifest.json").read_bytes()),
    "baselineManifestSha256": original["baselineManifestSha256"], "changedSinceSource2ba": sorted(changed), "files": current}
manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
(HERE / "corrected-input-manifest.json").write_bytes(manifest_bytes)
paths = sorted({row["path"] for row in overlay["files"]} | allowed)
assert len(paths) == 24 and len(current) == 150
archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode="w") as tar:
    for relative in paths:
        data = (ROOT / relative).read_bytes()
        entry = tarfile.TarInfo("app/" + relative)
        entry.size, entry.mode, entry.mtime = len(data), 0o444, 0
        tar.addfile(entry, io.BytesIO(data))
    entry = tarfile.TarInfo("full-input-manifest.json")
    entry.size, entry.mode, entry.mtime = len(manifest_bytes), 0o444, 0
    tar.addfile(entry, io.BytesIO(manifest_bytes))
compressed = gzip.compress(archive.getvalue(), mtime=0)
(HERE / "corrected-source-overlay.tar.gz").write_bytes(compressed)
receipt = {"kind": "LOCAL_SOURCE_PACKAGING_ONLY", "sourceCommit": manifest["sourceCommit"], "inputFiles": 150,
    "overlayFiles": len(paths), "overlayBytes": sum((ROOT / p).stat().st_size for p in paths),
    "archiveBytes": len(compressed), "archiveSha256": sha(compressed), "fullInputManifestSha256": sha(manifest_bytes),
    "oldArtifactsPreserved": True, "functionalChecks": "NOT_RUN_ON_CORRECTED_SOURCE"}
(HERE / "corrected-preparation.json").write_bytes((json.dumps(receipt, indent=2) + "\n").encode())
print(json.dumps(receipt))
