import hashlib, json, pathlib, tarfile
base = pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
pin = '689e224e9a6860878bad32363673397759407dc10c1f99ce83b9b3431a3eff45'
root = base / 'source' / ('mcp-send-prep-' + pin)
evidence = base / 'evidence' / ('mcp-send-prep-' + pin)
sha = lambda b: hashlib.sha256(b).hexdigest()
mp = root / 'candidate-input-manifest.json'
archive = root / 'candidate-inputs.tar.gz'
assert sha(mp.read_bytes()) == pin
assert sha(archive.read_bytes()) == '04720aa4bdf04608f363655f7a5dbe4d5e998268d6bb9c50e58e40bdfc84b85c'
manifest = json.loads(mp.read_text())
expected = {f['path']: f for f in manifest['files']}
assert len(expected) == len(manifest['files']) == 129
app = root / 'app'
app.mkdir(mode=0o700)
with tarfile.open(archive, 'r:gz') as tf:
    members = tf.getmembers()
    assert len(members) == len(expected)
    assert sum(m.size for m in members) < 10_000_000
    seen = set()
    for m in members:
        p = pathlib.PurePosixPath(m.name)
        assert m.isfile() and not m.issym() and not m.islnk()
        assert not p.is_absolute() and '..' not in p.parts
        assert '\\' not in m.name and ':' not in m.name
        assert m.name in expected and m.name not in seen
        seen.add(m.name)
        content = tf.extractfile(m).read()
        assert len(content) == expected[m.name]['bytes'] < 2_000_000
        assert sha(content) == expected[m.name]['sha256']
        target = app.joinpath(*p.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        assert target.resolve().is_relative_to(app.resolve())
        with target.open('xb') as out: out.write(content)
assert seen == set(expected)
(evidence / '00-extraction.json').write_text(json.dumps({'files':len(seen), 'allHashesMatched':True, 'manifest':pin})+'\n')
