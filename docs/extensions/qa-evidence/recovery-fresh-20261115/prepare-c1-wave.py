"""Bind the preserved controller to actual owner activation, without changing application inputs."""
import ast
import hashlib
import json
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
HQ = pathlib.Path('C:/Users/DAVID/Code/Codex-Agent-HQ/docs/tadazz')
version = int(sys.argv[1])
prior_bytes = int(sys.argv[2])
enable_init = len(sys.argv) > 3 and sys.argv[3] == 'init'
baseline_go = 'baseline-go' in sys.argv[3:]
assert version >= 5 and 0 <= prior_bytes < 64 * 1024**2
thread = os.environ['CODEX_THREAD_ID']
assert thread == '01a1dfa9-5c5a-7723-8993-110f2dfe4892'
source = HERE / 'c1-server-packet4'
target = HERE / ('c1-server-packet' + str(version))
target.mkdir()
old, new = 'packet4-owner', 'packet' + str(version) + '-wave'
sha = lambda data: hashlib.sha256(data).hexdigest()
lock = json.loads((source / 'packet-hashes.json').read_bytes())
for entry in lock['files']:
    data = (source / entry['path']).read_bytes()
    assert sha(data) == entry['sha256'] and len(data) == entry['size']
    (target / entry['path']).write_bytes(data)
activation = (HQ / 'restart-20261115/OWNER_ACTIVATION.md').read_bytes()
wave = (HQ / 'SINGLE_MANAGER_WAVE_RESTART_20261115.md').read_bytes()
plan = json.loads((target / 'plan.json').read_text().replace(old, new))
plan.update(initEnabled=enable_init, priorLeasePhysicalBytes=prior_bytes,
            parentAuthorization={'id': 'SINGLE_MANAGER_WAVE_RESTART_20261115',
                                 'issuedByThreadId': '01a1dfa1-57d8-7223-a965-2f4f31fe8b23',
                                 'activationSha256': sha(activation), 'waveSha256': sha(wave),
                                 'lane': 'B', 'developerThreadId': thread})
plan['resourceAdmission']['delegatedIssuerThreadId'] = thread
plan['resourceAdmission']['issuanceMode'] = 'DEVELOPER_OWNED_SYNTHETIC_OWNER_ACTIVATED_WAVE'
if baseline_go:
    plan['env'].pop('GOMAXPROCS')
    plan['tests'] = plan['tests'][:1]
    plan['diagnosticOnly'] = 'One old-Go-scheduler witness; native11 remains independently qualified by packet6'
    (target / 'analyze-results.cjs').write_text('''const fs = require('node:fs'), assert = require('node:assert/strict')
const result = JSON.parse(fs.readFileSync('/qa/results/failed-startup-witness.results.json'))
assert.equal(result.success, true)
assert.equal(result.numTotalTests, 11)
assert.equal(result.numPassedTests, 1)
assert.equal(result.numFailedTests, 0)
assert.equal(result.numPendingTests, 10)
const receipt = JSON.parse(fs.readFileSync('/qa/receipts/failed-startup-witness/actual-api-tenant-flag-replay.json'))
assert.equal(receipt.state, 'PASS')
assert.equal(receipt.interrupted.signal, 'SIGKILL')
assert.equal(receipt.interrupted.timedOut, false)
const pids = [receipt.interrupted.pid, ...receipt.runs.map(run => run.pid)]
assert.equal(new Set(pids).size, 3)
for (const run of receipt.runs) {
  assert.equal(run.pid, run.process.pid)
  assert.equal(run.process.code, 0)
  assert.equal(run.process.timedOut, false)
  assert.deepEqual(run.state, receipt.baseline)
}
console.log(JSON.stringify({diagnosticOnly: true, scheduler: 'GOMAXPROCS unset', selectedPassed: 1,
 explicitlyDeselected: 10, witnessPids: pids, applicationClaim: 'No new native11 or 48-case result'}))
''', encoding='utf-8', newline='\n')
(target / 'plan.json').write_text(json.dumps(plan, indent=2) + '\n', encoding='utf-8', newline='\n')
(target / 'manifest.json').write_text((source / 'manifest.json').read_text().replace(old, new), encoding='utf-8', newline='\n')
if version >= 6:
    # Actual packet5 /proc evidence names the pinned Node24 supervisor MainThread.
    # Bind the host PID to Docker's owned init identity; comm alone is not identity.
    runner = (target / 'runner_host.py').read_text()
    runner = runner.replace("and rows[0]['namespacePids'][-1:] == [1] and rows[0]['name'] == 'node'",
                            "and rows[0]['hostPid'] == self.pid_observer.init_pid\n"
                            "                         and rows[0]['namespacePids'][-1:] == [1]\n"
                            "                         and rows[0]['name'] in {'node', 'MainThread'}")
    runner = runner.replace("and {v['name'] for v in rows} == {'docker-init', 'node'}",
                            "and {v['name'] for v in rows} in ({'docker-init', 'node'}, {'docker-init', 'MainThread'})\n"
                            "                         and all(v['hostPid'] == self.pid_observer.init_pid or v['ppid'] == self.pid_observer.init_pid for v in rows)")
    runner = runner.replace("v['name'] == 'docker-init' and v['namespacePids'][-1:] == [1]",
                            "v['hostPid'] == self.pid_observer.init_pid and v['name'] == 'docker-init' and v['namespacePids'][-1:] == [1]")
    (target / 'runner_host.py').write_text(runner, encoding='utf-8', newline='\n')
for name in ['runner_base.py', 'runner_host.py', 'pid_observer.py', 'server-run.py']:
    ast.parse((target / name).read_bytes())
files = [{'path': v['path'], 'size': (target / v['path']).stat().st_size,
          'sha256': sha((target / v['path']).read_bytes())} for v in lock['files']]
lock.update(files=files, executionAuthorized=True,
            authorizationMeaning='Explicit owner wave activation; developer-issued isolated synthetic controls',
            totalTransferBytesExcludingThisHashFileAndActualAdmission=sum(v['size'] for v in files))
(target / 'packet-hashes.json').write_text(json.dumps(lock, indent=2) + '\n', encoding='utf-8', newline='\n')
lock_hash = sha((target / 'packet-hashes.json').read_bytes())
transport = (HERE / 'c1-transfer-packet4.py').read_text()
transport = transport.replace('c1-server-packet4', 'c1-server-packet' + str(version)).replace(old, new)
transport = transport.replace('a58db59bc7b9d3439ff57ff171a1ed2d79031b0815f4124700b1dd74923773eb', lock_hash)
transport = transport.replace('756662', str(sum(v['size'] for v in files)))
transport = transport.replace('c1-transfer-packet4', 'c1-transfer-packet' + str(version))
ast.parse(transport)
(HERE / ('c1-transfer-packet' + str(version) + '.py')).write_text(transport, encoding='utf-8', newline='\n')
print(json.dumps({'version': version, 'init': enable_init, 'packetHashesSha256': lock_hash,
                  'source': plan['src'], 'priorLeasePhysicalBytes': prior_bytes}))
