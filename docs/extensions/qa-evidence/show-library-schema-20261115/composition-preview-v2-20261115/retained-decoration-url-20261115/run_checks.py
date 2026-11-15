"""Capture the actual retained-URL regression before and after host correction."""
from pathlib import Path
from datetime import datetime, timezone
import base64
import hashlib
import json
import os
import subprocess
import sys

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
NODE = Path('C:/Users/DAVID/.local/tools/node-v24.22.1-win-x64/node.exe')
STAGE = sys.argv[1]
assert STAGE in {'before', 'after'}
OUT = Path(__file__).resolve().parent / STAGE
OUT.mkdir(exist_ok=False)
env = dict(os.environ, PATH=str(NODE.parent) + os.pathsep + os.environ['PATH'])
sources = [f'extensions/src/core/show-library/{name}' for name in ['native-preview-renderer-v2.ts', 'composition-preview-v2.test.ts', 'native-preview-renderer-v2-schema.ts', 'composition-preview-v2.ts', 'native-presentation-settings.ts']]
def hashes():
    return {name: {'bytes': (ROOT / name).stat().st_size, 'sha256': hashlib.sha256((ROOT / name).read_bytes()).hexdigest()} for name in sources}
tests = ['src/core/show-library/composition-preview-v2.test.ts']
if STAGE == 'after':
    tests.append('src/core/show-library/consumer-contract.test.ts')
commands = {'tests': ['extensions/node_modules/vitest/vitest.mjs', 'run', '--root', 'extensions', '--config', 'vitest.config.ts', *tests, '--maxWorkers', '1']}
if STAGE == 'after':
    commands.update({
        'types': ['extensions/node_modules/typescript/bin/tsc', '--project', 'extensions/src/core/show-library/tsconfig.focused.json'],
        'format': ['node_modules/prettier/bin/prettier.cjs', '--check', *sources[:2]],
        'lint': ['node_modules/oxlint/bin/oxlint', '--threads', '1', '--format', 'json', *sources[:2]],
    })
receipt = {'stage': STAGE, 'startedUtc': datetime.now(timezone.utc).isoformat(), 'cwd': str(ROOT), 'sourceBaseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'sourceBefore': hashes(), 'checks': []}
for name, args in commands.items():
    result = subprocess.run([str(NODE), *args], cwd=ROOT, env=env, capture_output=True)
    streams = {}
    for stream in ['stdout', 'stderr']:
        raw = getattr(result, stream)
        display = '\n'.join(line.rstrip() for line in raw.decode().splitlines()).rstrip()
        (OUT / f'{name}.{stream}.log').write_bytes((display + '\n' if display else '').encode())
        streams[stream] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'rawBase64': base64.b64encode(raw).decode()}
    receipt['checks'].append({'name': name, 'command': [str(NODE), *args], 'exitCode': result.returncode, 'streams': streams})
    print(name, result.returncode, flush=True)
receipt['sourceAfter'] = hashes()
receipt['sourceUnchangedDuringChecks'] = receipt['sourceBefore'] == receipt['sourceAfter']
receipt['finishedUtc'] = datetime.now(timezone.utc).isoformat()
(OUT / 'receipt.json').write_bytes((json.dumps(receipt, indent=2) + '\n').encode())
assert receipt['sourceUnchangedDuringChecks']
if STAGE == 'after':
    assert all(check['exitCode'] == 0 for check in receipt['checks'])
