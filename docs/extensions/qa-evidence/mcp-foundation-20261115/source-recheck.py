import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
mp = root.parent / "final-input-manifest.json"
manifest = json.loads(mp.read_text())
changed = []
for row in manifest["files"]:
    p = root / row["path"]
    if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != row["sha256"]:
        changed.append(row["path"])
receipt = {"status":"PASS" if not changed else "FAIL","files":len(manifest["files"]),"changed":changed}
pathlib.Path(sys.argv[2]).write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps(receipt))
assert not changed

