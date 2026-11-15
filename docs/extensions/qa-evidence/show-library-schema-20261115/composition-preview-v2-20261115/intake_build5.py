"""Read peer build5 receipt bytes and cross-check its vendor inputs, without remote IO."""
from pathlib import Path
import base64
import hashlib
import json
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[5]
EVIDENCE = Path(__file__).resolve().parent
PEER = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-ui-20261115/docs/extensions/qa-evidence/show-ui-20261115/native-build5')
OUT = EVIDENCE / 'build5-intake'
OUT.mkdir(exist_ok=False)
raw = []
for name in ['native-build-receipt.json', 'native-module-receipt.json', 'physical-mounts.json', 'runtime-toolchain.json', 'native-build.log']:
    body = (PEER / name).read_bytes()
    raw.append({'path': str(PEER / name), 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'bodyBase64': base64.b64encode(body).decode()})
(OUT / 'peer-raw-files.json').write_text(json.dumps(raw, indent=2) + '\n')
build = json.loads(base64.b64decode(raw[0]['bodyBase64']))
graph = json.loads(base64.b64decode(raw[1]['bodyBase64']))
observed = json.loads((EVIDENCE.parent / 'vendor-dd3-membership-20261115/observed-membership.json').read_text())
vendors = [entry for entry in build['inputs'] if '/node_modules/' in entry['id']]
checks = []
for entry in vendors:
    package = next(package for package in observed['packages'] if '/node_modules/' + package['package'].rsplit('@', 1)[0] + '/' in entry['id'])
    package_name = package['package'].rsplit('@', 1)[0]
    package_path = entry['id'].split('/node_modules/' + package_name + '/', 1)[1]
    original = next(item for item in package['files'] if item['packagePath'] == package_path)
    assert original['module']
    assert original['observed']['bytes'] == entry['bytes']
    assert original['observed']['sha256'] == entry['sha256']
    checks.append({'id': entry['id'], 'package': package['package'], 'packagePath': package_path, 'bytes': entry['bytes'], 'sha256': entry['sha256'], 'matchesObservedCafs': True})
assert len(checks) == 106
physical = {entry['id'] for entry in build['inputs']}
contributors = [entry for output in graph['outputs'] if output['type'] == 'chunk' for entry in output['moduleContributions']]
summary = {
    'capturedUtc': datetime.now(timezone.utc).isoformat(),
    'status': 'LOCAL_PEER_RECEIPT_INTAKE_ONLY',
    'peerFiles': [{key: value for key, value in entry.items() if key != 'bodyBase64'} for entry in raw],
    'physicalInputs': len(build['inputs']), 'graphNodes': len(graph['modules']),
    'vendorInputsMatchedToActualPriorCafsObservation': len(checks),
    'moduleContributions': len(contributors),
    'contributorsWithoutPhysicalInput': [entry['id'] for entry in contributors if entry['id'] not in physical],
    'outputsReportedByPeerReceipt': build['outputs'],
    'forbiddenPayloadModulesReportedByPeerReceipt': build['forbiddenPayloadModules'],
    'sourceIsPeerWorkInProgress': True,
    'v2RendererBuild': False, 'browserOrLoaderAcceptance': 'NOT_RUN_BY_D',
    'independentRemoteOutputRehash': False, 'remoteWrites': 0,
    'imageRights': 'UNKNOWN', 'trustedReceiptsInstalled': False,
    'executableAcceptance': False, 'compiledPins': [],
}
(OUT / 'vendor-input-checks.json').write_text(json.dumps(checks, indent=2) + '\n')
(OUT / 'SUMMARY.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({key: summary[key] for key in ['status', 'physicalInputs', 'graphNodes', 'vendorInputsMatchedToActualPriorCafsObservation', 'moduleContributions', 'contributorsWithoutPhysicalInput']}))
