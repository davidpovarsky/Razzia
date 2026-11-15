import hashlib, json, pathlib, tarfile
ROOT = pathlib.Path("/home/ubuntu/tadazz-hq-qa-20261115")
PIN = "c4dc04deb2d80953e13fe1771686c1e00e293048c66f8b7a0365879643ee8d68"
delivery = ROOT / "source" / ("mcp-foundation-" + PIN)
evidence = ROOT / "evidence" / ("mcp-foundation-" + PIN)
mp = delivery / "final-input-manifest.json"
archive = delivery / "mcp-final-inputs.tar.gz"
sha = lambda data: hashlib.sha256(data).hexdigest()
assert sha(mp.read_bytes()) == PIN
assert sha(archive.read_bytes()) == "6d73388846e5bec32d0b0e1147078db9b0d50f469b2d9234ca07cb3c5d309897"
manifest = json.loads(mp.read_text())
expected = {f["path"]: f for f in manifest["files"]}
assert len(expected) == len(manifest["files"]) == 118
app = delivery / "app"
app.mkdir(mode=0o700)
with tarfile.open(archive, "r:gz") as tf:
    members = tf.getmembers()
    assert len(members) == len(expected)
    assert sum(x.size for x in members) < 10_000_000
    seen = set()
    for entry in members:
        parts = pathlib.PurePosixPath(entry.name)
        assert not parts.is_absolute() and ".." not in parts.parts
        assert "\\" not in entry.name and ":" not in entry.name
        assert entry.isfile() and not entry.issym() and not entry.islnk()
        assert entry.name in expected and entry.name not in seen
        seen.add(entry.name)
        data = tf.extractfile(entry).read()
        assert len(data) == expected[entry.name]["bytes"] < 2_000_000
        assert sha(data) == expected[entry.name]["sha256"]
        target = app.joinpath(*parts.parts)
        target.parent.mkdir(parents=True,exist_ok=True)
        assert target.resolve().is_relative_to(app.resolve())
        with target.open("xb") as out:
            out.write(data)
assert seen == set(expected)
receipt = {"status":"PASS_FINAL_SOURCE_EXTRACTION","manifestSha256":PIN,"archiveSha256":sha(archive.read_bytes()),"files":len(seen),"allActualSourceHashesMatched":True}
(evidence / "00-extraction.json").write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps(receipt))

