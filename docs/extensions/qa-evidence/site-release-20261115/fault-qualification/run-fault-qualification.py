"""Single-use, fresh synthetic fixtures. No production mutation or uncertain retry."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time

ROOT = Path('/home/ubuntu/tadazz-hq-qa-20261115')
UPLOAD = ROOT / 'evidence/site-fault-A-20261115'
RUN = Path('/run/tadazz-site-fault-wave-A-20261115')
SHORT = Path('/run/tadazz-atomic-qa')
OPERATOR = Path('/home/ubuntu/tadazz-unified-site-20261115-31b3cb0')
HELPER = '352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2'
DRIVER = '88e1ce3a89edd45eccaf856e10adeabd17dd59b47f95cc7bd240518124877b26'
PROXY = 'e67cdd506f67fb8f93dcefe6c2a615a6862b532132ceeb4362f57658ea86d3cc'
RECEIPT = 'ff28b4363b86e3f7430ccc895872d0390c5943c6955f8f5e9003b83232ab99d9'
PAYLOAD = 'da1144d4c78ce7b1d377c56302074e60135ee9755ce03c7c34cf2e9cbf504827'
IMAGE = 'sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346'
CONTROLLER_IMAGE = 'sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647'
OWNER = '01a1dfa9-3316-7a02-afef-3dccd5939e79'
CASES = [
    ('e56ad13c4b404aa7a752e0c6e822a61d', 'drop-start-ack'),
    ('f8e1688d4d504cddbf90113c70c26998', 'native-write-eio'),
    ('83e631a8f8b94f469665beef772b02b8', 'native-fsync-eio'),
    ('2a3e9f85a62f40bfa452c29028d174da', 'native-readonly-erofs'),
]
PROTECTED_IDS = ['dd1401638311a15212e52dcf0153b759003feb83fbce89c6b2756c9ff6732891',
                 'c29ea46f10ff6da76428b2f296ff1468c512ec9e2af76eba552d7a144766b202',
                 '505772e38a7c0ecd700f82d189219f0b951a7cc95eb933ea58372ccf72b1fab8',
                 '701c07ef1fab02d5772fb2af15b733f0fdd5383a170c46da69fb3a529f343757',
                 '06144b29108376b584e0cdb2377e397c48ab7a37c3395481ee4fdae08d908ee6']
ENV = {'PATH': '/usr/bin:/bin', 'HOME': '/nonexistent', 'DOCKER_CONFIG': '/nonexistent'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def command(args, timeout=30):
    return subprocess.check_output(args, env=ENV, timeout=timeout)


def docker(*args):
    return command(['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', *args])


def write(path, data, mode=0o600, uid=0):
    if not isinstance(data, bytes):
        data = (json.dumps(data, sort_keys=True) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        os.fchown(fd, uid, uid)
        view = memoryview(data)
        while view:
            count = os.write(fd, view)
            if count <= 0:
                raise OSError('short evidence write')
            view = view[count:]
        os.fsync(fd)
    finally:
        os.close(fd)
    parent = os.open(Path(path).parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)


def directory(path, uid=0):
    os.mkdir(path, 0o700)
    os.chown(path, uid, uid)


def read_pinned(path, pin, limit=262144):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise ValueError('unsafe pinned source')
        raw = os.read(fd, limit + 1)
        if len(raw) != info.st_size or sha(raw) != pin:
            raise ValueError('source pin mismatch')
        return raw
    finally:
        os.close(fd)


def inspect(cid):
    return json.loads(docker('inspect', cid))[0]


def protected_snapshot():
    values = []
    for cid in PROTECTED_IDS:
        obj = inspect(cid)
        values.append({'id': obj['Id'], 'image': obj['Image'], 'started': obj['State']['StartedAt'],
                       'running': obj['State']['Running'], 'pid': obj['State']['Pid']})
    return values


def load_helper(path):
    raw = read_pinned(path, HELPER)
    spec = importlib.util.spec_from_file_location('frozen_native_fault_' + str(time.time_ns()), path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    return module


def inventory(cid):
    obj = inspect(cid)
    if obj['Id'] in PROTECTED_IDS or not obj['State']['Running']:
        raise ValueError('not a running fresh synthetic target')
    web = Path('/proc') / str(obj['State']['Pid']) / 'root/app/web'
    result = {}
    for parent, dirs, files in os.walk(web, followlinks=False):
        for name in dirs + files:
            info = os.lstat(Path(parent) / name)
            if not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
                raise ValueError('special web entry')
        for name in files:
            path = Path(parent) / name
            result[path.relative_to(web).as_posix()] = sha(path.read_bytes())
    return result


def rows(path):
    if not path.exists():
        return []
    raw = path.read_bytes()
    return [json.loads(line) for line in raw.splitlines() if line.endswith(b'}')]


def growth_sample():
    seen, total, overlay, targets = set(), 0, 0, []

    def walk(path):
        nonlocal total
        info = os.lstat(path)
        key = (info.st_dev, info.st_ino)
        if key in seen:
            return
        seen.add(key)
        # These inodes predate this phase; new hard links allocate no body blocks.
        if stat.S_ISREG(info.st_mode):
            for nonce, _ in CASES:
                prefix = ROOT / 'fixtures' / ('atomic-3527-fault-' + nonce) / 'operator/web'
                if Path(path).is_relative_to(prefix):
                    original = OPERATOR / 'web' / Path(path).relative_to(prefix)
                    old = os.lstat(original)
                    if key != (old.st_dev, old.st_ino):
                        raise ValueError('artifact alias is not existing inode')
                    return
        total += info.st_blocks * 512
        if stat.S_ISDIR(info.st_mode):
            for child in os.scandir(path):
                walk(child.path)
    for nonce, _ in CASES:
        fix, phase = ROOT / 'fixtures' / ('atomic-3527-fault-' + nonce), SHORT / nonce
        for path in (fix, phase):
            if path.exists():
                walk(path)
        receipt = phase / 'l/created.json'
        if receipt.exists():
            record = json.loads(receipt.read_bytes())
            for key in ('target', 'controller'):
                cid = record[key]
                if cid in PROTECTED_IDS:
                    raise ValueError('protected accounting identity')
                obj = json.loads(docker('inspect', '--size', cid))[0]
                targets.append({'id': cid, 'sizeRwProxyBytes': obj['SizeRw']})
                overlay += obj['SizeRw']
                walk(Path('/var/lib/docker/containers') / cid)
    walk(UPLOAD)
    allowance = 4 * 1024 * 1024
    charged = total + overlay + allowance
    fs = os.statvfs(ROOT)
    free = fs.f_bavail * fs.f_frsize
    if charged > 24 * 1024 * 1024 or 160575488 + 1048576 + charged > 200 * 1024 * 1024 or free < 2 * 1024**3:
        raise ValueError('fault-phase growth or shared disk floor exceeded')
    return {'allocatedOwnedBytesExcludingExistingArtifactInodes': total,
            'dockerSizeRwProxyBytes': overlay, 'metadataFinalExportAllowanceBytes': allowance,
            'conservativeChargedBytes': charged, 'freeBytes': free, 'containers': targets,
            'method': 'inode dedup; existing artifact hard-link bodies excluded with inode identity proof; container logical SizeRw proxy plus4MiB allowance; sampled, not hard physical quota'}


def trace_child(proxy, request, target, mode, log):
    eid = request['execId']
    status, raw = proxy.json_request('GET', '/v1.52/exec/' + eid + '/json')
    child = json.loads(raw)
    pid = child['Pid']
    if status != 200 or child['ID'] != eid or child['ContainerID'] != target or not child['Running'] or pid != request['hostPid']:
        raise ValueError('native trace exec mismatch')
    proc = Path('/proc') / str(pid)
    cgroup = (proc / 'cgroup').read_text()
    if ('docker-' + target + '.scope') not in cgroup and ('/' + target + '/') not in cgroup:
        raise ValueError('native trace cgroup mismatch')
    cmd = (proc / 'cmdline').read_bytes().rstrip(b'\0').split(b'\0')
    if cmd != [b'python3', b'-B', b'-c', proxy.inner_literal(log / 'atomic-web-publish.py').encode(), b'publish']:
        raise ValueError('native trace command mismatch')
    args = ['/usr/bin/strace', '-p', str(pid), '-s', '128', '-yy', '-e', 'trace=%file,write,fsync', '-o', str(log / 'native.strace')]
    if mode == 'native-write-eio':
        args += ['-e', 'inject=write:error=EIO:when=1']
    if mode == 'native-fsync-eio':
        args += ['-e', 'inject=fsync:error=EIO:when=4']
    stderr = open(log / 'strace.stderr', 'xb')
    trace = subprocess.Popen(args, env=ENV, stdout=subprocess.DEVNULL, stderr=stderr)
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if trace.poll() is not None:
            raise ValueError('native tracer failed to attach')
        status_text = (proc / 'status').read_text()
        if re.search(r'^TracerPid:\s+' + str(trace.pid) + r'\s*$', status_text, re.M):
            write(log / 'trace-ready.json', {'execId': eid, 'hostPid': pid, 'target': target, 'mode': mode, 'tracerPid': trace.pid}, 0o400)
            return trace, stderr
        time.sleep(0.02)
    raise ValueError('native tracer attach unproven')


def prepare(nonce, mode, sources):
    fix = ROOT / 'fixtures' / ('atomic-3527-fault-' + nonce)
    directory(fix, 1001)
    op, control = fix / 'operator', fix / 'control'
    directory(op, 1001)
    directory(control, 1001)
    for name in ('base-web-inventory.json', 'candidate-web-inventory.json', 'artifact.sha256'):
        write(op / name, (OPERATOR / name).read_bytes(), 0o664, 1001)
    directory(op / 'web', 1001)
    # Existing immutable public artifact inodes are referenced, never edited or recopied.
    aliases = []
    for parent, dirs, files in os.walk(OPERATOR / 'web', followlinks=False):
        relative = Path(parent).relative_to(OPERATOR / 'web')
        for name in dirs:
            if not stat.S_ISDIR(os.lstat(Path(parent) / name).st_mode):
                raise ValueError('artifact directory not regular')
            directory(op / 'web' / relative / name, 1001)
        for name in files:
            src, dest = Path(parent) / name, op / 'web' / relative / name
            if not stat.S_ISREG(os.lstat(src).st_mode):
                raise ValueError('artifact special file')
            os.link(src, dest, follow_symlinks=False)
            info = os.stat(src)
            aliases.append({'path': str(dest), 'source': str(src), 'dev': info.st_dev, 'inode': info.st_ino, 'bytes': info.st_size})
    write(fix / 'artifact-existing-inode-aliases.json', aliases, 0o400, 1001)
    write(fix / 'atomic-web-publish.py', sources['helper'], 0o400, 1001)
    write(fix / 'driver.py', sources['driver'], 0o400, 1001)
    write(control / 'public-file-sizes-and-controls.json', sources['receipt'], 0o400, 1001)
    write(control / 'qa-release.lock', b'', 0o600, 1001)
    phase = SHORT / nonce
    directory(phase)
    directory(phase / 's')
    directory(phase / 'l')
    log = phase / 'l'
    write(log / 'atomic-web-publish.py', sources['helper'], 0o400)
    write(log / 'fault-proxy.py', sources['proxy'], 0o400)
    args = ['create', '--name', 'tadazz-atomic-qa-' + nonce, '--label', 'codex.synthetic.nonce=' + nonce,
            '--label', 'codex.synthetic.role=app', '--network', 'none', '--cpus=.25', '--memory=256m',
            '--memory-swap=256m', '--ipc=private', '--cgroupns=private',
            '--tmpfs', '/app/config:rw,nosuid,nodev,size=128m,mode=0700']
    if mode == 'native-readonly-erofs':
        args.append('--read-only')
    target = docker(*args, IMAGE, 'sleep', 'infinity').decode().strip()
    controller = docker('create', '--name', 'tadazz-atomic-controller-' + nonce,
                        '--label', 'codex.synthetic.nonce=' + nonce, '--label', 'codex.synthetic.role=controller',
                        '--network', 'none', '--cpus=.0625', '--memory=512m', '--memory-swap=512m',
                        '--read-only', '--security-opt=no-new-privileges:true', '--ipc=private', '--cgroupns=private',
                        '--mount', 'type=bind,src=' + str(fix) + ',dst=' + str(fix) + ',readonly',
                        '--mount', 'type=bind,src=' + str(control) + ',dst=' + str(control),
                        '--mount', 'type=bind,src=' + str(phase / 's') + ',dst=/var/run,readonly',
                        CONTROLLER_IMAGE, 'sleep', 'infinity').decode().strip()
    if target in PROTECTED_IDS or controller in PROTECTED_IDS or target == controller or not all(re.fullmatch('[0-9a-f]{64}', x) for x in (target, controller)):
        raise ValueError('invalid new target/controller')
    write(log / 'created.json', {'target': target, 'controller': controller, 'nonce': nonce, 'mode': mode})
    docker('start', target)
    docker('start', controller)
    a, c = inspect(target), inspect(controller)
    module = load_helper(log / 'atomic-web-publish.py')
    payload = module.build_payload(op, control)
    if sha(payload) != PAYLOAD:
        raise ValueError('new fixture payload mismatch')
    lease = {'targetId': target, 'image': IMAGE, 'started': a['State']['StartedAt'], 'helper': HELPER,
             'nonce': nonce, 'actions': ['publish', 'rollback', 'reconcile'], 'inputHash': PAYLOAD,
             'issuedBy': OWNER, 'parentAuthorization': 'SINGLE_MANAGER_WAVE_RESTART_20261115; current manager fault qualification direction'}
    write(control / 'hq-lease.json', lease, 0o600, 1001)
    lease_hash = sha((control / 'hq-lease.json').read_bytes())
    write(fix / 'pinned-target.json', {'id': target, 'name': 'tadazz-atomic-qa-' + nonce, 'nonce': nonce,
                                      'started': a['State']['StartedAt'], 'payloadSha256': PAYLOAD, 'leaseSha256': lease_hash}, 0o400, 1001)
    write(log / 'identity.json', {'target': target, 'targetStarted': a['State']['StartedAt'],
                                 'controller': controller, 'controllerStarted': c['State']['StartedAt'],
                                 'mode': mode, 'nonce': nonce, 'leaseSha256': lease_hash, 'helper': HELPER,
                                 'proxy': PROXY, 'driver': DRIVER, 'payload': PAYLOAD,
                                 'note': 'fault-only sleep fixtures, not running game-server/browser acceptance'})
    return fix, log, a, c, module


def case(nonce, mode, sources, protected):
    fs = os.statvfs(ROOT)
    if fs.f_bavail * fs.f_frsize < 2 * 1024**3 + 24 * 1024**2:
        raise ValueError('actual disk headroom')
    fix, log, target, controller, module = prepare(nonce, mode, sources)
    spec = importlib.util.spec_from_file_location('scoped_proxy_' + nonce, log / 'fault-proxy.py')
    proxy = importlib.util.module_from_spec(spec)
    exec(compile(sources['proxy'], str(log / 'fault-proxy.py'), 'exec'), proxy.__dict__)
    proxy.check_target(target, target['Id'], nonce, target['State']['StartedAt'])
    proxy.check_controller(controller, controller['Id'], nonce, controller['State']['StartedAt'], fix, log.parent / 's')
    baseline = json.loads((fix / 'operator/base-web-inventory.json').read_bytes())['files']
    before = inventory(target['Id'])
    if before != baseline:
        raise ValueError('fresh target baseline mismatch')
    write(log / 'before.json', {'live': before, 'protected': protected})
    write(log / 'growth-before.json', growth_sample())
    unit = 'tadazz-atomic-proxy-' + nonce + '.service'
    properties = ['Type=exec', 'User=root', 'CPUQuota=12.5%', 'MemoryMax=128M', 'MemorySwapMax=0',
                  'TasksMax=32', 'RuntimeMaxSec=600', 'TimeoutStopSec=200', 'NoNewPrivileges=yes',
                  'CapabilityBoundingSet=', 'AmbientCapabilities=', 'ProtectSystem=strict', 'PrivateTmp=yes',
                  'PrivateNetwork=yes', 'RestrictAddressFamilies=AF_UNIX', 'ProtectKernelTunables=yes',
                  'ProtectControlGroups=yes', 'ProtectKernelModules=yes', 'LockPersonality=yes',
                  'RestrictSUIDSGID=yes', 'ReadWritePaths=' + str(log.parent / 's'), 'ReadWritePaths=' + str(log)]
    argv = ['/usr/bin/systemd-run', '--quiet', '--unit=' + unit] + ['--property=' + p for p in properties]
    argv += ['/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', '/usr/bin/python3', '-I', '-B', str(log / 'fault-proxy.py'),
             '--target', target['Id'], '--target-started', target['State']['StartedAt'],
             '--controller', controller['Id'], '--controller-started', controller['State']['StartedAt'],
             '--nonce', nonce, '--mode', mode]
    command(argv)
    deadline = time.monotonic() + 20
    while not any(row['kind'] == 'ready' for row in rows(log / 'transcript.jsonl')):
        if time.monotonic() >= deadline:
            raise ValueError('proxy not ready; no action dispatched')
        time.sleep(0.1)
    stdout, stderr = open(log / 'controller.stdout', 'xb'), open(log / 'controller.stderr', 'xb')
    dispatch = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'exec', '-e', 'QA_SYNTHETIC_NONCE=' + nonce,
                controller['Id'], 'python3', '-I', '-B', str(fix / 'driver.py'), 'action', 'publish']
    write(log / 'dispatch-intent.json', {'argv': dispatch, 'calls': 1, 'timeNs': time.time_ns()})
    child = subprocess.Popen(dispatch, env=ENV, stdout=stdout, stderr=stderr)
    trace = trace_stderr = None
    deadline = time.monotonic() + 240
    while child.poll() is None:
        transcript = rows(log / 'transcript.jsonl')
        requests = [r for r in transcript if r['kind'] == 'native-trace-request']
        if requests and trace is None:
            trace, trace_stderr = trace_child(proxy, requests[0], target['Id'], mode, log)
        if time.monotonic() >= deadline:
            write(log / 'inconclusive.json', {'reason': 'observer deadline; controller/child not proven stopped', 'controllerPid': child.pid})
            raise ValueError('INCONCLUSIVE; preserve running resources, no retry')
        time.sleep(0.05)
    stdout.close()
    stderr.close()
    if trace is not None:
        trace.wait(timeout=15)
        trace_stderr.close()
    outcome = json.loads((log / 'controller.stdout').read_bytes())
    hold_raw = (fix / 'control/production-operation-hold.json').read_bytes()
    hold = json.loads(hold_raw)
    eid = hold['execId']
    code, raw = proxy.json_request('GET', '/v1.52/exec/' + eid + '/json')
    final = json.loads(raw)
    if code != 200 or final['ID'] != eid or final['ContainerID'] != target['Id'] or final['Running'] is not False:
        raise ValueError('terminal child identity not proven; no resource stop/retry')
    after = inventory(target['Id'])
    if after != baseline or protected_snapshot() != protected:
        raise ValueError('live/protected preservation mismatch')
    transcript = rows(log / 'transcript.jsonl')
    if not transcript or transcript[-1]['state']['createWritten'] != 1 or transcript[-1]['state']['startWritten'] != 1:
        raise ValueError('not exactly one native create/start')
    if outcome['coordinator']['status'] != 'indeterminate' or child.returncode != 1:
        raise ValueError('unexpected failure disposition')
    if mode == 'drop-start-ack':
        if hold['phase'] != 'start-intent' or not any(r['kind'] == 'real-running-before-drop' and r['downstreamAckBytes'] == 0 and r['upstreamStdinBytes'] == 0 for r in transcript):
            raise ValueError('lost acknowledgement not demonstrated')
    else:
        if hold['phase'] != 'stopped' or hold['failure']['kind'] != 'storage-or-unknown' or hold['exitCode'] != 1:
            raise ValueError('native failure hold disposition')
        native = (log / 'native.strace').read_text()
        if mode == 'native-readonly-erofs':
            if 'EROFS' not in native or '(INJECTED)' in native:
                raise ValueError('kernel read-only witness missing')
        elif 'EIO (INJECTED)' not in native:
            raise ValueError('native injected syscall failure missing')
        if mode == 'native-fsync-eio' and not re.search(r'fsync\(.*?/backup/assets/.*?EIO \(INJECTED\)', native):
            raise ValueError('injected fsync was not the backup file fence')
    # Pure source eligibility evaluation only. No action is retried against an uncertain hold.
    eligible = {action: module.recovery_eligible(hold, action) for action in ('publish', 'rollback', 'reconcile')}
    if any(eligible.values()):
        raise ValueError('unsafe failed hold is recovery eligible')
    command(['/usr/bin/systemctl', 'stop', unit], timeout=210)
    final_rows = rows(log / 'transcript.jsonl')
    if not final_rows or final_rows[-1]['kind'] != 'final':
        raise ValueError('proxy final transcript missing')
    for obj in (controller, target):
        current = inspect(obj['Id'])
        if current['State']['StartedAt'] != obj['State']['StartedAt'] or current['Id'] in PROTECTED_IDS:
            raise ValueError('stop identity drift')
        docker('stop', '--time=10', obj['Id'])
    result = {'status': 'PASS_SCOPED_FAULT_WITNESS', 'mode': mode, 'nonce': nonce,
              'target': target['Id'], 'controller': controller['Id'], 'execId': eid,
              'controllerExitCode': child.returncode, 'terminalChildExitCode': final['ExitCode'],
              'hold': hold, 'holdSha256': sha(hold_raw), 'coordinator': outcome,
              'sourceEligibilityOnly_noRetry': eligible, 'live': after, 'protected': protected,
              'transcriptSha256': sha((log / 'transcript.jsonl').read_bytes()),
              'nativeTraceSha256': sha((log / 'native.strace').read_bytes()) if trace else None,
              'limitations': 'Lost ACK transport drop and EIO ptrace injections are induced, not spontaneous network/disk/hardware faults. Early backup-write/file-fence scope only; no post-index-replace failure or physical powerloss proof.'}
    result['growthAfter'] = growth_sample()
    write(log / 'result.json', result)
    print(json.dumps({'mode': mode, 'status': result['status'], 'execId': eid, 'holdPhase': hold['phase'],
                      'failureKind': hold.get('failure', {}).get('kind'), 'webFiles': len(after)}), flush=True)
    return result


def main():
    if os.geteuid() != 0 or not sys.flags.isolated or Path(__file__) != RUN / 'run-fault-qualification.py':
        raise ValueError('isolated root-controlled source required')
    group = Path('/proc/self/cgroup').read_text().strip()
    if not group.startswith('0::/') or 'site-fault-A-20261115.scope' not in group.split('/'):
        raise ValueError('host witness scope mismatch')
    limits = Path('/sys/fs/cgroup') / group[4:]
    quota, period = (limits / 'cpu.max').read_text().split()
    if quota == 'max' or int(quota) * 16 > int(period) or int((limits / 'memory.max').read_text()) > 128 * 1024 * 1024 or (limits / 'memory.swap.max').read_text().strip() != '0':
        raise ValueError('host witness resource limits')
    write(RUN / 'single-use-attempt.json', {'owner': OWNER, 'cases': CASES, 'startedNs': time.time_ns()})
    sources = {'helper': read_pinned(UPLOAD / 'atomic-web-publish.py', HELPER),
               'driver': read_pinned(UPLOAD / 'driver.py', DRIVER),
               'proxy': read_pinned(UPLOAD / 'fault-proxy.py', PROXY),
               'receipt': read_pinned(UPLOAD / 'public-file-sizes-and-controls.json', RECEIPT)}
    protected = protected_snapshot()
    write(RUN / 'protected-before.json', protected)
    results = [case(nonce, mode, sources, protected) for nonce, mode in CASES]
    if protected_snapshot() != protected:
        raise ValueError('protected final snapshot mismatch')
    write(RUN / 'summary.json', {'status': 'PASS_SCOPED_FOUR_NATIVE_ENGINE_CASES', 'results': results,
                                'helper': HELPER, 'driver': DRIVER, 'proxy': PROXY,
                                'no_production_mutation': True, 'no_uncertain_retry': True})


if __name__ == '__main__':
    main()
