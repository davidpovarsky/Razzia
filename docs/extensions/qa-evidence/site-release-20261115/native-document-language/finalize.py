import hashlib
import json
import subprocess
from pathlib import Path

root = Path('/home/ubuntu/tadazz-hq-qa-20261115/evidence/site-native-lang-A-20261115')
source = Path('/home/ubuntu/tadazz-hq-qa-20261115/source/site-validation-9b221bc0edabe449cdf27bc818ae77acbc676bae')
original = json.loads((root / 'source-before.json').read_text())
mismatches = [name for name, row in original.items() if hashlib.sha256((source / name).read_bytes()).hexdigest() != row['sha256']]
assert not mismatches, mismatches
manifest = json.loads((root / 'fixed-artifact.json').read_text())
for relative, row in manifest['before'].items():
    file = Path('/home/ubuntu/tadazz-unified-site-20261115-31b3cb0/web') / relative
    assert hashlib.sha256(file.read_bytes()).hexdigest() == row['sha256'], relative
for relative, row in manifest['after'].items():
    assert hashlib.sha256((root / 'fixed-output/web' / relative).read_bytes()).hexdigest() == row['sha256'], relative
names = ['tadazz-site-native-lang-' + suffix + '-A-20261115' for suffix in ['app', 'baseline-browser', 'build', 'fixed-app', 'fixed-browser', 'spec', 'spec2']]
rows = json.loads(subprocess.check_output(['docker', 'inspect', '--size', *names]))
fixtures = [{'name': row['Name'], 'id': row['Id'], 'state': row['State'], 'sizeRw': row['SizeRw'], 'logBytes': Path(row['LogPath']).stat().st_size} for row in rows]
assert all(row['state']['Pid'] == 0 and not row['state']['Running'] and not row['state']['OOMKilled'] for row in fixtures)
protected = json.loads(subprocess.check_output(['docker', 'inspect', 'tadazz', 'tadazz-phone-gateway', '505772e38a7c', '701c07ef1fab', '06144b291083']))
protected = [{'id': row['Id'], 'state': row['State'], 'image': row['Image']} for row in protected]
assert all(row['state']['Running'] for row in protected)
unique = {}
for file in root.rglob('*'):
    if file.is_file() and not file.is_symlink() and 'fixed-output/web' not in str(file):
        stat = file.stat()
        unique[(stat.st_dev, stat.st_ino)] = stat.st_blocks * 512
disk = sum(unique.values()) + sum(row['sizeRw'] + row['logBytes'] for row in fixtures)
result = {'sourceFiles': len(original), 'sourceMismatches': mismatches, 'oldArtifactFilesUnchanged': len(manifest['before']), 'fixedArtifactFilesVerified': len(manifest['after']), 'fixtures': fixtures, 'protected': protected, 'newDataAndWritableLayerBytes': disk, 'note': '150 old artifact body hardlinks and two payload hardlinks excluded from duplicate data accounting; original bodies hashed unchanged. Directory/container metadata reserved separately.', 'availableBytes': subprocess.check_output(['df', '-B1', '--output=avail', '/']).decode().strip()}
(root / 'final-readback.json').write_text(json.dumps(result, indent=2))
print(json.dumps({'sourceFiles': len(original), 'fixturesStopped': len(fixtures), 'newDataAndWritableLayerBytes': disk}))
