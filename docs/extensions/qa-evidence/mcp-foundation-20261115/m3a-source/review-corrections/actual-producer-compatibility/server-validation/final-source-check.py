"""Post-run local Git/freeze inspection only; no project imports or tests."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[7]
manifest = json.loads((HERE.parent / "final-input-manifest.json").read_bytes())
for row in manifest["files"]:
    raw = (ROOT / row["path"]).read_bytes()
    assert len(raw) == row["bytes"] and hashlib.sha256(raw).hexdigest() == row["sha256"]
tree = subprocess.check_output(["git", "ls-tree", "-r", "-z",
    "ad8955327a56213b3a437379fcc7ccc6e05a261a"], cwd=ROOT)
blobs = {}
for entry in tree.split(b"\0"):
    if entry:
        header, path = entry.split(b"\t", 1)
        blobs[path.decode()] = header.split()[2].decode()
freeze = json.loads((ROOT / "docs/extensions/plans/tds-freeze.json").read_bytes())
for path in freeze["files"]:
    raw = (ROOT / path).read_bytes()
    assert hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == blobs[path]
diff = subprocess.check_output(["git", "diff", "--name-only",
    "bfb796c72495f0f9d99442066f825a74ebd054d4", "--", "extensions/src/mcp-app"], cwd=ROOT)
assert not diff.strip()
guard = subprocess.run(["node", "extensions/qa/tds-boundary.mjs"], cwd=ROOT, capture_output=True)
(HERE / "final-raw-freeze.stdout").write_bytes(guard.stdout)
(HERE / "final-raw-freeze.stderr").write_bytes(guard.stderr)
match = re.search(r"Error: (\{[^\n]+\})", guard.stderr.decode(errors="replace"))
details = json.loads(match.group(1)) if match else None
assert guard.returncode == 1 and details and len(details["denied"]) == 56 and not details["mismatches"]
result = {"kind": "POST_RUN_STATIC_SOURCE_AND_FREEZE_CHECK", "sourceInputsUnchanged": 160,
    "protectedFilesUnchanged": len(freeze["files"]), "applicationGitDiffFromBfb": [],
    "rawGuardExit": guard.returncode, "rawGuardDenied": len(details["denied"]),
    "rawGuardMismatches": details["mismatches"], "sourceEditOrRuntimeRetry": False}
(HERE / "final-source-check.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))
