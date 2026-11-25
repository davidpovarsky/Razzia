"""Verify frozen bytes/Git/archive without importing any application module."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[6]
EXPECTED_SOURCE = "bfb796c72495f0f9d99442066f825a74ebd054d4"
EXPECTED_MANIFEST = "4c02c37421191cd8ea2fe46e35c0b8a37467a7d89708a11bf8cd68047bac29ab"
EXPECTED_OVERLAY = "4b7d492161100582dfd2b0871554c73f63d8d54eeb6e03856e7586db2d6060a6"
sha = lambda raw: hashlib.sha256(raw).hexdigest()
manifest_raw = (HERE / "final-input-manifest.json").read_bytes()
assert sha(manifest_raw) == EXPECTED_MANIFEST
manifest = json.loads(manifest_raw)
assert manifest["candidateCommit"] == EXPECTED_SOURCE
tree = subprocess.check_output(["git", "ls-tree", "-r", "-z", EXPECTED_SOURCE], cwd=ROOT)
blobs = {}
for entry in tree.split(b"\0"):
    if entry:
        header, name = entry.split(b"\t", 1)
        mode, kind, blob = header.split()
        blobs[name.decode()] = (mode.decode(), kind.decode(), blob.decode())
rows = {row["path"]: row for row in manifest["files"]}
for path, row in rows.items():
    raw = (ROOT / path).read_bytes()
    assert len(raw) == row["bytes"] and sha(raw) == row["sha256"]
    blob = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
    assert blobs[path] == ("100644", "blob", blob), path
archive_path = HERE / "final-source-overlay.tar.gz"
assert sha(archive_path.read_bytes()) == EXPECTED_OVERLAY
expected_names = {"app/" + path for path in manifest["deltaPaths"]} | {"final-input-manifest.json"}
with tarfile.open(archive_path, "r:gz") as archive:
    members = archive.getmembers()
    assert len(members) == len(expected_names)
    assert {member.name for member in members} == expected_names
    for member in members:
        assert member.isfile() and member.mode == 0o444 and member.mtime == 0
        raw = archive.extractfile(member).read()
        if member.name == "final-input-manifest.json":
            assert raw == manifest_raw
        else:
            row = rows[member.name.removeprefix("app/")]
            assert len(raw) == row["bytes"] and sha(raw) == row["sha256"]
report = {"kind": "FROZEN_SOURCE_GIT_ARCHIVE_VERIFICATION_ONLY", "sourceCommit": EXPECTED_SOURCE,
    "committedSourceInputs": len(rows), "regularOverlaySourceFiles": len(manifest["deltaPaths"]),
    "manifestSha256": EXPECTED_MANIFEST, "overlaySha256": EXPECTED_OVERLAY,
    "allBytesMatchSourceCommitAndWorkingTree": True, "onlyRegularReadonlyArchiveFiles": True,
    "runtime": "NOT_RUN", "applicationImports": "NOT_RUN", "sqlite": "NOT_RUN"}
(HERE / "frozen-verification.json").write_bytes((json.dumps(report, indent=2) + "\n").encode())
print(json.dumps(report))
