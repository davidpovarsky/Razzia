"""Observe exact native asset bytes and embedded Lottie dependencies; grant no rights."""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
from collections import Counter
import base64
import hashlib
import json
import struct
import subprocess

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
OUT = Path(__file__).resolve().parent
REPORT = OUT / 'observation.json'
assert not REPORT.exists(), 'Preserve an existing observation; use a distinct evidence directory'
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
manifest_paths = ['extensions/src/core/show-themes/' + name for name in ['classic.manifest.json', 'razzia.manifest.json']]
notice_paths = ['LICENSE', 'docs/extensions/TADAZZ_AUDIO_REFRESH_LICENSE.md', 'docs/extensions/TADAZZ_REVEAL_SFX_LICENSE.md']
def digest(body):
    return hashlib.sha256(body).hexdigest()
def body_record(path):
    body = (ROOT / path).read_bytes()
    return {'path': path, 'bytes': len(body), 'sha256': digest(body), 'bodyBase64': base64.b64encode(body).decode(), 'matchesGitCommit': body == subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)}
source_inputs = [body_record(path) for path in manifest_paths + notice_paths]
declarations = []
by_url = {}
for source in source_inputs[:2]:
    definition = json.loads(base64.b64decode(source['bodyBase64']))
    for index, asset in enumerate(definition['assets']):
        declarations.append({'manifestPath': source['path'], 'manifestPointer': f'/assets/{index}', 'theme': {'id': definition['id'], 'version': definition['version']}, **asset})
        by_url.setdefault(asset['url'], []).append(declarations[-1])
public = (ROOT / 'packages/web/public').resolve()
paths = []
for url in by_url:
    parsed = PurePosixPath(url)
    assert url.startswith('/') and not url.startswith('//') and '..' not in parsed.parts
    path = (public / url.removeprefix('/')).resolve()
    assert path.is_relative_to(public) and path.is_file()
    paths.append(path.relative_to(ROOT).as_posix())
tree_raw = subprocess.check_output(['git', 'ls-tree', '-rz', '--full-tree', commit, '--', *paths], cwd=ROOT)
tree = {}
for row in tree_raw.split(b'\0'):
    if not row:
        continue
    header, path = row.split(b'\t', 1)
    mode, kind, blob = header.decode().split()
    assert kind == 'blob'
    tree[path.decode()] = {'mode': mode, 'blob': blob}
assert set(tree) == set(paths)
observed = []
media_bodies = {}
before = {}
for url, refs in sorted(by_url.items()):
    path = (public / url.removeprefix('/')).resolve()
    relative = path.relative_to(ROOT).as_posix()
    body = path.read_bytes()
    media_bodies[url] = body
    git_body = subprocess.check_output(['git', 'cat-file', 'blob', tree[relative]['blob']], cwd=ROOT)
    before[relative] = {'bytes': len(body), 'sha256': digest(body), 'mtimeNs': path.stat().st_mtime_ns}
    observed.append({'url': url, 'path': relative, 'git': tree[relative], **before[relative],
        'matchesGitBlob': body == git_body,
        'declaredReferences': [{'theme': ref['theme'], 'assetId': ref['id'], 'declaredBytes': ref['bytes'], 'declaredSha256': ref['sha256']} for ref in refs],
        'allDeclaredHashesAndSizesMatch': all(len(body) == ref['bytes'] and digest(body) == ref['sha256'] for ref in refs)})
