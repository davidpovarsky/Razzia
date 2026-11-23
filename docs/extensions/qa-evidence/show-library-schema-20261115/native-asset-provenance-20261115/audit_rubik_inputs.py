"""Record existing local Rubik CSS/font/license inputs, without package authenticity claims."""
from pathlib import Path
from datetime import datetime, timezone
import base64
import hashlib
import json
import re
import subprocess

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
OUT = Path(__file__).resolve().parent
REPORT = OUT / 'rubik-observation.json'
assert not REPORT.exists()
package = ROOT / 'node_modules/.pnpm/@fontsource-variable+rubik@5.3.0/node_modules/@fontsource-variable/rubik'
assert package.is_dir()
def digest(body):
    return hashlib.sha256(body).hexdigest()
inputs = []
for name in ['package.json', 'LICENSE', 'wght.css', 'metadata.json']:
    path = package / name
    body = path.read_bytes()
    inputs.append({'path': str(path), 'physicalPath': str(path.resolve()), 'packagePath': name, 'bytes': len(body), 'sha256': digest(body), 'bodyBase64': base64.b64encode(body).decode(), 'mtimeNs': path.stat().st_mtime_ns})
metadata = json.loads(base64.b64decode(inputs[0]['bodyBase64']))
assert metadata['name'] == '@fontsource-variable/rubik' and metadata['version'] == '5.3.0'
css = base64.b64decode(inputs[2]['bodyBase64']).decode()
urls = re.findall(r'url\(([^)]+)\)', css)
fonts = []
for url in urls:
    assert url.startswith('./files/') and url.endswith('.woff2') and '..' not in url.split('/')
    path = (package / url).resolve()
    assert path.is_relative_to(package.resolve())
    body = path.read_bytes()
    assert body[:4] == b'wOF2'
    fonts.append({'packagePath': url, 'physicalPath': str(path), 'bytes': len(body), 'sha256': digest(body), 'mtimeNs': path.stat().st_mtime_ns, 'woff2Signature': True})
lock = (ROOT / 'pnpm-lock.yaml').read_bytes()
match = re.search(rb"  '@fontsource-variable/rubik@5\.3\.0':\r?\n    resolution: \{integrity: ([^}]+)\}", lock)
assert match
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
app = []
for name in ['packages/web/src/main.tsx', 'packages/web/src/index.css']:
    body = (ROOT / name).read_bytes()
    git_body = subprocess.check_output(['git', 'show', commit + ':' + name], cwd=ROOT)
    app.append({'path': name, 'bytes': len(body), 'sha256': digest(body), 'matchesGitCommit': body == git_body})
assert '@fontsource-variable/rubik/wght.css' in (ROOT / app[0]['path']).read_text(encoding='utf-8')
assert '"Rubik Variable"' in (ROOT / app[1]['path']).read_text(encoding='utf-8')
unchanged = all((Path(entry['path']).read_bytes() == base64.b64decode(entry['bodyBase64']) and Path(entry['path']).stat().st_mtime_ns == entry['mtimeNs']) for entry in inputs)
unchanged = unchanged and all(digest(Path(entry['physicalPath']).read_bytes()) == entry['sha256'] and Path(entry['physicalPath']).stat().st_mtime_ns == entry['mtimeNs'] for entry in fonts)
report = {'status': 'LOCAL_INSTALLED_FONT_OBSERVATION', 'capturedUtc': datetime.now(timezone.utc).isoformat(), 'sourceCommit': commit,
    'package': {'name': metadata['name'], 'version': metadata['version'], 'declaredLicense': metadata.get('license')},
    'sourceInputs': inputs, 'cssFontUrls': urls, 'fonts': fonts, 'appImportInputs': app,
    'lockfileSha256': digest(lock), 'lockMatchesGitCommit': lock == subprocess.check_output(['git', 'show', commit + ':pnpm-lock.yaml'], cwd=ROOT),
    'declaredLockIntegrity': match[1].decode(), 'tarballOrCafsMembershipVerified': False,
    'filesAndMtimeUnchanged': unchanged, 'fontCount': len(fonts), 'fontBytes': sum(entry['bytes'] for entry in fonts),
    'emittedBuildOrLoaderBindingVerified': False, 'browserRenderingVerified': False,
    'trustedReceiptsInstalled': False, 'executionOrExportAuthorized': False, 'remoteWrites': 0, 'networkRequests': 0,
    'rightsMeaning': 'Exact existing OFL notice and package declaration observed; no authority installed or legal conclusion about media rights'}
REPORT.write_bytes((json.dumps(report, indent=2) + '\n').encode())
assert unchanged and all(entry['matchesGitCommit'] for entry in app) and report['lockMatchesGitCommit']
print(json.dumps({'status': report['status'], 'package': report['package'], 'fontCount': len(fonts), 'fontBytes': report['fontBytes'], 'filesAndMtimeUnchanged': unchanged, 'tarballOrCafsMembershipVerified': False}))
