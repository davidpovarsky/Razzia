"""Capture the existing peer private V2 fixture contract and rehash its two outputs."""
from pathlib import Path
from datetime import datetime, timezone
import base64
import hashlib
import json
import subprocess

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-ui-20261115')
BASE = ROOT / 'docs/extensions/qa-evidence/show-ui-20261115'
OUT = Path(__file__).resolve().parent / 'PRIVATE_FIXTURE_SNAPSHOT.json'
assert not OUT.exists()
names = ['qa-native-v2-host.ts', 'qa-browser-v2.mjs', 'qa-fixture-server.ts', 'qa-native-v2.spec.ts', 'qa-native-v2.config.ts',
    'native21-evidence/native-v2-browser.log', 'native21-evidence/native-v2-browser.exit', 'native21-evidence/native-v2-smoke.log', 'native21-evidence/native-v2-smoke.exit',
    'native21-evidence/native-v2-host.log', 'native21-evidence/native-v2-built-definitions.json']
records = []
for name in names:
    path = BASE / name
    body = path.read_bytes()
    records.append({'path': str(path), 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'bodyBase64': base64.b64encode(body).decode()})
receipt_path = BASE / 'native21-evidence/native-v2-build-receipt.json'
receipt_body = receipt_path.read_bytes()
receipt = json.loads(receipt_body)
outputs = []
for entry in receipt['outputs']:
    path = BASE / 'native21-evidence/native-v2-candidate' / entry['path']
    body = path.read_bytes()
    value = {'path': str(path), 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'expectedFromPeerReceipt': entry}
    value['matchesPeerBuildReceipt'] = (len(body), value['sha256']) == (entry['bytes'], entry['sha256'])
    assert value['matchesPeerBuildReceipt']
    outputs.append(value)
assert all(Path(entry['path']).read_bytes() == base64.b64decode(entry['bodyBase64']) for entry in records)
assert receipt_path.read_bytes() == receipt_body
report = {'capturedUtc': datetime.now(timezone.utc).isoformat(), 'peerHeadObserved': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
    'kind': 'PRIVATE_SYNTHETIC_FIXTURE_CONTRACT_AND_LOCAL_OUTPUT_REHASH', 'files': records,
    'peerBuildReceipt': {'path': str(receipt_path), 'bytes': len(receipt_body), 'sha256': hashlib.sha256(receipt_body).hexdigest(), 'reportedNode': receipt['node'], 'reportedPlatform': receipt['platform'], 'reportedArch': receipt['arch'], 'reportedInputEntries': len(receipt['inputs']), 'rawReceiptCopied': False},
    'outputRehash': outputs, 'peerSourcesUnchangedDuringCapture': True,
    'browserOrServerRunByD': False, 'liveEndpointReachabilityVerified': False, 'mcpDraftConsumerVerified': False, 'runtimeRightsOrPinsGranted': False, 'remoteJobs': 0}
OUT.write_bytes((json.dumps(report, indent=2) + '\n').encode())
print(json.dumps({'capturedFiles': len(records), 'rehashOutputs': len(outputs), 'allMatchPeerReceipt': all(entry['matchesPeerBuildReceipt'] for entry in outputs), 'browserOrServerRunByD': False, 'liveEndpointReachabilityVerified': False}))
