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
(target / 'plan.json').write_text(json.dumps(plan, indent=2) + '\n', encoding='utf-8', newline='\n')
(target / 'manifest.json').write_text((source / 'manifest.json').read_text().replace(old, new), encoding='utf-8', newline='\n')
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
