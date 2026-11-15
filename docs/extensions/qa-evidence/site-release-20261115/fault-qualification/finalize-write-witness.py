"""Readback correction only; never invokes/retries the helper or its child."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path('/run/tadazz-site-fault-wave-A-20261115')
SOURCE_SHA = 'e61cb021fa9019a9d86948880a683647faaa93472733eae89f78dbb2c2d39b5c'
NONCE = 'f8e1688d4d504cddbf90113c70c26998'
raw = (ROOT / 'run-fault-qualification.py').read_bytes()
assert hashlib.sha256(raw).hexdigest() == SOURCE_SHA
context = {'__name__': 'verified_original_witness', '__file__': str(ROOT / 'run-fault-qualification.py')}
exec(compile(raw, context['__file__'], 'exec'), context)
log = context['SHORT'] / NONCE / 'l'
identity = json.loads((log / 'identity.json').read_bytes())
fix = context['ROOT'] / 'fixtures' / ('atomic-3527-fault-' + NONCE)
hold_raw = (fix / 'control/production-operation-hold.json').read_bytes()
hold = json.loads(hold_raw)
trace = (log / 'native.strace').read_text()
outcome = json.loads((log / 'controller.stdout').read_bytes())
records = context['rows'](log / 'transcript.jsonl')
assert hold['targetId'] == identity['target'] and hold['execId']
assert hold['phase'] == 'stopped' and hold['exitCode'] == 1
assert hold['failure']['kind'] == 'storage-or-unknown' and hold['failure']['errno'] == 5
assert hold['failure']['phase'] == 'backup' and hold['failure']['failureJournal'] == 'written'
assert re.search(r'write\(.*?/backup/assets/.*? = -1 EIO .*\(INJECTED\)', trace)
assert outcome['coordinator']['status'] == 'indeterminate' and outcome['independentPostcheck'] == 'verified'
assert any(r['kind'] == 'exec-inspect-delivered' and r.get('execId') == hold['execId'] and r.get('running') is True for r in records)
assert any(r['kind'] == 'exec-inspect-delivered' and r.get('execId') == hold['execId'] and r.get('running') is False and r.get('exitCode') == 1 for r in records)
assert records[-1]['state']['createWritten'] == 1 and records[-1]['state']['startWritten'] == 1
assert records[-1]['state']['activeConnections'] == 0
module = context['load_helper'](log / 'atomic-web-publish.py')
eligibility = {action: module.recovery_eligible(hold, action) for action in ('publish', 'rollback', 'reconcile')}
assert not any(eligibility.values())
protected = json.loads((ROOT / 'protected-before.json').read_bytes())
assert context['protected_snapshot']() == protected
baseline = json.loads((fix / 'operator/base-web-inventory.json').read_bytes())['files']
assert context['inventory'](identity['target']) == baseline
assert context['sha']((fix / 'control/hq-lease.json').read_bytes()) == hold['leaseHash']
for role, started in (('target', 'targetStarted'), ('controller', 'controllerStarted')):
    obj = context['inspect'](identity[role])
    assert obj['State']['StartedAt'] == identity[started] and obj['State']['Running']
    assert not (obj.get('ExecIDs') or [])
context['command'](['/usr/bin/systemctl', 'stop', 'tadazz-atomic-proxy-' + NONCE + '.service'], timeout=210)
assert context['rows'](log / 'transcript.jsonl')[-1]['kind'] == 'final'
for role in ('controller', 'target'):
    context['docker']('stop', '--time=10', identity[role])
result = {'status': 'PASS_SCOPED_NATIVE_WRITE_EIO_READBACK', 'mode': 'native-write-eio', 'nonce': NONCE,
          'target': identity['target'], 'controller': identity['controller'], 'execId': hold['execId'],
          'terminalChildExitCode': 1, 'hold': hold, 'holdSha256': context['sha'](hold_raw),
          'coordinator': outcome, 'sourceEligibilityOnly_noRetry': eligibility, 'live': baseline,
          'protected': protected, 'transcriptSha256': context['sha']((log / 'transcript.jsonl').read_bytes()),
          'nativeTraceSha256': context['sha']((log / 'native.strace').read_bytes()),
          'readbackCorrection': 'Original verifier expected EIO (INJECTED); actual strace emits EIO (Input/output error) (INJECTED). Corrected regex validates original native failure. No helper action replayed.',
          'limitations': 'Ptrace-injected native syscall EIO; not physical disk EIO or post-index-replace durability evidence.',
          'growthAfter': context['growth_sample']()}
context['write'](log / 'result.json', result)
print(json.dumps({'status': result['status'], 'execId': hold['execId'], 'holdPhase': hold['phase'], 'errno': 5}))
