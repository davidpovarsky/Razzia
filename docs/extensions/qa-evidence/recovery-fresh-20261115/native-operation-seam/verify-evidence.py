"""Verify only this isolated native-operation packet; no runtime or repair."""
import difflib
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path.cwd()
HERE = pathlib.Path(__file__).resolve().parent
SOURCE = '1909da2f653377c545923b2e91dd2f4b1a2cf802'
LABEL = 'candidate-complete-final'
sha = lambda b: hashlib.sha256(b).hexdigest()
manifest = json.loads((HERE / (LABEL + '.inputs.json')).read_text())
paths = ['extensions/src/server/storage/' + name + '.ts' for name in
         ['creation-reservation', 'creation-operation-record', 'creation-operation-store', 'creation-operation-types']]
paths.append('extensions/src/server/index.ts')
code = []
for name in paths:
    raw = (ROOT / name).read_bytes()
    assert raw == subprocess.check_output(['git', 'show', SOURCE + ':' + name]), name
    code.append(dict(path=name, sha256=sha(raw), lines=len(raw.splitlines())))
for entry in manifest['inputs']:
    assert sha((ROOT / entry['file']).read_bytes()) == entry['sha256'], entry['file']
assert sha((HERE / (LABEL + '.mjs')).read_bytes()) == manifest['bundleSha256']
for name in ['complete-types-final.exit', LABEL + '-results.exit', 'tenant-format-final.exit', 'lint-new-final.exit']:
    assert (HERE / name).read_text().strip() == '0', name
tap = (HERE / (LABEL + '-results.log')).read_text()
assert '# tests 15' in tap and '# pass 15' in tap and '# fail 0' in tap
folder = HERE / (LABEL + '-receipts')
receipts = []
pids = []
for file in folder.glob('*.json'):
    value = json.loads(file.read_text())
    receipts.append(dict(path=file.relative_to(HERE).as_posix(), sha256=sha(file.read_bytes()), bytes=file.stat().st_size))
    if file.name.endswith('-replay.json'):
        killed = value['killed']
        assert killed['signal'] == 'SIGKILL' and killed['status'] is None and killed.get('error') is None
        checkpoint = json.loads((folder / file.name.replace('-replay', '-checkpoint')).read_text())
        assert checkpoint['pid'] == killed['pid']
        for key in ['lookup', 'retry', 'replay']:
            if key in value:
                child = value[key]
                assert child['status'] == 0 and child['signal'] is None and child.get('error') is None
                assert json.loads(child['stdout'])['pid'] == child['pid'] != killed['pid']
                pids.append(child['pid'])
        pids.append(killed['pid'])
    if 'before' in value and 'after' in value:
        assert value['before'] == value['after'], file.name
    if file.name == 'later-edits.json':
        assert value['deletedBefore'] == value['deletedAfter']
        for key in ['look', 'retry', 'deletedLookup', 'deletedRetry']:
            assert value[key]['status'] == 0
            pids.append(value[key]['pid'])
    if file.name == 'default-compatible.json':
        for key in ['first', 'second']:
            assert value[key]['status'] == 0
            pids.append(value[key]['pid'])
assert len(pids) == len(set(pids)) == 22
for name in ['after-native-commit', 'after-f-outcome']:
    value = json.loads((folder / (name + '-checkpoint.json')).read_text())
    assert value['operation']['phase'] == 'committed' and value['operation']['result'] == value['result']
    assert not any(p.endswith('intent.json') for p in value['state'])
inventory = json.loads(pathlib.Path('C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz/pause-handoff-20261115/agents/recovery-inventory.json').read_text())
for entry in inventory['files']:
    file = pathlib.Path(entry['path'])
    assert sha(file.read_bytes()) == entry['sha256']
    assert subprocess.check_output(['git', 'status', '--short', '--', str(file)], text=True).startswith('??')
old = subprocess.check_output(['git', 'show', 'f11b29db79d8fe3faa9abc5004a639f8b042eeee:' + paths[0]], text=True).splitlines()
new = (ROOT / paths[0]).read_text().splitlines()
added = set()
for kind, a, b, c, d in difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes():
    if kind in ['replace', 'insert']:
        added.update(range(c + 1, d + 1))
lint = (HERE / 'tenant-lint-core.log').read_text().splitlines()
assert not [line for line in lint if (m := re.match(r'.+\.ts:(\d+):', line)) and int(m[1]) in added]
result = dict(sourceCommit=SOURCE, cases=15, passed=15, failed=0, skipped=0,
              genuineSIGKILL=5, distinctObservedChildren=len(pids), exitedZero=17,
              actualBundledInputs=len(manifest['inputs']), bundleSha256=manifest['bundleSha256'],
              runtime='Local existing WSL Ubuntu, Linux6.18, Node26.11.1, /tmp persistent ext4',
              compilerTarget='node24; this is not pinned Node24 execution',
              checks=dict(scopedTypesWithTests=0, sourceFormat=0, newModulesLint=0,
                          wholeExistingCoreLint=1, unchangedLineDiagnostics=len(lint), changedLineDiagnostics=0),
              productFiles=code, receipts=receipts, inheritedUntrackedPreserved=16,
              oracleJobs=0, installations=0, customerOrProductionOperations=0,
              boundary='F auth/consent ledger and real host composition, independent integrated qualification and hardware durability remain separate')
destination = HERE / 'FINAL_COMPLETE_VERIFICATION.json'
destination.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({k: v for k, v in result.items() if k not in ['productFiles', 'receipts']}))
