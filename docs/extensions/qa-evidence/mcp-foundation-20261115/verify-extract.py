import hashlib, json, pathlib, tarfile
ROOT = pathlib.Path("/home/ubuntu/tadazz-hq-qa-20261115")
PIN = "76634efa3162227a54c7b0cedaf6e28c0facab55f0e127a8b469a8e4b9f97ffc"
delivery = ROOT / "source" / ("mcp-foundation-" + PIN)
evidence = ROOT / "evidence" / ("mcp-foundation-" + PIN)
manifest_path = delivery / "test-input-manifest.json"
archive_path = delivery / "mcp-test-inputs.tar.gz"
sha = lambda data: hashlib.sha256(data).hexdigest()
assert sha(manifest_path.read_bytes()) == PIN, "manifest hash"
assert sha(archive_path.read_bytes()) == "8b989820b2433953f76630a6f3ef551454395f33dad7149a46ee2c4d959a5351", "archive hash"
manifest = json.loads(manifest_path.read_text("utf-8"))
expected = {f["path"]: f for f in manifest["files"]}
assert len(expected) == len(manifest["files"]) == 113
app = delivery / "app"
app.mkdir(mode=0o700)
with tarfile.open(archive_path, "r:gz") as archive:
    members = archive.getmembers()
    assert len(members) == len(expected)
    assert sum(m.size for m in members) < 10_000_000
    seen = set()
    for member in members:
        name = member.name
        parts = pathlib.PurePosixPath(name)
        assert not parts.is_absolute() and ".." not in parts.parts
        assert "\\" not in name and ":" not in name
        assert member.isfile() and not member.issym() and not member.islnk()
        assert name in expected and name not in seen
        seen.add(name)
        assert member.size == expected[name]["bytes"] < 2_000_000
        target = app.joinpath(*parts.parts)
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        assert target.resolve().is_relative_to(app.resolve())
        content = archive.extractfile(member).read()
        assert len(content) == member.size and sha(content) == expected[name]["sha256"]
        with target.open("xb") as output:
            output.write(content)
assert seen == set(expected)
receipt = {"status": "PASS_EXACT_SOURCE_EXTRACTION", "manifest_sha256": PIN,
           "archive_sha256": sha(archive_path.read_bytes()), "files": len(seen),
           "source": str(app), "no_symlinks_or_traversal": True,
           "runtime_tests": "NOT_RUN"}
(evidence / "00-extraction.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt))

