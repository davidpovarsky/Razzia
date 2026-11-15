"""Bounded read-only observation of exactly named retained dd3 inputs/outputs."""
import hashlib
import json
import os
import stat
from datetime import datetime, timezone


def verify(inputs):
    baseline = '/home/ubuntu/tadazz-hq-qa-20261115/source/sb-metadata-f9eaba0259c24a98394d4b61aa783e24c39beff1ca801c24c573d88852c96bf0'
    view = '/home/ubuntu/tadazz-hq-qa-20261115/source/show-ui-dc76-view'
    required = inputs['allowlist']['moduleFiles']
    assert len(required) == 106

    def observe(path):
        before = os.stat(path, follow_symlinks=False)
        assert stat.S_ISREG(before.st_mode), path
        with open(path, 'rb') as handle:
            body = handle.read()
        after = os.stat(path, follow_symlinks=False)
        assert (before.st_ino, before.st_size, before.st_mtime_ns) == (after.st_ino, after.st_size, after.st_mtime_ns), path
        return {'physicalPath': path, 'realPath': os.path.realpath(path), 'bytes': len(body),
                'sha256': hashlib.sha256(body).hexdigest(), 'sha512': hashlib.sha512(body).hexdigest(),
                'mode': stat.S_IMODE(after.st_mode), 'device': after.st_dev, 'inode': after.st_ino}

    packages = []
    for package in inputs['membership']['packages']:
        modules = [item for item in required if item['packageResolutionKey'] == package['package']]
        roots = {item['buildNamespaceRelativePath'][:-len(item['packagePath']) - 1] for item in modules}
        assert len(roots) == 1
        package_root = baseline + '/' + roots.pop()
        for item in package['files']:
            path = package_root + '/' + item['packagePath']
            current = observe(path)
            expected = item['observed']
            assert current['bytes'] == expected['bytes'] and current['sha256'] == expected['sha256'] and current['sha512'] == expected['sha512'], (package['package'], item['packagePath'])
            packages.append({'package': package['package'], 'packagePath': item['packagePath'],
                             'module': item['module'], 'observed': current,
                             'cafsPath': item['physicalPath'], 'sameFileAsCafs': os.path.samefile(path, item['physicalPath'])})
    assert len(packages) == 116
    sources = []
    for expected in inputs['tracked']:
        path = view + '/' + expected['path']
        try:
            current = observe(path)
            sources.append({'path': expected['path'], 'observed': current,
                            'expectedGitSource': expected, 'matchesDd3': current['sha256'] == expected['sha256']})
        except OSError as error:
            sources.append({'path': expected['path'], 'matchesDd3': False, 'error': str(error), 'expectedGitSource': expected})
    assets = []
    expected_files = {item['path']: item for item in inputs['artifacts']['observedEightFiles']}
    for binding in inputs['artifacts']['physicalPathBindings']:
        expected = expected_files[binding['artifactPath']]
        for kind in ['fixturePath', 'emittedPath']:
            path = binding.get(kind)
            if path is None:
                continue
            current = observe(path)
            assert current['sha256'] == expected['sha256'] and current['bytes'] == expected['bytes'], path
            assets.append({'artifactPath': binding['artifactPath'], 'binding': kind, 'observed': current})
    capacity = os.statvfs('/home/ubuntu')
    return {'capturedUtc': datetime.now(timezone.utc).isoformat(), 'packages': packages,
            'trackedSourceObservations': sources, 'artifacts': assets,
            'packageModuleCount': sum(item['module'] for item in packages),
            'packageMetadataAndLicenseCount': sum(not item['module'] for item in packages),
            'trackedSourceMatches': sum(item['matchesDd3'] for item in sources),
            'trackedSourceDifferences': [item['path'] for item in sources if not item['matchesDd3']],
            'sameFileAsCafsCount': sum(item['sameFileAsCafs'] for item in packages),
            'freeDiskBytesAfter': capacity.f_bavail * capacity.f_frsize,
            'remoteFilesWritten': 0, 'historicBuildArgv': 'NOT_PROVEN_BY_CURRENT_MOUNTS',
            'imageRights': 'UNKNOWN', 'rendererRef': None, 'executableAcceptance': False}
