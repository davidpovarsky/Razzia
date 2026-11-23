"""Offline raw-result verification only; no application import, test or rerun."""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / 'c1-execution-packet2'


def load(path):
    return json.loads(path.read_bytes())


def receipt(name):
    return load(OUT / 'child-receipts' / (name + '.json'))


def distinct(*pids):
    assert all(type(pid) is int and pid > 0 for pid in pids)
    assert len(set(pids)) == len(pids)


def replay(run, code):
    assert run['pid'] == run['process']['pid']
    assert run['process']['code'] == code and run['process']['signal'] is None
    assert run['process']['timedOut'] is False


def public(state):
    return {key: value for key, value in state.items()
            if key.startswith('quizz/') or key.startswith('extensions/quizzes/')}


def witnesses(state):
    return {pathlib.PurePosixPath(key).name: value for key, value in state.items()
            if pathlib.PurePosixPath(key).name in ('base.record', 'sidecar.record', 'intent.json')}


groups, failures, passed_names = [], [], []
for name, count, passed in [('primitives-scope', 9, 9), ('reservation', 16, 16),
                            ('review-regressions', 12, 12), ('actual-native', 11, 4)]:
    result = load(OUT / 'child-results' / (name + '.results.json'))
    assert result['numTotalTests'] == count and result['numPassedTests'] == passed
    assert result['numFailedTests'] == count - passed
    assert result['numPendingTests'] == 0 and result.get('numTodoTests', 0) == 0
    groups.append({'name': name, 'total': count, 'passed': passed, 'failed': count - passed})
    for suite in result['testResults']:
        for case in suite['assertionResults']:
            if case['status'] == 'failed':
                failures.append({'name': case['fullName'], 'failureMessages': case['failureMessages']})
            elif name == 'actual-native' and case['status'] == 'passed':
                passed_names.append(case['fullName'])
assert sum(v['passed'] for v in groups) == 41 and len(failures) == 7
assert 'failed to create new OS thread' in failures[0]['failureMessages'][0]
assert 'errno=11' in failures[0]['failureMessages'][0]
assert all('.c1-interrupted.json' in v['failureMessages'][0] for v in failures[1:])

review_receipts = []
for name in ['review-absent-base', 'review-absent-sidecar',
             'review-move-active-committed', 'review-move-resolved-committed',
             'review-move-active-empty', 'review-move-resolved-empty']:
    value = receipt(name)
    assert value['state'] == 'PASS'
    interrupted, checkpoint = value['interrupted'], value['checkpoint']
    assert interrupted['signal'] == 'SIGKILL' and interrupted['timedOut'] is False
    assert interrupted['pid'] == checkpoint['pid']
    distinct(interrupted['pid'], *[v['pid'] for v in value['failed']], *[v['pid'] for v in value['recovered']])
    for run in value['failed']:
        replay(run, 2)
        assert run['faultActivations'] > 0
        assert witnesses(run['state']) == witnesses(checkpoint['state'])
        if name.startswith('review-move-'):
            assert public(run['state']) == public(checkpoint['state'])
            assert run['phases']['active'] == [] and len(run['phases']['resolved']) == 1
        else:
            intent = json.loads(bytes.fromhex(witnesses(run['state'])['intent.json']['hex']))
            assert intent['phase'] == 'ready'
    for run in value['recovered']:
        replay(run, 0)
        assert witnesses(run['state']) == {}
        assert public(run['state']) == (public(checkpoint['state']) if name.startswith('review-move-') else {})
    assert value['recovered'][1]['report']['recovered'] == 0
    review_receipts.append({'name': name, 'killedOwnChildPid': interrupted['pid'],
                            'failedFreshPids': [v['pid'] for v in value['failed']],
                            'successfulFreshPids': [v['pid'] for v in value['recovered']]})

http = receipt('review-private-http-errors')
assert http['state'] == 'PASS' and len(http['receipts']) == 4
for value in http['receipts']:
    assert value['activations'] == 1 and value['body'] == {'error': 'errors:server.internal'}
    assert value['allocated'] not in json.dumps(value['body']) and public(value['state']) == {}

for name in ['proof-base-replacement', 'proof-sidecar-in-place', 'proof-missing-witness', 'proof-newer-intent']:
    value = receipt(name)
    assert value['state'] == 'PASS' and value['interrupted']['signal'] == 'SIGKILL'
    assert value['interrupted']['timedOut'] is False
    distinct(value['interrupted']['pid'], *[v['pid'] for v in value['runs']])
    for run in value['runs']:
        replay(run, 2)
        assert run['state'] == value['before']
for name in ['failed-intent-fence', 'enhanced-sidecar-race', 'qualified-external-interference']:
    value = receipt(name)
    assert value['state'] == 'PASS'
    for run in value['runs']:
        replay(run, 2)
        assert run['state'] == value['before']
warm = receipt('warm-visible-commit')
assert warm['state'] == 'PASS'
for run in warm['blocked']:
    replay(run, 2)
    assert run['state'] == warm['before']
for run in warm['runs']:
    replay(run, 0)
    assert public(run['state']) == public(warm['before'])

