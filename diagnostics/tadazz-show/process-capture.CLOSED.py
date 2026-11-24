#!/usr/bin/env python3
"""Run the one original tadazz-show shell block; observe only its owned process tree."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time

APP_HEAD = '1ec7dc5c9549651f1618390a21f8db7efae4ea6f'
ORIGINAL_COMMAND = b'evidence="work/ci-e2e/tadazz-show"\nmapfile -t files < "$evidence/selectors.txt"\npnpm test:e2e --config="playwright.tadazz-show.config.ts" "${files[@]}" --reporter=list,json,github\n'
SAMPLE_SECONDS = 1.0


def require(value, reason):
    if not value:
        raise AssertionError(reason)


def save(path, value):
    raw = (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()
    with path.open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


def read_stat(pid):
    text = Path('/proc', str(pid), 'stat').read_text()
    end = text.rfind(')')
    require(end > text.find('('), 'PROC_STAT_SHAPE')
    values = text[end + 2:].split()
    require(len(values) >= 22, 'PROC_STAT_FIELDS')
    return {'pid': pid, 'comm': text[text.find('(') + 1:end], 'state': values[0],
            'ppid': int(values[1]), 'processGroup': int(values[2]), 'session': int(values[3]),
            'userTicks': int(values[11]), 'systemTicks': int(values[12]),
            'threads': int(values[17]), 'startTicks': int(values[19]),
            'virtualBytes': int(values[20]), 'rssPages': int(values[21]),
            'exitWaitStatus': int(values[49]) if len(values) > 49 and values[0] in {'Z', 'X'} else None}


def children_of(pid):
    values = set()
    task_root = Path('/proc', str(pid), 'task')
    for task in task_root.iterdir():
        if task.name.isdecimal():
            try:
                values.update(int(item) for item in (task / 'children').read_text().split())
            except (FileNotFoundError, ProcessLookupError):
                continue
    return sorted(values)


def details(pid, start_ticks):
    root = Path('/proc', str(pid))
    value = {'command': root.joinpath('cmdline').read_bytes().split(b'\0'),
             'executable': os.readlink(root / 'exe'),
             'originalLimits': root.joinpath('limits').read_text()}
    value['command'] = [item.decode('utf-8', 'replace') for item in value['command'] if item]
    require(read_stat(pid)['startTicks'] == start_ticks, 'PID_CHANGED_DURING_DETAIL_READ')
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--command-file', required=True)
    parser.add_argument('--evidence', required=True)
    args = parser.parse_args()
    require(sys.platform == 'linux', 'LINUX_DIAGNOSTIC_ONLY')
    workspace = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    require(Path.cwd().resolve() == workspace, 'ORIGINAL_WORKSPACE_REQUIRED')
    command = Path(args.command_file).resolve(strict=True)
    require(command == workspace / 'diagnostic-source/diagnostics/tadazz-show/run-original-cases.sh',
            'EXACT_ORIGINAL_COMMAND_PATH_REQUIRED')
    require(command.read_bytes() == ORIGINAL_COMMAND, 'ORIGINAL_CASE_COMMAND_CHANGED')
    require(os.environ.get('DEBUG') == 'pw:browser', 'BROWSER_STDERR_DEBUG_REQUIRED')
    diagnostic = workspace / 'work/ci-e2e/tadazz-show/diagnostic'
    require(Path(os.environ['TADAZZ_SHOW_DIAGNOSTIC_DIR']).resolve() == diagnostic,
            'DIAGNOSTIC_DIRECTORY_CHANGED')
    evidence = Path(args.evidence)
    require(evidence.is_absolute() and evidence == diagnostic / 'process', 'OWNED_EVIDENCE_ONLY')
    require(not evidence.exists() and not evidence.is_symlink(), 'FRESH_PROCESS_EVIDENCE_REQUIRED')
    diagnostic.mkdir(parents=True, exist_ok=True)
    require(not diagnostic.is_symlink() and diagnostic.resolve() == diagnostic, 'DIAGNOSTIC_PATH_NOT_PLAIN')
    evidence.mkdir(mode=0o700)
    ticks = int(os.sysconf('SC_CLK_TCK'))
    page_bytes = int(os.sysconf('SC_PAGE_SIZE'))
    interpreter = Path(sys.executable).resolve(strict=True)
    safe_environment = {key: os.environ.get(key) for key in [
        'CI', 'GITHUB_ACTIONS', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA',
        'GITHUB_REF', 'RUNNER_OS', 'RUNNER_ARCH', 'ImageOS', 'ImageVersion',
        'TADAZZ_REMOTE_QA', 'GAME_SPEED', 'DEBUG', 'PLAYWRIGHT_JSON_OUTPUT_FILE',
        'TADAZZ_SHOW_DIAGNOSTIC_DIR']}
    save(evidence / 'intent.json', {
        'kind': 'ONE_1EC_SHOW_DIAGNOSTIC_PROCESS_CAPTURE', 'diagnosticOnly': True,
        'ciQualification': False, 'applicationRevision': APP_HEAD,
        'argv': ['/usr/bin/bash', '--noprofile', '--norc', '-e', '-o', 'pipefail', str(command)],
        'cwd': str(workspace), 'environmentSubset': safe_environment,
        'python': {'path': str(interpreter), 'version': sys.version,
                   'sha256': hashlib.sha256(interpreter.read_bytes()).hexdigest()},
        'wrapperSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'wrapperOriginalLimits': Path('/proc/self/limits').read_text(),
        'sampleSeconds': SAMPLE_SECONDS, 'clockTicksPerSecond': ticks, 'pageBytes': page_bytes,
        'newRuntimeTimeout': None, 'resourceLimitsChanged': False,
        'readScope': 'owned PID identities and their task/children only; no global process scan',
        'limitations': ['Sampling can miss short-lived descendants.',
                        'A missing PID is an observation, not a known exit code.',
                        'Summed RSS counts shared pages more than once.',
                        'Descendant wait statuses are recorded only if actually visible.']})
    stop = threading.Event()
    lock = threading.RLock()
    known = {}
    previous = {}
    sampler_errors = []
    exit_observations = []
    events_path = evidence / 'owned-processes.jsonl'
    events = events_path.open('x', encoding='utf-8', newline='\n')

    def emit(value):
        with lock:
            events.write(json.dumps(value, sort_keys=True) + '\n')
            events.flush()

    stdout = (evidence / 'stdout.log').open('xb')
    stderr = (evidence / 'stderr.log').open('xb')
    started = time.monotonic()
    child = subprocess.Popen(['/usr/bin/bash', '--noprofile', '--norc', '-e', '-o', 'pipefail', str(command)],
                             cwd=workspace, env=os.environ.copy(), stdout=stdout, stderr=stderr,
                             start_new_session=True)
    try:
        root_stat = read_stat(child.pid)
        known[child.pid] = root_stat['startTicks']
        emit({'event': 'rootStarted', 'atMonotonic': time.monotonic(), 'process': root_stat})
    except (FileNotFoundError, ProcessLookupError):
        emit({'event': 'rootExitedBeforeFirstSample', 'pid': child.pid})

    def forward(signum, _frame):
        emit({'event': 'incomingSignal', 'signal': signum, 'atMonotonic': time.monotonic()})
        if child.poll() is None:
            try:
                os.killpg(child.pid, signum)
            except ProcessLookupError:
                pass

    previous_handlers = {number: signal.signal(number, forward) for number in (signal.SIGINT, signal.SIGTERM)}

    def sample():
        now = time.monotonic()
        found = {}
        queue = list(known)
        seen = set()
        while queue:
            pid = queue.pop(0)
            if pid in seen:
                continue
            seen.add(pid)
            try:
                value = read_stat(pid)
                if pid in known and value['startTicks'] != known[pid]:
                    emit({'event': 'pidIdentityChanged', 'pid': pid, 'oldStartTicks': known[pid],
                          'newStartTicks': value['startTicks'], 'atMonotonic': now})
                    known.pop(pid, None)
                    previous.pop(pid, None)
                    continue
                found[pid] = value
                try:
                    child_pids = children_of(pid)
                except (FileNotFoundError, ProcessLookupError):
                    child_pids = []
                for descendant in child_pids:
                    try:
                        descendant_stat = read_stat(descendant)
                        parent_again = read_stat(pid)
                        if parent_again['startTicks'] != value['startTicks'] or descendant_stat['ppid'] != pid:
                            continue
                        if descendant not in known:
                            known[descendant] = descendant_stat['startTicks']
                            emit({'event': 'descendantDiscovered', 'process': descendant_stat,
                                  'parentStartTicks': value['startTicks'], 'atMonotonic': now})
                        if known.get(descendant) == descendant_stat['startTicks']:
                            queue.append(descendant)
                    except (FileNotFoundError, ProcessLookupError):
                        continue
            except (FileNotFoundError, ProcessLookupError):
                if pid in known:
                    gone = {'event': 'noLongerVisible', 'pid': pid, 'startTicks': known.pop(pid),
                            'atMonotonic': now, 'exitCode': None}
                    exit_observations.append(gone)
                    emit(gone)
                    previous.pop(pid, None)
        rows = []
        for pid, value in sorted(found.items()):
            value['rssBytes'] = value['rssPages'] * page_bytes
            value['cpuSeconds'] = (value['userTicks'] + value['systemTicks']) / ticks
            before = previous.get(pid)
            value['cpuPercentOneCoreSinceSample'] = (
                100 * (value['cpuSeconds'] - before[1]) / (now - before[0])
                if before and now > before[0] else None)
            if before is None:
                try:
                    emit({'event': 'originalProcessDetails', 'pid': pid, 'startTicks': value['startTicks'],
                          'atMonotonic': now, **details(pid, value['startTicks'])})
                except (FileNotFoundError, ProcessLookupError, PermissionError, AssertionError) as error:
                    emit({'event': 'detailsUnavailable', 'pid': pid, 'atMonotonic': now,
                          'error': type(error).__name__ + ': ' + str(error)})
            previous[pid] = (now, value['cpuSeconds'])
            rows.append(value)
        emit({'event': 'sample', 'atMonotonic': now, 'elapsedSeconds': now - started, 'processes': rows,
              'summedRssBytesNotUniquePhysical': sum(value['rssBytes'] for value in rows)})

    def sampling_loop():
        while True:
            try:
                sample()
            except Exception as error:
                description = type(error).__name__ + ': ' + str(error)
                sampler_errors.append(description)
                emit({'event': 'samplerError', 'error': description, 'atMonotonic': time.monotonic()})
            if stop.wait(SAMPLE_SECONDS):
                return

    sampler = threading.Thread(target=sampling_loop, name='owned-process-observer', daemon=True)
    sampler.start()
    return_code = child.wait()
    stop.set()
    sampler.join()
    try:
        sample()
    except Exception as error:
        sampler_errors.append(type(error).__name__ + ': ' + str(error))
    for number, previous_handler in previous_handlers.items():
        signal.signal(number, previous_handler)
    stdout.flush()
    stderr.flush()
    os.fsync(stdout.fileno())
    os.fsync(stderr.fileno())
    stdout.close()
    stderr.close()
    emit({'event': 'rootFinished', 'pid': child.pid, 'returnCode': return_code,
          'elapsedSeconds': time.monotonic() - started})
    events.flush()
    os.fsync(events.fileno())
    events.close()
    save(evidence / 'result.json', {
        'kind': 'ONE_1EC_SHOW_DIAGNOSTIC_PROCESS_CAPTURE', 'diagnosticOnly': True,
        'ciQualification': False, 'applicationRevision': APP_HEAD, 'rootPid': child.pid,
        'returnCode': return_code, 'elapsedSeconds': time.monotonic() - started,
        'observedRemainingIdentities': [{'pid': pid, 'startTicks': start} for pid, start in sorted(known.items())],
        'samplerErrors': sampler_errors, 'exitObservationCount': len(exit_observations),
        'stdout': {'bytes': (evidence / 'stdout.log').stat().st_size,
                   'sha256': hashlib.sha256((evidence / 'stdout.log').read_bytes()).hexdigest()},
        'stderr': {'bytes': (evidence / 'stderr.log').stat().st_size,
                   'sha256': hashlib.sha256((evidence / 'stderr.log').read_bytes()).hexdigest()},
        'resourceLimitsChanged': False, 'originalCommandChanged': False})
    for name, output in [('stdout.log', sys.stdout.buffer), ('stderr.log', sys.stderr.buffer)]:
        with (evidence / name).open('rb') as source:
            while True:
                block = source.read(65536)
                if not block:
                    break
                output.write(block)
        output.flush()
    return return_code if return_code >= 0 else 128 - return_code


if __name__ == '__main__':
    raise SystemExit(main())
