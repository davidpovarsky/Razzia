import hashlib, json, pathlib, sys
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
root = pathlib.Path(sys.argv[2])
changed = []
for f in manifest['files']:
    content = (root / f['path']).read_bytes()
    if len(content) != f['bytes'] or hashlib.sha256(content).hexdigest() != f['sha256']:
        changed.append(f['path'])
pathlib.Path(sys.argv[3]).write_text(json.dumps({'files':len(manifest['files']), 'changed':changed,
    'status':'PASS' if not changed else 'FAIL'},indent=2)+'\n')
assert not changed
