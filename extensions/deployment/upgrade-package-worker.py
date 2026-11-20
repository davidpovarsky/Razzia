#!/usr/bin/env python3
"""Upgrade the existing package broker to one qualified, immutable toolchain.

Keeps the existing timer and base unit, retains private rollback copies, and
waits for an in-flight build instead of interrupting it. Emits no job contents.
"""
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

REVISION = 'c85690fffb0201ec09687f1ab0837c479853ec8e'
IMAGE = 'sha256:8295e3a3f00c78d0c5e0eb95679782d218db284e74dbff312d8607fb5b97140e'
SOURCE_SHA = 'b5cb4f5d9c252ca1638613f4c9e8ebe0f0f983d9c3d800ee37bbc145efb9492f'
UNIT_SHA = '7bfd2b44f2409588f162e278e2b3eb5a8671f61d81f1609ad29292608231559c'
TIMER_SHA = 'd64382e6a29a673708713944b6a0d56b8128f35ca7ba33a0c121b9271f24944d'
OLD_WORKER_SHA = '7b591a69dd4aca951cf0f8224670c797696979085ae23c01d596ab99159d60d6'
SOURCE = Path('/home/ubuntu/tadazz-package-worker-bms-c85690fffb02-20261120/source/scripts/qa/package-build-worker.py')
PROOF = SOURCE.parents[3] / 'latest-worker-proof.json'
UNIT = Path('/etc/systemd/system/tadazz-package-builder.service')
TIMER = Path('/etc/systemd/system/tadazz-package-builder.timer')
OLD_WORKER = Path('/opt/tadazz-package-runtime/package-build-worker.py')
RELEASE = Path('/opt/tadazz-package-runtime/releases') / REVISION
WORKER = RELEASE / 'package-build-worker.py'
DROPIN_DIR = Path('/etc/systemd/system/tadazz-package-builder.service.d')
DROPIN = DROPIN_DIR / '20-qualified-toolchain.conf'
REPORT = Path('/home/ubuntu/tadazz-package-worker-upgrade-c85690fffb02-20261120')
STORE = '/var/lib/tadazz-release-5312660/config/extensions/packages'


def need(value, code):
    if not value:
        raise RuntimeError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(argv, timeout=60):
    result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    need(result.returncode == 0, 'COMMAND_FAILED:' + argv[0])
    return result.stdout.strip()


def state(unit):
    return run(['systemctl', 'show', unit, '--property=ActiveState', '--value'])


def write_new(path, data, mode=0o600):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())


def main():
    need(os.geteuid() == 0, 'ROOT_REQUIRED')
    os.umask(0o077)
    lock = os.open('/run/lock/tadazz-mcp-deploy.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    for path, expected in [(SOURCE, SOURCE_SHA), (UNIT, UNIT_SHA), (TIMER, TIMER_SHA), (OLD_WORKER, OLD_WORKER_SHA)]:
        need(not path.is_symlink() and digest(path.read_bytes()) == expected, 'SOURCE_OR_UNIT_CHANGED')
    proof = json.loads(PROOF.read_text())
    accepted = proof['nativeAccept']
    need(proof['workerExit'] == 0 and proof['nativeAcceptExit'] == 0 and proof['image'] == IMAGE
         and accepted['phase'] == 'preview-ready' and accepted['mediaValidated'] is True
         and accepted['sourceDigest'] == '041e64a214f6121b3492b736956884495147be061988ed9285b3f179b89204b0'
         and accepted['buildDigest'] == '25f6b9b8bd5bd79ddcd0510471113aeb5ef67cc410f53fd05da52ffaed20245d',
         'REAL_WORKER_QUALIFICATION_REQUIRED')
    need(json.loads(run(['docker', 'image', 'inspect', IMAGE]))[0]['Id'] == IMAGE, 'IMAGE_CHANGED')
    need(not DROPIN.exists() and (not DROPIN_DIR.exists() or not list(DROPIN_DIR.iterdir())), 'EXISTING_OVERRIDE')
    need(state(TIMER.name) == 'active', 'TIMER_BASELINE_CHANGED')
    REPORT.mkdir(mode=0o700, exist_ok=False)
    for path in [UNIT, TIMER, OLD_WORKER]:
        write_new(REPORT / (path.name + '.before'), path.read_bytes())
    report = {'success': False, 'revision': REVISION, 'image': IMAGE, 'workerSha256': SOURCE_SHA,
              'baseUnitUnchanged': True, 'timerConfigurationUnchanged': True, 'phase': 'quiesce'}
    override_written = False
    try:
        run(['systemctl', 'stop', TIMER.name])
        for attempt in range(300):
            if state(UNIT.name) == 'inactive':
                break
            need(attempt < 299, 'IN_FLIGHT_BUILD_DID_NOT_FINISH')
            time.sleep(2)
        RELEASE.parent.mkdir(mode=0o755, exist_ok=True)
        RELEASE.mkdir(mode=0o700, exist_ok=False)
        write_new(WORKER, SOURCE.read_bytes())
        need(digest(WORKER.read_bytes()) == SOURCE_SHA, 'WORKER_COPY_MISMATCH')
        DROPIN_DIR.mkdir(mode=0o755, exist_ok=True)
        text = '[Service]\nExecStart=\nExecStart=/usr/bin/python3 ' + str(WORKER) + ' ' + STORE + ' --image ' + IMAGE + '\n'
        write_new(DROPIN, text.encode(), 0o644)
        override_written = True
        report['phase'] = 'load-qualified-worker'
        run(['systemctl', 'daemon-reload'])
        actual = run(['systemctl', 'show', UNIT.name, '--property=ExecStart', '--value'])
        need(str(WORKER) in actual and IMAGE in actual, 'WORKER_COMMAND_NOT_LOADED')
        run(['systemctl', 'start', UNIT.name], timeout=660)
        need(run(['systemctl', 'show', UNIT.name, '--property=Result', '--value']) == 'success'
             and run(['systemctl', 'show', UNIT.name, '--property=ExecMainStatus', '--value']) == '0', 'WORKER_RUN_FAILED')
        need(digest(UNIT.read_bytes()) == UNIT_SHA and digest(TIMER.read_bytes()) == TIMER_SHA, 'BASE_UNIT_RACED')
        run(['systemctl', 'start', TIMER.name])
        need(state(TIMER.name) == 'active', 'TIMER_NOT_RESUMED')
        report.update(success=True, phase='verified', timerActive=True, workerRunPassed=True)
    except Exception as error:
        report['failureCode'] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        if state(UNIT.name) in ['inactive', 'failed']:
            if override_written:
                write_new(REPORT / 'qualified-toolchain.failed.conf', DROPIN.read_bytes())
                DROPIN.rename(DROPIN.with_suffix('.disabled'))
                run(['systemctl', 'daemon-reload'])
            run(['systemctl', 'start', TIMER.name])
            report['rolledBack'] = True
        else:
            report['operatorReconciliationRequired'] = True
            report['timerLeftPaused'] = True
    finally:
        report['finishedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        write_new(REPORT / 'worker-upgrade-result.json', (json.dumps(report, indent=2) + '\n').encode())
        print(json.dumps(report))
        os.close(lock)
    return 0 if report['success'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
