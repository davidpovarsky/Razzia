import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile

# Prepare a NEW writable QA execution copy only. No install/test/build execution.
archive, manifest_file, destination = map(Path, sys.argv[1:4])
expected_archive, expected_manifest = sys.argv[4:6]

def digest(stream):
    result = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b""):
        result.update(block)
    return result.hexdigest()

with archive.open("rb") as source:
    if digest(source) != expected_archive:
        raise RuntimeError("Archive checksum mismatch")
with manifest_file.open("rb") as source:
    if digest(source) != expected_manifest:
        raise RuntimeError("Manifest checksum mismatch")
manifest = json.loads(manifest_file.read_text())
sha = manifest["commit"]
allowed = Path("/home/ubuntu/tadazz-hq-qa-20261115/fixtures")
if not re.fullmatch(r"[a-f0-9]{40}", sha) or manifest["archiveSha256"] != expected_archive:
    raise RuntimeError("Unexpected immutable source identity")
destination = destination.absolute()
if destination.exists() or destination.is_symlink() or not destination.is_relative_to(allowed / ("recovery-r1-" + sha)):
    raise RuntimeError("Destination must be a NEW assigned QA fixture path for this SHA")
if allowed.is_symlink() or allowed.resolve(strict=True) != allowed or destination.parent.resolve(strict=True) != destination.parent:
    raise RuntimeError("Unexpected parent link or absent QA-owned parent")

def safe_name(name, directory=False):
    name = name.rstrip("/") if directory else name
    if (not name or name.startswith("/") or "\\" in name or ":" in name or any(ord(c) < 32 for c in name) or
        any(part in ("", ".", "..", ".git", "node_modules", ".config") or part == ".env" or part.startswith(".env.") for part in name.split("/"))):
        raise RuntimeError("Unsafe archive/manifest member")
    return name

entries = {}
for entry in manifest["files"]:
    name = safe_name(entry["path"])
    if name in entries or entry["gitMode"] not in ("100644", "100755"):
        raise RuntimeError("Duplicate or non-regular manifest entry")
    entries[name] = entry
if len(entries) != manifest["totalFiles"] or len(entries) > 10000:
    raise RuntimeError("Unexpected file count")
with tarfile.open(archive, "r:gz") as tar:
    members = tar.getmembers()
    seen, files = set(), set()
    for member in members:
        if not member.isdir() and not member.isfile():
            raise RuntimeError("Links/devices/special files rejected")
        name = safe_name(member.name, member.isdir())
        if name in seen:
            raise RuntimeError("Duplicate archive entry")
        seen.add(name)
        if member.isdir():
            if not any(file.startswith(name + "/") for file in entries):
                raise RuntimeError("Unexpected directory")
            continue
        if name not in entries or member.size != entries[name]["size"]:
            raise RuntimeError("Unexpected archive input")
        with tar.extractfile(member) as source:
            if digest(source) != entries[name]["sha256"]:
                raise RuntimeError("Archive differs from exact Git blob")
        files.add(name)
    if files != set(entries):
        raise RuntimeError("Archive file set mismatch")
    destination.mkdir(mode=0o700)
    for member in members:
        if not member.isfile():
            continue
        name = safe_name(member.name)
        target = destination.joinpath(*name.split("/"))
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not target.parent.resolve().is_relative_to(destination.resolve()):
            raise RuntimeError("Extraction escape")
        with tar.extractfile(member) as source, target.open("xb") as output:
            shutil.copyfileobj(source, output, 1024 * 1024)
        os.chmod(target, 0o755 if entries[name]["gitMode"] == "100755" else 0o644)
        with target.open("rb") as source:
            if digest(source) != entries[name]["sha256"]:
                raise RuntimeError("Extracted input checksum mismatch")
print(json.dumps({"status": "VERIFIED_WRITABLE_QA_COPY_ONLY", "commit": sha, "files": len(entries), "destination": str(destination), "testsRun": False, "buildsRun": False}, indent=2))