lottie = []
for url, refs in sorted(by_url.items()):
    if refs[0]['kind'] != 'lottie':
        continue
    document = json.loads(media_bodies[url])
    inline = []
    external = []
    expressions = []
    def inspect(value, pointer=''):
        if isinstance(value, dict):
            for key, child in value.items():
                child_pointer = pointer + '/' + key.replace('~', '~0').replace('/', '~1')
                if key == 'x' and isinstance(child, str):
                    expressions.append({'pointer': child_pointer, 'bytes': len(child.encode()), 'sha256': digest(child.encode())})
                if isinstance(child, str) and child.startswith(('http://', 'https://', '//')):
                    external.append({'pointer': child_pointer, 'value': child})
                inspect(child, child_pointer)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                inspect(child, pointer + '/' + str(index))
    inspect(document)
    assets = document.get('assets', [])
    ids = [asset['id'] for asset in assets]
    assert len(ids) == len(set(ids))
    for index, asset in enumerate(assets):
        value = asset.get('p')
        if not isinstance(value, str):
            continue
        if not value.startswith('data:'):
            external.append({'pointer': f'/assets/{index}/p', 'value': value, 'base': asset.get('u')})
            continue
        assert value.startswith('data:image/png;base64,')
        body = base64.b64decode(value.split(',', 1)[1], validate=True)
        assert body.startswith(b'\x89PNG\r\n\x1a\n') and body[12:16] == b'IHDR'
        width, height = struct.unpack('>II', body[16:24])
        inline.append({'pointer': f'/assets/{index}/p', 'assetId': asset['id'], 'mime': 'image/png', 'bytes': len(body), 'sha256': digest(body), 'width': width, 'height': height,
            'dimensionsMatchDeclaration': (width, height) == (asset.get('w'), asset.get('h')), 'embeddedFlag': asset.get('e'), 'base': asset.get('u'), 'independentRights': 'UNKNOWN'})
    referenced_ids = []
    def references(value):
        if isinstance(value, dict):
            if 'refId' in value:
                referenced_ids.append(value['refId'])
            for child in value.values():
                references(child)
        elif isinstance(value, list):
            for child in value:
                references(child)
    references(document)
    lottie.append({'url': url, 'sourceSha256': digest(media_bodies[url]), 'assetEntries': len(assets), 'embeddedPngs': inline, 'nonImageAssetEntries': len(assets) - len(inline),
        'assetReferenceCount': len(referenced_ids), 'unresolvedAssetIds': sorted(set(referenced_ids) - set(ids)), 'externalReferences': external,
        'stringExpressionProperties': expressions, 'fontsPresent': 'fonts' in document, 'metadata': document.get('meta'), 'runtimeExecuted': False})
after = {path: {'bytes': (ROOT / path).stat().st_size, 'sha256': digest((ROOT / path).read_bytes()), 'mtimeNs': (ROOT / path).stat().st_mtime_ns} for path in before}
source_unchanged = all((ROOT / entry['path']).read_bytes() == base64.b64decode(entry['bodyBase64']) for entry in source_inputs)
report = {'status': 'READ_ONLY_NATIVE_ASSET_OBSERVATION', 'capturedUtc': datetime.now(timezone.utc).isoformat(), 'sourceCommit': commit,
    'declarations': declarations, 'observedFiles': observed, 'lottie': lottie,
    'counts': {'manifestDeclarations': len(declarations), 'exactIdHashReferences': len({(ref['id'], ref['sha256']) for ref in declarations}), 'distinctIds': len({ref['id'] for ref in declarations}), 'distinctUrls': len(by_url), 'distinctSha256': len({ref['sha256'] for ref in declarations}), 'kindsByUrl': dict(Counter(refs[0]['kind'] for refs in by_url.values())), 'uniqueUrlBytes': sum(row['bytes'] for row in observed)},
    'allDeclaredHashesAndSizesMatch': all(row['allDeclaredHashesAndSizesMatch'] for row in observed), 'allMediaMatchGitBlobs': all(row['matchesGitBlob'] for row in observed),
    'allInputSnapshotsMatchGit': all(entry['matchesGitCommit'] for entry in source_inputs), 'sourceInputsUnchanged': source_unchanged, 'mediaHashesSizesMtimeUnchanged': before == after,
    'rightsStatus': 'NOT_AUTHORIZED_BY_THIS_OBSERVATION', 'trustedReceiptsInstalled': False, 'executableAcceptance': False, 'remoteWrites': 0, 'remoteJobs': 0,
    'existingNoticeObservations': {'rootLicense': 'MIT software license, Copyright (c) 2024 Ralex; not treated as an asset-specific reviewed grant', 'audioRefresh': 'Repository notice claims transition CC0 adaptation with exact adapted SHA and five procedural original sounds; external grant and generator not independently verified', 'revealSfx': 'Separate soft reveal file is not referenced by these two native manifests; no grant transferred by similarity'}}
(OUT / 'source-inputs.json').write_bytes((json.dumps(source_inputs, indent=2) + '\n').encode())
(OUT / 'git-tree.raw.base64.json').write_bytes((json.dumps({'command': ['git', 'ls-tree', '-rz', '--full-tree', commit, '--', *paths], 'bytes': len(tree_raw), 'sha256': digest(tree_raw), 'rawBase64': base64.b64encode(tree_raw).decode()}, indent=2) + '\n').encode())
REPORT.write_bytes((json.dumps(report, indent=2) + '\n').encode())
print(json.dumps({'status': report['status'], **report['counts'], 'allDeclaredHashesAndSizesMatch': report['allDeclaredHashesAndSizesMatch'], 'allMediaMatchGitBlobs': report['allMediaMatchGitBlobs'], 'sourceInputsUnchanged': source_unchanged, 'lottieEmbeddedPngs': sum(len(entry['embeddedPngs']) for entry in lottie)}))
assert source_unchanged and before == after
assert report['allDeclaredHashesAndSizesMatch'] and report['allMediaMatchGitBlobs'] and report['allInputSnapshotsMatchGit']
