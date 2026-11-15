"""Normalize generated JSON display newlines; retain raw tool JSON verbatim in base64."""
from pathlib import Path
import base64
import hashlib
import json
import subprocess

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
OUT = Path(__file__).resolve().parent
paths = subprocess.check_output(['git', 'diff', '--cached', '--name-only'], cwd=ROOT, text=True).splitlines()
records = []
for name in paths:
    path = ROOT / name
    if path.suffix != '.json' or '/qa-evidence/show-library-schema-20261115/' not in name:
        continue
    body = path.read_bytes()
    display = '\n'.join(line.rstrip() for line in body.decode('utf-8').splitlines()).rstrip() + '\n'
    changed = display.encode() != body
    if not changed:
        continue
    try:
        unchanged = json.loads(body) == json.loads(display)
    except json.JSONDecodeError:
        # The original Node 22 loader failure was captured as text despite this name.
        assert path.name == 'lint.json'
        unchanged = 'NOT_JSON_ORIGINAL_TOOL_ERROR_TEXT'
    entry = {'path': name, 'beforeBytes': len(body), 'beforeSha256': hashlib.sha256(body).hexdigest(), 'afterSha256': hashlib.sha256(display.encode()).hexdigest(), 'jsonValueUnchanged': unchanged}
    if path.name in {'lint.json', 'lint-node24.json', 'lint-safe-fix.json', 'tests.json'}:
        entry['rawBase64'] = base64.b64encode(body).decode()
    assert entry['jsonValueUnchanged']
    path.write_bytes(display.encode())
    records.append(entry)
(OUT / 'JSON_DISPLAY_NORMALIZATION.json').write_bytes((json.dumps({'note': 'Initial pass normalized earlier generated JSON then stopped at non-JSON Node22 lint.json; this receipt covers remaining changed files. Final tool streams remain verbatim in RAW_TOOL_STREAMS.json. JSON line-ending normalization does not establish new test evidence.', 'changes': records}, indent=2) + '\n').encode())
print('Generated JSON normalized with values unchanged:', len(records))
