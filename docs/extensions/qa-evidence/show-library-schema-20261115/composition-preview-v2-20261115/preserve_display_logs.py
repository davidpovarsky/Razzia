"""Preserve exact tool stream bytes before producing whitespace-safe display logs."""
from pathlib import Path
import base64
import hashlib
import json

ROOT = Path(__file__).resolve().parent
paths = list(ROOT.rglob('*.log')) + list((ROOT.parent / 'native-motion-library-20261115/copy-isolation').rglob('*.log'))
records = []
for path in sorted(paths):
    body = path.read_bytes()
    display = '\n'.join(line.rstrip() for line in body.decode('utf-8').splitlines()).rstrip()
    if display:
        display += '\n'
    records.append({'path': str(path.relative_to(ROOT.parent)), 'rawBytes': len(body), 'rawSha256': hashlib.sha256(body).hexdigest(), 'rawBase64': base64.b64encode(body).decode(), 'displaySha256': hashlib.sha256(display.encode()).hexdigest()})
    path.write_bytes(display.encode())
(ROOT / 'RAW_TOOL_STREAMS.json').write_bytes((json.dumps(records, indent=2) + '\n').encode())
print('Preserved raw streams and normalized display logs:', len(records))
