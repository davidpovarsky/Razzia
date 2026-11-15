"""Read-only retained-index/CAFS observation; JSON inputs arrive via env-free stdin.

Run by piping decoder source + this source, followed by a literal input assignment.
No cache repair, extraction, installation, database writes, or remote output files.
"""
import hashlib
import os
import sqlite3
import stat
from datetime import datetime, timezone


def collect(inputs):
    store = '/home/ubuntu/tadazz-hq-qa-20261115/fixtures/sb-metadata-f9eaba0259c24a98394d4b61aa783e24c39beff1ca801c24c573d88852c96bf0/pnpm-store/v11'
    database = store + '/index.db'

    def read_file(path):
        before = os.stat(path, follow_symlinks=False)
        assert stat.S_ISREG(before.st_mode), path
        with open(path, 'rb') as handle:
            body = handle.read()
        after = os.stat(path, follow_symlinks=False)
        assert (before.st_ino, before.st_size, before.st_mtime_ns) == (after.st_ino, after.st_size, after.st_mtime_ns)
        return body, {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(),
                      'sha512': hashlib.sha512(body).hexdigest(), 'mode': stat.S_IMODE(after.st_mode)}

    for suffix in ['-wal', '-shm', '-journal']:
        assert not os.path.exists(database + suffix), suffix
    _, before = read_file(database)
    connection = sqlite3.connect('file:' + database + '?mode=ro&immutable=1', uri=True)
    connection.execute('PRAGMA query_only=ON')
    packages = []
    requested = inputs['moduleFiles']
    assert len(requested) == 106
    keys = sorted(set(row['packageResolutionKey'] for row in requested))
    assert keys == ['i18next@26.4.3', 'react-dom@19.3.0', 'react@19.3.0', 'scheduler@0.28.0', 'zod@4.6.6']
    for key in keys:
        rows = connection.execute('select key,data from package_index where substr(key,instr(key,char(9))+1)=?', (key,)).fetchall()
        assert len(rows) == 1, key
        index_key, raw = rows[0]
        data = RecordDecoder(raw).decode()
        assert data['algo'] == 'sha512'
        aliases = connection.execute('select key,target from package_index_alias where substr(key,instr(key,char(9))+1)=?', (key,)).fetchall()
        assert [data['tarIntegrity'] + '\t' + key, index_key] in [list(row) for row in aliases]
        paths = {row['packagePath'] for row in requested if row['packageResolutionKey'] == key}
        assert paths <= data['files'].keys()
        license_paths = {p for p in data['files'] if 'license' in p.lower() or 'notice' in p.lower()}
        extra_paths = license_paths | {'package.json'}
        files = []
        for path in sorted(paths | extra_paths):
            row = data['files'][path]
            digest = row['digest']
            assert len(digest) == 128 and all(c in '0123456789abcdef' for c in digest)
            physical = store + '/files/' + digest[:2] + '/' + digest[2:] + ('-exec' if row['mode'] & 0o111 else '')
            body, observed = read_file(physical)
            assert observed['sha512'] == digest and observed['bytes'] == row['size'], (key, path)
            item = {'packagePath': path, 'physicalPath': physical, 'originalIndexRow': row,
                    'observed': observed, 'module': path in paths}
            if path in extra_paths:
                item['bodyBase64'] = base64.b64encode(body).decode()
            if path == 'package.json':
                metadata = json.loads(body)
                assert metadata['name'] + '@' + metadata['version'] == key
                item['declaredLicense'] = metadata.get('license')
            files.append(item)
        packages.append({'package': key, 'indexKey': index_key, 'indexBlobSha256': hashlib.sha256(raw).hexdigest(),
                         'indexBlobBase64': base64.b64encode(raw).decode(), 'aliases': aliases,
                         'tarIntegrity': data['tarIntegrity'], 'files': files})
    connection.close()
    _, after = read_file(database)
    assert before == after, 'index changed during observation'
    return {'status': 'OBSERVED_CAFS_MEMBERSHIP_NOT_EXECUTABLE_AUTHORITY',
            'capturedUtc': datetime.now(timezone.utc).isoformat(), 'database': database,
            'databaseBefore': before, 'databaseAfter': after, 'packages': packages,
            'moduleCount': sum(file['module'] for package in packages for file in package['files']),
            'physicalBuildCacheBinding': 'UNPROVEN_REQUIRE_EXACT_DD3_BUILD_MOUNT_PROVENANCE',
            'imageRights': 'UNKNOWN', 'trustedReceiptsInstalled': False,
            'remoteFilesWritten': 0, 'tarballExtractionOrSignatureProof': False}
