"""Verify immutable regular Git inputs before extraction into the new phone root."""
import hashlib
import io
import json
import pathlib
import sys
import tarfile

if not __debug__:
    raise RuntimeError("Verified extraction requires non-optimized Python safety checks")

def verified_files(archive_bytes, manifest_bytes, archive_hash, manifest_hash):
    assert hashlib.sha256(archive_bytes).hexdigest() == archive_hash
    assert hashlib.sha256(manifest_bytes).hexdigest() == manifest_hash
    manifest = json.loads(manifest_bytes)
    sha = manifest["review_sha"]
    assert len(sha) == 40 and all(c in "0123456789abcdef" for c in sha)
    files = {item["path"]: item for item in manifest["files"]}
    assert len(files) == len(manifest["files"])
    assert sum(item["bytes"] for item in files.values()) < 128 * 1024 * 1024
    seen = set()
    verified = []
    # Parse the same immutable bytes whose digest was checked, not a path that
    # could be replaced between validation and extraction.
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:") as tar:
        for member in tar.getmembers():
            path = pathlib.PurePosixPath(member.name)
            assert not path.is_absolute() and ".." not in path.parts
            assert "\\" not in member.name and ":" not in member.name
            assert member.name not in seen
            seen.add(member.name)
            assert member.isdir() or member.isreg()
            if member.isdir():
                assert any(name.startswith(member.name.rstrip("/") + "/") for name in files)
                continue
            assert member.name in files
            item = files[member.name]
            assert item["mode"] in ("100644", "100755")
            assert member.size == item["bytes"]
            contents = tar.extractfile(member).read()
            assert hashlib.sha256(contents).hexdigest() == item["sha256"]
            verified.append((member.name, contents, item["mode"]))
        assert set(files).issubset(seen)
    return sha, verified


def main():
    archive, manifest_file, archive_hash, manifest_hash, destination = sys.argv[1:]
    sha, files = verified_files(
        pathlib.Path(archive).read_bytes(), pathlib.Path(manifest_file).read_bytes(),
        archive_hash, manifest_hash,
    )
    allowed_root = pathlib.Path("/home/ubuntu/tadazz-hq-qa-20261115/source").resolve(strict=True)
    target = pathlib.Path(destination)
    assert target == allowed_root / ("phone-auth-" + sha)
    assert target.parent.resolve(strict=True) == allowed_root
    assert not target.exists() and not target.is_symlink()
    target.mkdir(mode=0o700)
    for name, contents, mode in files:
        output = target.joinpath(*pathlib.PurePosixPath(name).parts)
        assert output.resolve().is_relative_to(target.resolve())
        output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with output.open("xb") as stream:
            stream.write(contents)
        output.chmod(0o755 if mode == "100755" else 0o644)
    print(json.dumps({"status": "EXTRACTED_VERIFIED_SOURCE_ONLY", "review_sha": sha, "files": len(files)}))


if __name__ == "__main__":
    main()
