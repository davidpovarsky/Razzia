#!/usr/bin/env python3
"""Install only the two reviewed QA overlay files into the exact 1ec checkout."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess

HEAD = '1ec7dc5c9549651f1618390a21f8db7efae4ea6f'
TREE = '4343a6217310a6d0b5977dcc4f9ad3bbc18ed341'
TEST = 'packages/e2e/tests/tadazz-full-show-parity.spec.ts'
HELPER = 'packages/e2e/utils/tadazz-show-diagnostic.ts'
ORIGINAL_TEST = {'bytes': 46709, 'sha256': '939781dfc87760952af537b46a8495429bacfd051a20f01ad2b811340d2f54bc'}
EXPECTED_BUNDLE_FILES = {
    'verify-overlay.CLOSED.py', 'process-capture.CLOSED.py', 'run-original-cases.sh',
    'overlay-manifest.CLOSED.json', 'overlay/' + TEST, 'overlay/' + HELPER}
EXPECTED_INPUTS = {
    '.github/workflows/ci.yml', '.github/actions/setup/action.yml', 'scripts/qa/ci-e2e-routing.py',
    'packages/e2e/playwright.config.ts', 'packages/e2e/playwright.tadazz-show.config.ts',
    'packages/e2e/package.json', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml',
    'packages/e2e/ci-case-routing.json', 'packages/e2e/utils/constants.ts',
    'extensions/site.vite.config.ts', TEST}


def require(value, reason):
    if not value:
        raise AssertionError(reason)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(raw):
    return {'bytes': len(raw), 'sha256': digest(raw)}


def checked_pin(value):
    require(isinstance(value, dict) and set(value) == {'bytes', 'sha256'}, 'EXACT_BYTE_PIN_REQUIRED')
    require(type(value['bytes']) is int and value['bytes'] >= 0 and
            isinstance(value['sha256'], str) and re.fullmatch('[0-9a-f]{64}', value['sha256']),
            'INVALID_BYTE_PIN')
    return value


def under(root, relative):
    value = PurePosixPath(relative)
    require(isinstance(relative, str) and str(value) == relative and not value.is_absolute() and
            value.parts and all(part not in {'.', '..'} for part in value.parts) and '\\' not in relative,
            'UNSAFE_RELATIVE_PATH')
    path = root.joinpath(*value.parts)
    current = root
    for part in value.parts:
        current = current / part
        require(not current.is_symlink(), 'SYMLINK_NOT_ALLOWED:' + relative)
    require(path.resolve(strict=False).is_relative_to(root), 'OUTSIDE_OWNED_ROOT')
    return path


def read(root, relative, expected):
    path = under(root, relative)
    info = path.stat()
    raw = path.read_bytes()
    require(stat.S_ISREG(info.st_mode) and pin(raw) == checked_pin(expected),
            'SOURCE_PIN_CHANGED:' + relative)
    return raw


def write_new(path, raw):
    with path.open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    require(path.read_bytes() == raw, 'WRITE_READBACK_CHANGED')


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()


def git(root, *arguments):
    process = subprocess.run(['git', '-C', str(root), *arguments], capture_output=True, check=True)
    return process.stdout.decode().strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['install', 'verify-after'])
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--manifest-sha256', required=True)
    args = parser.parse_args()
    root = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    require(Path.cwd().resolve() == root, 'APP_WORKSPACE_REQUIRED')
    bundle = root / 'diagnostic-source/diagnostics/tadazz-show'
    require(bundle.resolve(strict=True) == bundle and not bundle.is_symlink(), 'EXACT_BUNDLE_ROOT_REQUIRED')
    manifest_path = Path(args.manifest)
    require(manifest_path == bundle / 'bundle-manifest.CLOSED.json', 'EXACT_MANIFEST_PATH_REQUIRED')
    require(re.fullmatch('[0-9a-f]{64}', args.manifest_sha256), 'FINAL_BUNDLE_PIN_REQUIRED')
    require(not manifest_path.is_symlink(), 'MANIFEST_SYMLINK')
    manifest_raw = manifest_path.read_bytes()
    require(digest(manifest_raw) == args.manifest_sha256, 'BUNDLE_MANIFEST_CHANGED')
    value = json.loads(manifest_raw)
    require(set(value) == {'schemaVersion', 'kind', 'application', 'diagnosticOnly', 'ciQualification',
                           'bundleFiles', 'originalInputs', 'overlay'}, 'BUNDLE_SCHEMA_CHANGED')
    require(value['schemaVersion'] == 1 and value['kind'] == 'ONE_1EC_SHOW_DIAGNOSTIC_SOURCE_BUNDLE' and
            value['diagnosticOnly'] is True and value['ciQualification'] is False and
            value['application'] == {'head': HEAD, 'tree': TREE}, 'BUNDLE_IDENTITY_CHANGED')
    require(set(value['bundleFiles']) == EXPECTED_BUNDLE_FILES, 'EXACT_SIX_BUNDLE_FILES_REQUIRED')
    require(set(value['originalInputs']) == EXPECTED_INPUTS, 'EXACT_ORIGINAL_INPUT_SET_REQUIRED')
    require(set(value['overlay']) == {TEST, HELPER}, 'EXACT_TWO_OVERLAY_FILES_REQUIRED')
    raw_files = {name: read(bundle, name, expected) for name, expected in value['bundleFiles'].items()}
    require(Path(__file__).resolve() == bundle / 'verify-overlay.CLOSED.py', 'OWN_BUNDLE_INSTALLER_REQUIRED')
    original_overlay = json.loads(raw_files['overlay-manifest.CLOSED.json'])
    require(set(original_overlay['files']) == {TEST, HELPER}, 'OBSERVER_MANIFEST_FILE_SET_CHANGED')
    for relative, entry in value['overlay'].items():
        require(set(entry) == {'original', 'replacement'}, 'OVERLAY_ENTRY_SCHEMA_CHANGED')
        require(entry['original'] == (ORIGINAL_TEST if relative == TEST else None), 'OVERLAY_ORIGINAL_CHANGED')
        checked_pin(entry['replacement'])
        require(value['bundleFiles']['overlay/' + relative] == entry['replacement'], 'OVERLAY_PIN_NOT_CROSSLINKED')
        require(original_overlay['files'][relative] ==
                {'original': entry['original'], 'overlay': entry['replacement']},
                'ORIGINAL_OBSERVER_MANIFEST_CHANGED')
    require(value['originalInputs'][TEST] == ORIGINAL_TEST, 'ORIGINAL_TEST_PIN_CHANGED')
    require(git(root, 'rev-parse', 'HEAD') == HEAD and git(root, 'rev-parse', 'HEAD^{tree}') == TREE,
            'APPLICATION_CHECKOUT_CHANGED')
    diagnostic_commit = os.environ.get('DIAGNOSTIC_COMMIT', '')
    require(re.fullmatch('[0-9a-f]{40}', diagnostic_commit) and
            diagnostic_commit == os.environ.get('GITHUB_SHA'), 'EXACT_DISPATCH_COMMIT_REQUIRED')
    require(git(root / 'diagnostic-source', 'rev-parse', 'HEAD') == diagnostic_commit,
            'DIAGNOSTIC_OVERLAY_CHECKOUT_CHANGED')
    evidence = under(root, 'work/ci-e2e/tadazz-show/diagnostic/source')
    require(Path(os.environ['TADAZZ_SHOW_DIAGNOSTIC_DIR']) ==
            root / 'work/ci-e2e/tadazz-show/diagnostic', 'DIAGNOSTIC_PATH_CHANGED')
    for relative, expected in value['originalInputs'].items():
        if relative != TEST:
            read(root, relative, expected)
    if args.mode == 'install':
        require(not evidence.exists() and not evidence.is_symlink(), 'FRESH_SOURCE_EVIDENCE_REQUIRED')
        require(git(root, 'status', '--porcelain', '--untracked-files=no') == '', 'INITIAL_TRACKED_SOURCE_DIRTY')
        read(root, TEST, ORIGINAL_TEST)
        require(not under(root, HELPER).exists(), 'NEW_OBSERVER_PATH_ALREADY_EXISTS')
        evidence.mkdir(parents=True, mode=0o700)
        require(evidence.resolve() == evidence, 'EVIDENCE_SYMLINK')
        write_new(evidence / 'original-test.spec.ts', under(root, TEST).read_bytes())
        write_new(evidence / 'bundle-manifest.CLOSED.json', manifest_raw)
        write_new(evidence / 'observer-manifest.CLOSED.json', raw_files['overlay-manifest.CLOSED.json'])
        for relative in [HELPER, TEST]:
            path = under(root, relative)
            raw = raw_files['overlay/' + relative]
            if relative == TEST:
                require(pin(path.read_bytes()) == ORIGINAL_TEST, 'ORIGINAL_TEST_CHANGED_BEFORE_REPLACEMENT')
                mode = stat.S_IMODE(path.stat().st_mode)
                with path.open('wb') as stream:
                    stream.write(raw)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.chmod(path, mode)
            else:
                write_new(path, raw)
            require(pin(path.read_bytes()) == value['overlay'][relative]['replacement'], 'OVERLAY_READBACK_CHANGED')
        write_new(evidence / 'installation.json', encoded({
            'diagnosticOnly': True, 'ciQualification': False, 'application': value['application'],
            'diagnosticCommit': diagnostic_commit, 'manifestSha256': args.manifest_sha256,
            'overlay': value['overlay'], 'applicationFilesChanged': False,
            'testActionsAssertionsTimeoutsChanged': False}))
    else:
        require(evidence.is_dir() and evidence.resolve() == evidence, 'SOURCE_INSTALLATION_EVIDENCE_MISSING')
        require((evidence / 'bundle-manifest.CLOSED.json').read_bytes() == manifest_raw, 'INSTALLED_MANIFEST_CHANGED')
        require(pin((evidence / 'original-test.spec.ts').read_bytes()) == ORIGINAL_TEST, 'ORIGINAL_TEST_EVIDENCE_CHANGED')
        for relative, entry in value['overlay'].items():
            read(root, relative, entry['replacement'])
        require(git(root, 'diff', '--name-only') == TEST and git(root, 'diff', '--cached', '--name-only') == '',
                'UNEXPECTED_TRACKED_SOURCE_CHANGE')
        write_new(evidence / 'after.json', encoded({
            'diagnosticOnly': True, 'ciQualification': False, 'application': value['application'],
            'diagnosticCommit': diagnostic_commit, 'manifestSha256': args.manifest_sha256,
            'originalNonOverlayInputsUnchanged': True, 'exactTwoOverlayFilesVerified': True}))
    print(json.dumps({'mode': args.mode, 'diagnosticOnly': True, 'ciQualification': False,
                      'manifestSha256': args.manifest_sha256}, sort_keys=True))


if __name__ == '__main__':
    main()
