import hashlib, json, pathlib, tarfile
base = pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
pin = '4e1f9586a53c79ffa1935fcfad33901d1eb361fd97181d420c86c9d3741f720a'
root = base / 'source' / ('mcp-lifecycle-prep-' + pin)
evidence = base / 'evidence' / ('mcp-lifecycle-prep-' + pin)
sha = lambda b: hashlib.sha256(b).hexdigest()
mp = root / 'candidate-input-manifest.json'
archive = root / 'candidate-inputs.tar.gz'
assert sha(mp.read_bytes()) == pin
assert sha(archive.read_bytes()) == 'd69ed10054474db094def04ed3dd438ee5c1aaf7bf723dd8762d5ff8e085ec89'
manifest = json.loads(mp.read_text())
expected = {f['path']: f for f in manifest['files']}
assert len(expected) == len(manifest['files']) == 128
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
