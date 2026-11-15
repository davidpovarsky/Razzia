import hashlib
import json
import os
from pathlib import Path

root = Path('/home/ubuntu/tadazz-hq-qa-20261115/evidence/site-native-lang-A-20261115')
base = Path('/home/ubuntu/tadazz-unified-site-20261115-31b3cb0/web')
manifest = json.loads((root / 'fixed-artifact.json').read_text())
target = root / 'fixed-output/web'
target.mkdir(exist_ok=False)
rows = []
for name, expected in manifest['after'].items():
    source = root / 'fixed-output/files' / name if name in manifest['payload'] else base / name
    data = source.read_bytes()
    assert len(data) == expected['bytes'] and hashlib.sha256(data).hexdigest() == expected['sha256'], name
    destination = target / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    os.link(source, destination)
    assert source.stat().st_ino == destination.stat().st_ino
    rows.append({'path': name, 'source': str(source), 'inode': destination.stat().st_ino, **expected})
(root / 'fixed-output/custody.json').write_text(json.dumps(rows, indent=2))
print(json.dumps({'files': len(rows), 'changed': manifest['payload'], 'payloadBytes': manifest['bytes']}))
