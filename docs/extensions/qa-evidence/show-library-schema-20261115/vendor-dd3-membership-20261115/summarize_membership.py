"""Join observed CAFS bytes to exact dd3 lock and graph; no authority registration."""
import base64
import hashlib
import json
import re
import subprocess
from pathlib import Path

from decode_index import RecordDecoder

root = Path(__file__).resolve().parent
prior = root.parent / 'actual-dd3-data-20261115'
observation = json.loads((root / 'observed-membership.json').read_text(encoding='utf-8-sig'))
graph = json.loads((prior / 'module-source-map.json').read_text())
commit = 'dd3cd1347981ac6fd934f90d870ff57bba82d470'
lock = subprocess.check_output(['git', 'show', commit + ':pnpm-lock.yaml'])
lock_sha = hashlib.sha256(lock).hexdigest()
assert lock_sha == 'f2e3f2183bc308e7e113a23f2ae901d98aade9a173c6b16019d014072684b9a0'
assert observation['databaseBefore'] == observation['databaseAfter']
sources, packages = [], []
for package in observation['packages']:
    key = package['package']
    locked = re.search(rb'^  ' + re.escape(key.encode()) + rb':\r?\n    resolution: \{integrity: ([^}]+)\}', lock, re.M)
    assert locked
    integrity = locked[1].decode()
    assert package['indexKey'] == integrity + '\t' + key
    blob = base64.b64decode(package['indexBlobBase64'], validate=True)
    assert hashlib.sha256(blob).hexdigest() == package['indexBlobSha256']
    decoded = RecordDecoder(blob).decode()
    assert decoded['tarIntegrity'] == package['tarIntegrity']
    name, version = key.rsplit('@', 1)
    files = {item['packagePath']: item for item in package['files']}
    modules = [m for m in graph['modules'] if m.get('packageResolutionKey') == key]
    assert len(modules) == sum(item['module'] for item in files.values())
    for item in files.values():
        path, original, observed = item['packagePath'], item['originalIndexRow'], item['observed']
        assert original == decoded['files'][path]
        assert original['digest'] == observed['sha512'] and original['size'] == observed['bytes']
        if 'bodyBase64' in item:
            body = base64.b64decode(item['bodyBase64'], validate=True)
            assert hashlib.sha256(body).hexdigest() == observed['sha256']
            assert hashlib.sha512(body).hexdigest() == observed['sha512']
        sources.append({'kind': 'pnpm-package-file', 'packageName': name,
                        'packageVersion': version, 'lockfilePath': 'pnpm-lock.yaml',
                        'lockfileSha256': lock_sha, 'snapshotKey': key,
                        'resolutionIntegrity': integrity, 'packagePath': path,
                        'bytes': observed['bytes'], 'sha256': observed['sha256']})
    for module in modules:
        path = module['packagePath']
        assert files[path]['module']
    metadata = json.loads(base64.b64decode(files['package.json']['bodyBase64']))
    packages.append({'key': key, 'lockedIntegrity': integrity,
                     'observedTarIntegrity': package['tarIntegrity'],
                     'aliasTargetMatchesLockedIndex': True,
                     'moduleFiles': len(modules), 'observedFiles': len(files),
                     'declaredLicense': metadata.get('license'),
                     'licenseFiles': [p for p in files if 'license' in p.lower() or 'notice' in p.lower()]})
assert len(sources) == 116 and sum(p['moduleFiles'] for p in packages) == 106
(root / 'package-sources.candidate.json').write_text(json.dumps(sources, indent=2) + '\n')
summary = {'status': 'PASS_READ_ONLY_OBSERVATION', 'moduleFiles': 106,
           'additionalPackageMetadataAndLicenses': 10, 'packageSources': len(sources),
           'sourceCommit': commit, 'lockfileSha256': lock_sha, 'packages': packages,
           'indexUnchanged': True, 'remoteFilesWritten': 0,
           'rawBytesVerifiedBySha512AndSize': True,
           'physicalBuildCacheBinding': observation['physicalBuildCacheBinding'],
           'trustedStoreReceiptsInstalled': False, 'imageRights': 'UNKNOWN',
           'executableAcceptance': False, 'compiledPins': [], 'c35Rerun': False}
(root / 'SUMMARY.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary))
