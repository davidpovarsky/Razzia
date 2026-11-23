"""Trace native content to existing Git refs/reference snapshots without fetching or editing."""
from pathlib import Path
from datetime import datetime, timezone
import base64
import hashlib
import json
import subprocess

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
OUT = Path(__file__).resolve().parent
REPORT = OUT / 'observation.json'
assert not REPORT.exists()
def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)
def sha(body):
    return hashlib.sha256(body).hexdigest()
head = git('rev-parse', 'HEAD').decode().strip()
prior_path = ROOT / 'docs/extensions/qa-evidence/show-library-schema-20261115/native-asset-provenance-20261115/observation.json'
prior_body = prior_path.read_bytes()
prior = json.loads(prior_body)
native = prior['observedFiles']
blobs = {row['git']['blob'] for row in native}
native_paths = {row['path'] for row in native}
refs = ['refs/tags/4.0.1', 'refs/remotes/upstream/main']
ref_commits = {ref: git('rev-parse', ref + '^{commit}').decode().strip() for ref in refs}
ref_commits['HEAD-observed'] = head
observations = []
for ref, commit in ref_commits.items():
    raw = git('ls-tree', '-rz', '--full-tree', commit)
    matches, raw_matches = [], []
    for row in raw.split(b'\0'):
        if not row:
            continue
        header, path = row.split(b'\t', 1)
        mode, kind, blob = header.decode().split()
        if kind != 'blob' or blob not in blobs:
            continue
        raw_matches.append(row + b'\0')
        matches.append({'path': path.decode(), 'blob': blob, 'mode': mode})
    observations.append({'ref': ref, 'commit': commit, 'treeCommand': ['git', 'ls-tree', '-rz', '--full-tree', commit], 'fullTreeBytes': len(raw), 'fullTreeSha256': sha(raw), 'matchedRowsBase64': base64.b64encode(b''.join(raw_matches)).decode(), 'matches': matches})
current = next(row for row in observations if row['ref'] == 'HEAD-observed')
assert all(any(item['path'] == row['path'] and item['blob'] == row['git']['blob'] for item in current['matches']) for row in native)
reference_prefix = 'docs/extensions/references/user-20261106/extracted/'
reference_manifest_path = reference_prefix + 'manifest.json'
reference_manifest_body = git('show', head + ':' + reference_manifest_path)
reference_manifest = json.loads(reference_manifest_body)
reference_by_name = {item['name']: item for item in reference_manifest}
crosswalk = []
content_bodies = {}
for row in native:
    blob = row['git']['blob']
    matches = [{'ref': tree['ref'], 'commit': tree['commit'], **item} for tree in observations for item in tree['matches'] if item['blob'] == blob and not (tree['ref'] == 'HEAD-observed' and item['path'] == row['path'])]
    reference_matches = [item for item in matches if item['ref'] == 'HEAD-observed' and item['path'].startswith(reference_prefix)]
    version_matches = [item for item in matches if item['ref'] == 'refs/tags/4.0.1']
    if reference_matches or version_matches:
        body = git('cat-file', 'blob', blob)
        assert len(body) == row['bytes'] and sha(body) == row['sha256']
        content_bodies[blob] = {'bytes': len(body), 'sha256': sha(body)}
    for item in reference_matches:
        entry = reference_by_name[item['path'].removeprefix(reference_prefix)]
        assert (entry['size'], entry['sha256']) == (row['bytes'], row['sha256'])
    crosswalk.append({'nativePath': row['path'], 'url': row['url'], 'bytes': row['bytes'], 'sha256': row['sha256'], 'gitBlob': blob, 'declaredReferences': row['declaredReferences'],
        'existingGitMatches': matches, 'matchesLocalVersionTag': bool(version_matches), 'matchesArchivedReferenceManifest': bool(reference_matches), 'rightsGrantedByThisMatch': False})
tag_license = git('show', ref_commits['refs/tags/4.0.1'] + ':LICENSE')
head_license = git('show', head + ':LICENSE')
assert head == git('rev-parse', 'HEAD').decode().strip()
assert all(commit == git('rev-parse', ref + '^{commit}').decode().strip() for ref, commit in ref_commits.items() if ref != 'HEAD-observed')
report = {'capturedUtc': datetime.now(timezone.utc).isoformat(), 'kind': 'EXISTING_LOCAL_GIT_CONTENT_CROSSWALK_NOT_RIGHTS_AUTHORIZATION', 'sourceCommit': head,
    'priorNativeObservationSha256': sha(prior_body), 'trees': observations, 'crosswalk': crosswalk, 'matchedContentReadback': content_bodies,
    'referenceManifest': {'path': reference_manifest_path, 'bytes': len(reference_manifest_body), 'sha256': sha(reference_manifest_body), 'bodyBase64': base64.b64encode(reference_manifest_body).decode()},
    'versionTagLicense': {'bytes': len(tag_license), 'sha256': sha(tag_license), 'sameAsCurrentRootNotice': tag_license == head_license, 'tagObjectType': git('cat-file', '-t', 'refs/tags/4.0.1').decode().strip()},
    'counts': {'nativeFiles': len(crosswalk), 'matchingLocalVersionTag': sum(row['matchesLocalVersionTag'] for row in crosswalk), 'matchingArchivedReferenceManifest': sum(row['matchesArchivedReferenceManifest'] for row in crosswalk), 'neitherSourceMatch': sum(not row['matchesLocalVersionTag'] and not row['matchesArchivedReferenceManifest'] for row in crosswalk), 'additionalCurrentTreePaths': sum(item['path'] not in native_paths for item in current['matches'])},
    'localRefsUnchangedDuringObservation': True, 'remoteFreshnessOrTagSignatureVerified': False, 'originalReferenceArchiveOrUploaderAuthorityVerified': False,
    'sourceChanges': 0, 'fetches': 0, 'networkRequests': 0, 'testsRerun': 0, 'newRightsOrRuntimeAuthority': False}
REPORT.write_bytes((json.dumps(report, indent=2) + '\n').encode())
print(json.dumps(report['counts']))
