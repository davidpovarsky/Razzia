import hashlib
import json
from pathlib import Path
import sys

# Read-only verification of delivered tracked inputs in a QA-owned writable copy.
root = Path(sys.argv[1]).resolve(strict=True)
manifest = json.loads(Path(sys.argv[2]).read_text())
mismatches = []
for entry in manifest["files"]:
    parts = entry["path"].split("/")
    if any(part in ("", ".", "..") for part in parts) or "\\" in entry["path"] or ":" in entry["path"]:
        raise RuntimeError("Unsafe manifest name")
    file = root.joinpath(*parts)
    if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(root):
        mismatches.append({"path": entry["path"], "reason": "missing/link/escape"})
        continue
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    if file.stat().st_size != entry["size"] or digest.hexdigest() != entry["sha256"]:
        mismatches.append({"path": entry["path"], "reason": "content mismatch"})
print(json.dumps({"commit": manifest["commit"], "inputs": len(manifest["files"]), "mismatches": mismatches, "status": "PASS" if not mismatches else "FAIL"}, indent=2))
sys.exit(1 if mismatches else 0)
