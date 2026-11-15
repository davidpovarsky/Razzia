"""Scoped Windows verification, using retained dependencies with no installation."""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
EVIDENCE = Path(__file__).resolve().parent
NODE = 'C:/Users/DAVID/.local/tools/node-v24.22.1-win-x64/node.exe'
SOURCES = ['extensions/src/core/show-library/' + name for name in [
    'composition-validation.ts', 'composition-validation.test.ts', 'index.ts']]


def hash_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(label, args):
    started = datetime.now(timezone.utc).isoformat()
    result = subprocess.run([NODE] + args, cwd=ROOT, capture_output=True, timeout=120)
    for stream in ['stdout', 'stderr']:
        (EVIDENCE / (label + '.' + stream + '.log')).write_bytes(getattr(result, stream))
    return {'label': label, 'executable': NODE, 'argv': args, 'cwd': str(ROOT),
            'startedUtc': started, 'finishedUtc': datetime.now(timezone.utc).isoformat(),
            'exitCode': result.returncode,
            'stdoutSha256': hash_file(EVIDENCE / (label + '.stdout.log')),
            'stderrSha256': hash_file(EVIDENCE / (label + '.stderr.log'))}


before = {path: hash_file(ROOT / path) for path in SOURCES}
checks = [run('tests-final', ['extensions/node_modules/vitest/vitest.mjs', 'run',
    '--root', 'extensions', '--config', 'vitest.config.ts',
    'src/core/show-library/composition-validation.test.ts', '--maxWorkers', '1',
    '--reporter=default', '--reporter=json', '--outputFile=' + str(EVIDENCE / 'tests-final.json')]),
    run('types-final', ['extensions/node_modules/typescript/bin/tsc', '--project',
                      'extensions/src/core/show-library/tsconfig.focused.json']),
    run('format-final', ['node_modules/prettier/bin/prettier.cjs', '--check'] + SOURCES)]
assert before == {path: hash_file(ROOT / path) for path in SOURCES}, 'source changed during verification'
receipt = {'sourceBaseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(),
           'sourceSha256': before, 'checks': checks, 'unchangedDuringChecks': True,
           'executableAcceptance': False, 'c35Rerun': False, 'browserRun': False}
(EVIDENCE / 'CHECKS.json').write_text(json.dumps(receipt, indent=2) + '\n', newline='\n')
print(json.dumps(receipt))
assert all(check['exitCode'] == 0 for check in checks)
