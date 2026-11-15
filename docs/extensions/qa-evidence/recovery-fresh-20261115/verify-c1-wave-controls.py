"""Local control-validation tests. No subprocess, app import, fixture or server IO."""
import copy
import hashlib
import importlib.util
import json
import pathlib
import sys
import time

sys.dont_write_bytecode = True
HERE = pathlib.Path(__file__).resolve().parent
packet = HERE / 'c1-server-packet5'
spec = importlib.util.spec_from_file_location('wave_control_base', packet / 'runner_base.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
plan = json.loads((packet / 'plan.json').read_bytes())
sha = lambda value: hashlib.sha256(value).hexdigest()
now = time.time()
ledger_path = pathlib.Path(plan['resourceAdmission']['directory']) / 'synthetic-control-unit.ledger.json'
admission_path = ledger_path.with_name('synthetic-control-unit.admission.json')
packet_hash = sha((packet / 'packet-hashes.json').read_bytes())
ledger = {'schemaVersion': 1, 'snapshotId': 'local-unit-no-server-authority',
          'issuerThreadId': plan['resourceAdmission']['delegatedIssuerThreadId'],
          'sourceCommit': plan['sourceCommit'], 'packetHashesSha256': packet_hash,
          'capturedAtEpochSeconds': now, 'expiresAtEpochSeconds': now + 300,
          'lanes': [{'laneId': 'Recovery-C1', 'cpuGrant': .25, 'memoryGrantBytes': 2147483648,
                     'newPhysicalBudgetBytes': 67108864, 'consumedPhysicalBytes': 782336}],
          'aggregate': {'approvedCpu': 1.5, 'approvedMemoryBytes': 8192 * 1024**2,
                        'retainedSharedMetadataBytesOnce': 435 * 1024**2},
          'disk': {'floorBytes': 2147483648, 'futureReserveBytes': 0, 'marginBytes': 64 * 1024**2},
          'ram': {'minimumHostAvailableBytes': 2147483648}}
grant = {'issuerThreadId': ledger['issuerThreadId'], 'executionAuthorized': True,
         'sourceDisposition': 'APPROVE_WITH_EXACT_GATES',
         'packetDisposition': 'OWNER_AUTHORIZED_ISOLATED_ITERATION',
         'parentAuthorization': plan['parentAuthorization'], 'syntheticFixtureOnly': True,
         'independentReviewClaimed': False, 'admittedAtEpochSeconds': now,
         'sourceCommit': plan['sourceCommit'],
         'packetManifestSha256': sha((packet / 'manifest.json').read_bytes()),
         'packetHashesSha256': packet_hash, 'laneLedgerPath': str(ledger_path),
         'laneLedgerSnapshotId': ledger['snapshotId']}


def trial(name, mutate, should_pass):
    current_grant, current_ledger = copy.deepcopy(grant), copy.deepcopy(ledger)
    mutate(current_grant, current_ledger)
    ledger_hash = sha(json.dumps(current_ledger).encode())
    current_grant['laneLedgerSha256'] = ledger_hash
    runner = module.Runner(packet)
    runner.read_control = lambda path: ((current_grant, 'local-admission') if path == admission_path
                                       else (current_ledger, ledger_hash))
    try:
        runner.load_controls(admission_path)
    except RuntimeError as error:
        assert not should_pass, (name, str(error))
        return {'case': name, 'result': 'PASS', 'rejection': str(error)}
    assert should_pass, name + ' unexpectedly admitted'
    return {'case': name, 'result': 'PASS'}


results = [trial('current developer synthetic successor accepted', lambda g, l: None, True)]
for name, key, value in [
    ('retired issuer refused', 'issuerThreadId', '01a1dd18-8818-7573-b311-f54bbe0b811f'),
    ('production scope refused', 'syntheticFixtureOnly', False),
    ('invented independent review refused', 'independentReviewClaimed', True),
    ('wrong owner provenance refused', 'parentAuthorization', {}),
    ('wrong source refused', 'sourceCommit', '0' * 40),
    ('wrong packet refused', 'packetHashesSha256', '0' * 64),
    ('expired admission refused', 'admittedAtEpochSeconds', now - 301),
]:
    results.append(trial(name, lambda g, l, k=key, v=value: g.update({k: v}), False))
results.append(trial('larger own memory grant refused', lambda g, l: l['lanes'][0].update(memoryGrantBytes=3 * 1024**3), False))
results.append(trial('aggregate CPU overflow refused', lambda g, l: l['aggregate'].update(approvedCpu=.125), False))
results.append(trial('lower disk floor refused', lambda g, l: l['disk'].update(floorBytes=2147483647), False))
report = {'localControlValidationCases': results, 'passed': len(results),
          'applicationTestsRun': 0, 'serverOperations': 0,
          'scope': 'Control content validation only; filesystem admission is exercised by the eventual native runner'}
out = HERE / 'c1-wave-control-validation.json'
assert not out.exists(), 'Never overwrite a previous result'
out.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'passed': len(results), 'applicationTestsRun': 0, 'serverOperations': 0}))
