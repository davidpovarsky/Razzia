"""Capture locked-phase mandatory-answer checks without runtime/renderer activation."""
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
stage = sys.argv[1]
assert stage in {'before', 'after'}
OUT = Path(__file__).resolve().parent / stage
OUT.mkdir(exist_ok=False)
env = dict(os.environ, PATH=str(NODE.parent) + os.pathsep + os.environ['PATH'])
sources = ['extensions/src/core/show-library/registry.ts', 'extensions/src/core/show-library/registry-locked.test.ts']
def hashes():
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in sources}
tests = ['src/core/show-library/registry-locked.test.ts']
if stage == 'after':
    tests += ['src/core/show-library/registry.test.ts', 'src/core/show-library/composition-validation.test.ts']
commands = {'tests': ['extensions/node_modules/vitest/vitest.mjs', 'run', '--root', 'extensions', '--config', 'vitest.config.ts', *tests, '--maxWorkers', '1']}
if stage == 'after':
    commands.update({
        'types': ['extensions/node_modules/typescript/bin/tsc', '--project', 'extensions/src/core/show-library/tsconfig.focused.json'],
        'format': ['node_modules/prettier/bin/prettier.cjs', '--check', *sources],
        'new-test-lint': ['node_modules/oxlint/bin/oxlint', '--threads', '1', '--format', 'json', sources[1]],
    })
receipt = {'stage': stage, 'startedUtc': datetime.now(timezone.utc).isoformat(), 'sourceBaseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'cwd': str(ROOT), 'sourceBefore': hashes(), 'checks': []}
for name, args in commands.items():
    r = subprocess.run([str(NODE), *args], cwd=ROOT, env=env, capture_output=True)
    streams = {}
    for stream in ['stdout', 'stderr']:
        raw = getattr(r, stream)
        display = '\n'.join(line.rstrip() for line in raw.decode().splitlines()).rstrip()
        (OUT / f'{name}.{stream}.log').write_bytes((display + '\n' if display else '').encode())
        streams[stream] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'rawBase64': base64.b64encode(raw).decode()}
    receipt['checks'].append({'name': name, 'command': [str(NODE), *args], 'exitCode': r.returncode, 'streams': streams})
    print(name, r.returncode, flush=True)
receipt['sourceAfter'] = hashes()
receipt['sourceUnchangedDuringChecks'] = receipt['sourceBefore'] == receipt['sourceAfter']
receipt['finishedUtc'] = datetime.now(timezone.utc).isoformat()
(OUT / 'receipt.json').write_bytes((json.dumps(receipt, indent=2) + '\n').encode())
assert receipt['sourceUnchangedDuringChecks']
if stage == 'after':
    assert all(check['exitCode'] == 0 for check in receipt['checks'])
