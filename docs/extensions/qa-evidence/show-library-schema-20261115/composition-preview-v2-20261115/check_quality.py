"""Run scoped quality tools with Node 24; preserve each observed result."""
from pathlib import Path
import json
import os
import subprocess
import sys

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
NODE = Path('C:/Users/DAVID/.local/tools/node-v24.22.1-win-x64/node.exe')
OUT = Path(__file__).resolve().parent
changed = subprocess.check_output(['git', 'diff', '--name-only', 'b6ad96ffe13c56c04a6ce27e72330fe0e217622a', '--', 'extensions/src/core/show-library'], cwd=ROOT, text=True).splitlines()
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '--', 'extensions/src/core/show-library'], cwd=ROOT, text=True).splitlines()
paths = sorted({p for p in changed + untracked if p.endswith('.ts')})
env = dict(os.environ, PATH=str(NODE.parent) + os.pathsep + os.environ['PATH'])
mode = sys.argv[1]
commands = {
    'format': ['node_modules/prettier/bin/prettier.cjs', '--write', *paths],
    'fix': ['node_modules/oxlint/bin/oxlint', '--threads', '1', '--format', 'json', '--fix', *paths],
    'lint': ['node_modules/oxlint/bin/oxlint', '--threads', '1', '--format', 'json', *paths],
}
result = subprocess.run([str(NODE), *commands[mode]], cwd=ROOT, env=env, capture_output=True)
(OUT / f'quality-{mode}.stdout.log').write_bytes(result.stdout)
(OUT / f'quality-{mode}.stderr.log').write_bytes(result.stderr)
(OUT / f'quality-{mode}.json').write_text(json.dumps({'command': [str(NODE), *commands[mode]], 'cwd': str(ROOT), 'exitCode': result.returncode}, indent=2) + '\n')
if mode == 'lint':
    data = json.loads(result.stdout)
    for d in data.get('diagnostics', []):
        print(d['filename'], d['labels'][0]['span']['line'], d['code'], d['message'])
else:
    print(mode, 'exit', result.returncode, 'paths', len(paths))
sys.exit(result.returncode)
