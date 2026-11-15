import hashlib, json, pathlib, tarfile
root = pathlib.Path("/home/ubuntu/tadazz-hq-qa-20261115/fixtures/mcp-foundation-76634efa3162227a54c7b0cedaf6e28c0facab55f0e127a8b469a8e4b9f97ffc")
archive = root / "format-inputs.tar.gz"
assert hashlib.sha256(archive.read_bytes()).hexdigest() == "f95794caee6ec299d5cdc1a3ccbc0189ce014da3f44536eca9c82619b82c9aa3"
dest = root / "format-work"
dest.mkdir(mode=0o700)
with tarfile.open(archive, "r:gz") as tf:
    for entry in tf.getmembers():
        parts = pathlib.PurePosixPath(entry.name)
        assert not parts.is_absolute() and ".." not in parts.parts
        assert "\\" not in entry.name and ":" not in entry.name
        assert entry.isdir() or entry.isfile()
        assert entry.name.startswith("extensions/src/mcp-app/") or entry.name == "docs/extensions/plans/MCP_APP_ADOPTION_20261115.md"
        target = dest.joinpath(*parts.parts)
        assert target.resolve().is_relative_to(dest.resolve())
        if entry.isdir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            assert entry.size < 200000
            with target.open("xb") as out:
                out.write(tf.extractfile(entry).read())
(root / "format-options.json").write_text(json.dumps({"semi":False,"tabWidth":2,"singleQuote":False,"printWidth":80,"trailingComma":"all"}))
print("formatter fixture extraction verified; actual delivery untouched")