missing = []
for boundary in ['before-public', 'after-sidecar', 'before-id-return', 'committed-visible', 'private-cleanup', 'before-slot-removal']:
    value = receipt('native-' + boundary)
    assert value['state'] == 'FAIL' and '.c1-interrupted.json' in value['error']
    missing.append({'boundary': boundary, 'expectedKillAndTwoReplayEvidenceEstablished': False,
                    'childResultRetainedBeforeCheckpointRead': 'interrupted' in value})
assert not (OUT / 'child-receipts/actual-api-tenant-flag-replay.json').exists()
assert not (OUT / 'host/analyze-results-command.json').exists()

identity = load(OUT / 'host/runner-identity.json')
merged = load(OUT / 'host/merged-before.json')
assert merged['mismatches'] == [] and (merged['files'], merged['aux'], merged['retainedFiles']) == (1287, 2, 1391)
assert merged['identity']['euid'] == 1001 and merged['identity']['egid'] == 1001
assert all(int(merged['security'][key], 16) == 0 for key in ('CapEff', 'CapPrm', 'CapBnd'))
assert merged['security']['NoNewPrivs'] == '1' and len(merged['access']) == 9
last_hashes = load(OUT / 'host/merged-review-regressions.json')
assert last_hashes['mismatches'] == []
admission = load(OUT / 'host/root-admission.json')
assert admission['admissionSha256'] == 'aa708d1b429f09e7a628700c6ea4d622f0a54fe0cb9e7469e618d3b8611c9b89'
assert admission['laneLedgerSha256'] == '2cfc5266f99d6d62c6e6549ba2093aa03a94ec0eec5717db0817d6d3eb3a55e0'
ledger_gate = load(OUT / 'host/root-ledger-before-first-job.json')
fresh_age = ledger_gate['measured']['time'] - admission['admission']['admittedAtEpochSeconds']
assert 0 <= fresh_age <= 300
samples, terminals = [], []
for path in (OUT / 'host').glob('*-resources.jsonl'):
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    assert rows[-1]['phase'] == 'terminal' and rows[-1]['terminalObserved'] is True
    samples.extend(rows)
    terminals.append({'file': path.name, 'returnCode': rows[-1]['returnCode'], 'logBytes': rows[-1]['logBytes']})
assert len(terminals) == 8
assert all(v['freeBytes'] >= 2147483648 and v['ownPhysicalBytes'] <= 67108864 and v['logBytes'] <= 16777216 for v in samples)
stopped = load(OUT / 'host/runner-after-stop.json')
assert stopped['state']['Running'] is False and stopped['state']['OOMKilled'] is False
readback = load(OUT / 'readback-verified.json')
assert readback['allDownloadedSha256Matched'] and readback['eightFrozenInputHashesUnchanged']

analysis = {
    'sourceCommit': 'e1fb1b28420a62acca17ddd69f1e72b3a9d27907',
    'packetCommit': 'e121dff8be5d5df5652e76d187751bf5894e9746',
    'result': {'attempted': 48, 'passed': 41, 'failed': 7, 'groups': groups},
    'failedCases': failures, 'passedNativeCases': passed_names,
    'observedDiagnostic': 'Pending-tenant child esbuild/Go OS-thread creation failed (errno=11/newosproc); six native kill cases lack checkpoints.',
    'causeLimit': 'Consistent with thread/process capacity pressure under the configured 96-PID profile; no pids.events or peak-thread receipt establishes the exact limit, and six failed child results were not retained before checkpoint read.',
    'reviewProcessReceiptsVerified': review_receipts, 'fourHttpFaultRouteConditionsVerified': True,
    'nativeKillCasesNotEstablished': missing, 'tenantFlagReplayNotEstablished': True,
    'finalPacketAnalyzerExecuted': False, 'lastFullMergedHashCheck': 'after passing review-regressions, before failing actual-native',
    'eightFrozenInputHashesUnchangedAfterRun': True, 'downloadedServerFilesShaMatched': readback['downloadedFiles'],
    'resourceSamples': len(samples), 'terminalStages': terminals,
    'minimumSampledFreeBytes': min(v['freeBytes'] for v in samples),
    'maximumSampledAccountedNewPhysicalBytes': max(v['ownPhysicalBytes'] for v in samples),
    'sampledStageWallSeconds': max(v['time'] for v in samples) - min(v['time'] for v in samples),
    'admissionAgeAtFirstVitestGateSeconds': fresh_age,
    'container': {'id': stopped['id'], 'running': False, 'oomKilled': False,
                  'cpuNano': identity['HostConfig']['NanoCpus'], 'memoryBytes': identity['HostConfig']['Memory'],
                  'pidsLimit': identity['HostConfig']['PidsLimit']},
    'retries': 0, 'sourceOrRunnerEdits': False, 'originalR2Result': '813 PASS / 6 FAIL unchanged',
    'qualification': 'A cooperating-writer source only; native process qualification incomplete; no B/F1/hardware/production adoption.'
}
(OUT / 'offline-analysis.json').write_text(json.dumps(analysis, indent=2) + '\n')
print(json.dumps({key: analysis[key] for key in ['result', 'resourceSamples', 'minimumSampledFreeBytes',
                                               'maximumSampledAccountedNewPhysicalBytes', 'sampledStageWallSeconds',
                                               'admissionAgeAtFirstVitestGateSeconds', 'finalPacketAnalyzerExecuted']}, indent=2))
