"""Inspect retained private Preview font binding without starting a browser or server."""
from pathlib import Path
from datetime import datetime, timezone
import base64
import hashlib
import json
import re

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
PEER = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-ui-20261115')
BASE = PEER / 'docs/extensions/qa-evidence/show-ui-20261115'
OUT = Path(__file__).resolve().parent
REPORT = OUT / 'observation.json'
assert not REPORT.exists()
names = [
    'docs/extensions/qa-evidence/show-ui-20261115/qa-fixture-server.ts',
    'docs/extensions/qa-evidence/show-ui-20261115/qa-browser-v2.mjs',
    'extensions/src/presentation/show-library-preview/native-razzia-preview-v2.css',
    'extensions/src/presentation/show-themes/context.tsx',
]
sources = []
for name in names:
    body = (PEER / name).read_bytes()
    sources.append({'path': str(PEER / name), 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'bodyBase64': base64.b64encode(body).decode()})
server = base64.b64decode(sources[0]['bodyBase64']).decode()
entries = server.split('const entries = {', 1)[1].split('} as const', 1)[0]
css_path = BASE / 'native21-evidence/native-v2-candidate/renderer-v2.css'
css_body = css_path.read_bytes()
css = css_body.decode()
receipt_path = BASE / 'native21-evidence/native-v2-build-receipt.json'
receipt_body = receipt_path.read_bytes()
receipt = json.loads(receipt_body)
expected = next(entry for entry in receipt['outputs'] if entry['path'] == 'renderer-v2.css')
assert (len(css_body), hashlib.sha256(css_body).hexdigest()) == (expected['bytes'], expected['sha256'])
font_receipt_path = ROOT / 'docs/extensions/qa-evidence/show-library-schema-20261115/native-asset-provenance-20261115/rubik-observation.json'
font_receipt_body = font_receipt_path.read_bytes()
font_receipt = json.loads(font_receipt_body)
cafs_path = ROOT / 'docs/extensions/qa-evidence/show-library-schema-20261115/rubik-store-membership-20261115/observation.json'
cafs_body = cafs_path.read_bytes()
cafs = json.loads(cafs_body)
font_inputs = []
for font in font_receipt['fonts']:
    package_path = font['packagePath'].removeprefix('./')
    member = next(entry for entry in cafs['files'] if entry['packagePath'] == package_path)
    assert (font['bytes'], font['sha256']) == (member['installed']['bytes'], member['installed']['sha256'])
    font_inputs.append({'package': '@fontsource-variable/rubik@5.3.0', 'packagePath': package_path, 'bytes': font['bytes'], 'sha256': font['sha256'], 'sha512': member['installed']['sha512'], 'mime': 'font/woff2', 'registeredByThisObservation': False})
report = {'capturedUtc': datetime.now(timezone.utc).isoformat(), 'kind': 'STATIC_PRIVATE_FIXTURE_FONT_BINDING_GAP', 'sources': sources,
    'retainedCss': {'path': str(css_path), 'bytes': len(css_body), 'sha256': hashlib.sha256(css_body).hexdigest(), 'matchesPeerBuildReceipt': True, 'fontFaceRules': css.count('@font-face'), 'urlReferences': re.findall(r'url\(([^)]+)\)', css)},
    'peerBuildReceipt': {'path': str(receipt_path), 'sha256': hashlib.sha256(receipt_body).hexdigest(), 'fontRelatedInputs': [entry for entry in receipt['inputs'] if any(word in entry.get('id', '').lower() for word in ['fontsource', 'woff', 'rubik'])]},
    'fixtureResourceMapFontTokens': [word for word in ['woff', 'font/', '@fontsource', 'Rubik'] if word in entries],
    'fixtureServerFontFaceRulePresent': '@font-face' in server,
    'nativeThemeSelectsRubikFamily': '\'"Rubik Variable", sans-serif\'' in base64.b64decode(sources[3]['bodyBase64']).decode(),
    'priorFontObservationSha256': hashlib.sha256(font_receipt_body).hexdigest(), 'localCafsObservationSha256': hashlib.sha256(cafs_body).hexdigest(), 'availableExistingFontInputs': font_inputs,
    'browserUsedFontObserved': False, 'osInstalledFontAvailabilityObserved': False, 'invalidatesOtherBrowserAcceptance': False, 'blocksGDevelopmentStart': False,
    'productSourceChanges': 0, 'rendererPinsOrRightsGrantsAdded': 0, 'browserOrServerStarted': False, 'remoteJobs': 0, 'testsRerun': 0}
assert all(Path(entry['path']).read_bytes() == base64.b64decode(entry['bodyBase64']) for entry in sources)
assert css_path.read_bytes() == css_body and receipt_path.read_bytes() == receipt_body
REPORT.write_bytes((json.dumps(report, indent=2) + '\n').encode())
print(json.dumps({'fontFaceRules': report['retainedCss']['fontFaceRules'], 'fontRelatedBuildInputs': len(report['peerBuildReceipt']['fontRelatedInputs']), 'fixtureResourceMapFontTokens': report['fixtureResourceMapFontTokens'], 'availableHashBackedFontInputs': len(font_inputs), 'browserUsedFontObserved': False, 'blocksGDevelopmentStart': False}))
