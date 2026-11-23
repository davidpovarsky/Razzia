"""Capture actual focused checks and before/after hashes, without historical reuse."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
NODE = Path('C:/Users/DAVID/.local/tools/node-v24.22.1-win-x64/node.exe')
OUT = Path(__file__).resolve().parent / 'final'
OUT.mkdir(exist_ok=False)
changed = subprocess.check_output(['git', 'diff', '--name-only', 'b6ad96ffe13c56c04a6ce27e72330fe0e217622a', '--', 'extensions/src/core/show-library'], cwd=ROOT, text=True).splitlines()
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '--', 'extensions/src/core/show-library'], cwd=ROOT, text=True).splitlines()
paths = sorted({p for p in changed + untracked if p.endswith('.ts')})
tests = ['composition-repository', 'composition-validation', 'native-preview-frame', 'native-media-library', 'native-motion-library', 'composition-preview-v2', 'consumer-contract']
commands = {
    'tests': ['extensions/node_modules/vitest/vitest.mjs', 'run', '--root', 'extensions', '--config', 'vitest.config.ts', *[f'src/core/show-library/{name}.test.ts' for name in tests], '--maxWorkers', '1'],
    'types': ['extensions/node_modules/typescript/bin/tsc', '--project', 'extensions/src/core/show-library/tsconfig.focused.json'],
    'format': ['node_modules/prettier/bin/prettier.cjs', '--check', *paths],
    'lint': ['node_modules/oxlint/bin/oxlint', '--threads', '1', '--format', 'json', *paths],
}
env = dict(os.environ, PATH=str(NODE.parent) + os.pathsep + os.environ['PATH'])
def hashes():
    return {p: {'sha256': hashlib.sha256((ROOT / p).read_bytes()).hexdigest(), 'bytes': (ROOT / p).stat().st_size} for p in paths}
before = hashes()
record = {'startedUtc': datetime.now(timezone.utc).isoformat(), 'cwd': str(ROOT), 'node': subprocess.check_output([str(NODE), '--version'], text=True).strip(), 'sourceBefore': before, 'checks': []}
for name, args in commands.items():
    result = subprocess.run([str(NODE), *args], cwd=ROOT, env=env, capture_output=True)
    (OUT / f'{name}.stdout.log').write_bytes(result.stdout)
    (OUT / f'{name}.stderr.log').write_bytes(result.stderr)
    record['checks'].append({'name': name, 'command': [str(NODE), *args], 'exitCode': result.returncode, 'stdoutBytes': len(result.stdout), 'stderrBytes': len(result.stderr)})
    print(name, result.returncode, flush=True)
record['sourceAfter'] = hashes()
record['sourceUnchanged'] = before == record['sourceAfter']
record['finishedUtc'] = datetime.now(timezone.utc).isoformat()
(OUT / 'receipt.json').write_text(json.dumps(record, indent=2) + '\n')
print('sourceUnchanged', record['sourceUnchanged'])
