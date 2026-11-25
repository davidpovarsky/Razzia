"""Seal failed instrumentation evidence; no helper invocation or hold change."""
import hashlib
import json
from pathlib import Path

source = Path('/run/tadazz-site-fault-wave-A-20261115/run-fault-qualification.py')
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == 'e61cb021fa9019a9d86948880a683647faaa93472733eae89f78dbb2c2d39b5c'
ctx = {'__name__': 'readback_only', '__file__': str(source)}
exec(compile(raw, str(source), 'exec'), ctx)
nonce = '2a3e9f85a62f40bfa452c29028d174da'
log = ctx['SHORT'] / nonce / 'l'
identity = json.loads((log / 'identity.json').read_bytes())
fix = ctx['ROOT'] / 'fixtures' / ('atomic-3527-fault-' + nonce)
hold_raw = (fix / 'control/production-operation-hold.json').read_bytes()
hold = json.loads(hold_raw)
records = ctx['rows'](log / 'transcript.jsonl')
assert hold['phase'] == 'start-intent' and hold['targetId'] == identity['target']
assert not (log / 'native.strace').exists()
assert records[-1]['state']['createWritten'] == records[-1]['state']['startWritten'] == 1
assert records[-1]['state']['startDelivered'] == 0 and records[-1]['state']['activeConnections'] == 0
module = ctx['load_helper'](log / 'atomic-web-publish.py')
terminal = module.EngineAdapter().inspect(hold['execId'], identity['target'])
assert terminal['running'] is False and terminal['exitCode'] == 1
assert not any(module.recovery_eligible(hold, a) for a in ('publish', 'rollback', 'reconcile'))
baseline = json.loads((fix / 'operator/base-web-inventory.json').read_bytes())['files']
assert ctx['inventory'](identity['target']) == baseline
protected = json.loads(Path('/run/tadazz-site-fault-wave-A-20261115/protected-before.json').read_bytes())
assert ctx['protected_snapshot']() == protected
for role, started in (('target', 'targetStarted'), ('controller', 'controllerStarted')):
    obj = ctx['inspect'](identity[role])
    assert obj['State']['Running'] and obj['State']['StartedAt'] == identity[started] and not (obj.get('ExecIDs') or [])
ctx['command'](['/usr/bin/systemctl', 'stop', 'tadazz-atomic-proxy-' + nonce + '.service'], timeout=210)
for role in ('controller', 'target'):
    ctx['docker']('stop', '--time=10', identity[role])
result = {'status': 'INCONCLUSIVE_NATIVE_INSTRUMENTATION_BEFORE_STDIN', 'mode': 'native-readonly-erofs',
          'nonce': nonce, 'target': identity['target'], 'controller': identity['controller'],
          'execId': hold['execId'], 'terminal': terminal, 'hold': hold,
          'holdSha256': ctx['sha'](hold_raw), 'live': baseline,
          'sourceEligibilityOnly_noRetry': {a: module.recovery_eligible(hold, a) for a in ('publish', 'rollback', 'reconcile')},
          'transcriptSha256': ctx['sha']((log / 'transcript.jsonl').read_bytes()), 'protected': protected,
          'reason': 'Pre-ACK native child identity gate failed without raw PID-state logging. No ACK/payload delivered; no native syscall trace. No EROFS qualification claimed; future attempt uses a fresh nonce with bounded read-only PID observations.',
          'diagnostic': 'One separate read-only Python standard-library import/version probe succeeded; it was not a publisher retry and made no release-control change.',
          'growthAfter': ctx['growth_sample']()}
ctx['write'](log / 'result.json', result)
print(json.dumps({'status': result['status'], 'execId': hold['execId'], 'terminal': terminal}))
