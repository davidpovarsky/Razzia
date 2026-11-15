"""Verify one exact local font index row and all 24 installed/CAFS files, read-only."""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
import base64
import hashlib
import json
import os
import runpy
import sqlite3
import subprocess

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
OUT = Path(__file__).resolve().parent
REPORT = OUT / 'observation.json'
assert not REPORT.exists()
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
prior_path = ROOT / 'docs/extensions/qa-evidence/show-library-schema-20261115/native-asset-provenance-20261115/rubik-observation.json'
prior_body = prior_path.read_bytes()
prior = json.loads(prior_body)
modules_path = ROOT / 'node_modules/.modules.yaml'
modules_body = modules_path.read_bytes()
modules = json.loads(modules_body)
store = Path(modules['storeDir']).resolve()
assert store == Path('C:/Users/DAVID/AppData/Local/pnpm/store/v11').resolve()
database = store / 'index.db'
package = ROOT / 'node_modules/.pnpm/@fontsource-variable+rubik@5.3.0/node_modules/@fontsource-variable/rubik'
decoder_path = ROOT / 'docs/extensions/qa-evidence/show-library-schema-20261115/vendor-dd3-membership-20261115/decode_index.py'
decoder_body = decoder_path.read_bytes()
assert decoder_body == subprocess.check_output(['git', 'show', commit + ':' + decoder_path.relative_to(ROOT).as_posix()], cwd=ROOT)
decoder = runpy.run_path(str(decoder_path))['RecordDecoder']
def snapshot(path):
    before = path.stat()
    body = path.read_bytes()
    after = path.stat()
    assert (before.st_size, before.st_mtime_ns, before.st_ino) == (after.st_size, after.st_mtime_ns, after.st_ino)
    return body, {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'sha512': hashlib.sha512(body).hexdigest(), 'mtimeNs': after.st_mtime_ns, 'inode': after.st_ino}
def sidecars():
    return {suffix: Path(str(database) + suffix).exists() for suffix in ['-wal', '-shm', '-journal']}
sidecars_before = sidecars()
assert not any(sidecars_before.values())
_, db_before = snapshot(database)
connection = sqlite3.connect(database.as_uri() + '?mode=ro&immutable=1', uri=True)
connection.execute('PRAGMA query_only=ON')
schema = connection.execute("SELECT name,sql FROM sqlite_master WHERE type='table'").fetchall()
index_key = prior['declaredLockIntegrity'] + '\t@fontsource-variable/rubik@5.3.0'
rows = connection.execute('SELECT key,data FROM package_index WHERE key=?', (index_key,)).fetchall()
assert len(rows) == 1
key, raw = rows[0]
record = decoder(raw).decode()
assert record['algo'] == 'sha512'
assert record['manifest'] == {'name': '@fontsource-variable/rubik', 'version': '5.3.0'}
files = []
file_snapshots = {}
for name, metadata in sorted(record['files'].items()):
    relative = PurePosixPath(name)
    assert not relative.is_absolute() and '..' not in relative.parts
    expected = metadata['digest']
    assert len(expected) == 128 and all(char in '0123456789abcdef' for char in expected)
    cafs_path = store / 'files' / expected[:2] / (expected[2:] + ('-exec' if metadata['mode'] & 0o111 else ''))
    installed_path = (package / name).resolve()
    assert installed_path.is_relative_to(package.resolve())
    cafs_body, cafs = snapshot(cafs_path)
    installed_body, installed = snapshot(installed_path)
    assert len(cafs_body) == metadata['size'] and cafs['sha512'] == expected
    assert installed_body == cafs_body
    file_snapshots[str(cafs_path)] = cafs
    file_snapshots[str(installed_path)] = installed
    files.append({'packagePath': name, 'originalIndexRow': metadata, 'cafsPath': str(cafs_path), 'installedPath': str(installed_path), 'cafs': cafs, 'installed': installed, 'sameFile': os.path.samefile(cafs_path, installed_path), 'installedEqualsCafs': True})
connection.close()
_, db_after = snapshot(database)
sidecars_after = sidecars()
assert db_before == db_after and sidecars_before == sidecars_after
assert all(snapshot(Path(path))[1] == value for path, value in file_snapshots.items())
assert modules_path.read_bytes() == modules_body and decoder_path.read_bytes() == decoder_body
prior_matches = []
for item in prior['sourceInputs'] + prior['fonts']:
    name = item['packagePath'].removeprefix('./')
    entry = next(entry for entry in files if entry['packagePath'] == name)
    assert item['bytes'] == entry['installed']['bytes'] and item['sha256'] == entry['installed']['sha256']
    prior_matches.append(name)
metadata_file = next(entry for entry in files if entry['packagePath'] == 'package.json')
installed_metadata = json.loads(Path(metadata_file['installedPath']).read_bytes())
assert installed_metadata['name'] == record['manifest']['name'] and installed_metadata['version'] == record['manifest']['version']
report = {'status': 'OBSERVED_LOCAL_FONT_CAFS_MEMBERSHIP_NOT_RUNTIME_AUTHORITY', 'capturedUtc': datetime.now(timezone.utc).isoformat(), 'sourceCommit': commit,
    'database': str(database), 'databaseBefore': db_before, 'databaseAfter': db_after, 'sidecarsBefore': sidecars_before, 'sidecarsAfter': sidecars_after,
    'sqliteOpen': {'mode': 'ro', 'immutable': True, 'queryOnly': True}, 'sqliteSchema': schema,
    'modulesMetadata': {'path': str(modules_path), 'bytes': len(modules_body), 'sha256': hashlib.sha256(modules_body).hexdigest(), 'format': 'JSON', 'fields': {name: modules.get(name) for name in ['storeDir', 'virtualStoreDir', 'packageManager', 'layoutVersion', 'nodeLinker']}, 'historicalInstallInvocationProven': False},
    'decoder': {'path': str(decoder_path), 'sha256': hashlib.sha256(decoder_body).hexdigest(), 'matchesGit': True},
    'indexKey': key, 'indexBlobBytes': len(raw), 'indexBlobSha256': hashlib.sha256(raw).hexdigest(), 'indexBlobBase64': base64.b64encode(raw).decode(), 'decodedIndex': record,
    'files': files, 'packageFileCount': len(files), 'sameFileCount': sum(entry['sameFile'] for entry in files), 'priorFontObservationSha256': hashlib.sha256(prior_body).hexdigest(), 'priorUsedFontAndMetadataMatches': prior_matches,
    'declaredLicense': installed_metadata.get('license'), 'allInputsUnchanged': True,
    'tarballBytesOrSignatureVerified': False, 'historicalRendererBuildCacheBindingVerified': False,
    'extendsOracleFivePackageGraphReceipt': False, 'trustedReceiptsInstalled': False, 'executionOrExportAuthorized': False,
    'networkRequests': 0, 'storeWrites': 0, 'newInstalls': 0, 'remoteJobs': 0}
REPORT.write_bytes((json.dumps(report, indent=2) + '\n').encode())
print(json.dumps({'status': report['status'], 'packageFileCount': len(files), 'priorUsedFontAndMetadataMatches': len(prior_matches), 'sameFileCount': report['sameFileCount'], 'databaseUnchanged': db_before == db_after, 'allInputsUnchanged': True, 'declaredLicense': report['declaredLicense']}))
