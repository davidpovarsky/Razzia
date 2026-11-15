"""Exact new native media catalog checks; retained local dependencies only."""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
OUT = Path(__file__).resolve().parent / 'final'
OUT.mkdir(exist_ok=False)
NODE = 'C:/Users/DAVID/.local/tools/node-v24.22.1-win-x64/node.exe'
SOURCES = ['extensions/src/core/show-library/' + name for name in [
    'native-media-library.ts', 'native-media-library.test.ts', 'index.ts']]


def hashes():
    return {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in SOURCES}


checks = []
before = hashes()
for label, argv in [
    ('tests', ['extensions/node_modules/vitest/vitest.mjs', 'run', '--root', 'extensions',
               '--config', 'vitest.config.ts', 'src/core/show-library/native-media-library.test.ts',
               '--maxWorkers', '1', '--reporter=default', '--reporter=json',
               '--outputFile=' + str(OUT / 'tests.json')]),
    ('types', ['extensions/node_modules/typescript/bin/tsc', '--project', 'extensions/src/core/show-library/tsconfig.focused.json']),
    ('format', ['node_modules/prettier/bin/prettier.cjs', '--check'] + SOURCES),
]:
    start = datetime.now(timezone.utc).isoformat()
    result = subprocess.run([NODE] + argv, cwd=ROOT, capture_output=True, timeout=120)
    for stream in ['stdout', 'stderr']:
        (OUT / (label + '.' + stream + '.log')).write_bytes(getattr(result, stream))
    checks.append({'label': label, 'executable': NODE, 'argv': argv, 'cwd': str(ROOT),
                   'startedUtc': start, 'finishedUtc': datetime.now(timezone.utc).isoformat(),
                   'exitCode': result.returncode})
assert before == hashes(), 'source changed during execution'
receipt = {'sourceBaseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(),
           'sourceSha256': before, 'unchangedDuringChecks': True, 'checks': checks,
           'remoteJobs': 0, 'runtimeActivation': False, 'c35Rerun': False}
(OUT / 'CHECKS.json').write_text(json.dumps(receipt, indent=2) + '\n', newline='\n')
print(json.dumps(receipt))
assert all(check['exitCode'] == 0 for check in checks)
