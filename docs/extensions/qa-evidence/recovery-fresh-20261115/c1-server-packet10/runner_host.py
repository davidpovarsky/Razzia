"""Executable diagnostic extension of the unchanged reviewed packet2 host base.
No runtime authorization is embedded. Init remains OFF; caps remain unchanged.
"""
import hashlib
import json
import pathlib
import sys
import time
from runner_base import Runner as BaseRunner, D, require
from pid_observer import PidObserver


class Runner(BaseRunner):
    def __init__(self, here):
        super().__init__(here)
        self.pid_observer = None
        self.supervisors = None
        self.process_stopped = False
        self.stop_observations = 0
        self.passed_jobs = set()

    def physical_bytes(self):
        # Prior iterations and private controls consume this SAME 64 MiB lease.
        total = super().physical_bytes() + self.plan['priorLeasePhysicalBytes']
        for path in self.plan.get('leaseAccountingControlPaths', []):
            file = pathlib.Path(path)
            if file.exists():
                total += file.lstat().st_blocks * 512
        return total

    def measure(self):
        value = super().measure()
        if self.pid_observer is None:
            value['pidMetrics'] = {'available': False, 'reason': 'container-not-started'}
        elif self.process_stopped:
            value['pidMetrics'] = {'available': False, 'reason': 'owned-container-stopped'}
        else:
            try:
                value['pidMetrics'] = {'available': True, **self.pid_observer.capture()}
            except BaseException as error:
                value['pidMetrics'] = {'available': False, 'reason': str(error)}
        return value

    def check_resources(self, sample, admission=False):
        super().check_resources(sample, admission)
        metrics = sample['pidMetrics']
        if self.pid_observer is not None and not self.process_stopped:
            require(metrics['available'], 'Live owned PID accounting unavailable')
            require(metrics['pidsMax'] == 96 and metrics['pidsCurrent'] <= 96,
                    'Owned PID cap mismatch/breach')
            require(metrics['pidsEvents']['max'] == 0,
                    'PID-controller max event; stop, never widen cap automatically')

    @staticmethod
    def process_keys(metrics):
        return {(v['hostPid'], v['startTicks']) for v in metrics['processes']}

    def drain(self, name):
        require(self.pid_observer is not None and self.supervisors is not None, 'Missing process baseline')
        start = time.monotonic()
        with self.open_host(name + '-drain.jsonl') as target:
            while True:
                sample = self.measure()
                target.write(json.dumps(sample) + '\n'); target.flush()
                self.check_resources(sample)
                metrics = sample['pidMetrics']
                if (not metrics['exitedOrMovedDuringRead'] and metrics['zombiesObserved'] == 0
                        and self.process_keys(metrics) == self.supervisors):
                    return
                require(time.monotonic() - start < 5,
                        'Persistent process adoption/zombies or extra descendants; later stages stopped')
                time.sleep(0.1)

    def initialize_process_accounting(self):
        identity = json.loads(self.output(D + ['inspect', self.cid]))[0]
        require(identity['Id'] == self.cid and bool(identity['HostConfig'].get('Init')) == bool(self.plan['initEnabled']),
                'Init differs from this owner-authorized iteration')
        self.pid_observer = PidObserver(self.cid, identity['State']['Pid'], 96)
        start = time.monotonic()
        with self.open_host('supervisor-baseline.jsonl') as target:
            while True:
                sample = self.measure()
                target.write(json.dumps(sample) + '\n'); target.flush()
                self.check_resources(sample)
                metrics = sample['pidMetrics']
                rows = metrics['processes']
                if ((not self.plan['initEnabled'] and len(rows) == 1
                         and rows[0]['hostPid'] == self.pid_observer.init_pid
                         and rows[0]['namespacePids'][-1:] == [1]
                         and rows[0]['name'] in {'node', 'MainThread'}
                         or self.plan['initEnabled'] and len(rows) == 2
                         and {v['name'] for v in rows} in ({'docker-init', 'node'}, {'docker-init', 'MainThread'})
                         and all(v['hostPid'] == self.pid_observer.init_pid or v['ppid'] == self.pid_observer.init_pid for v in rows)
                         and any(v['hostPid'] == self.pid_observer.init_pid and v['name'] == 'docker-init' and v['namespacePids'][-1:] == [1] for v in rows))
                        and not metrics['exitedOrMovedDuringRead'] and metrics['zombiesObserved'] == 0):
                    self.supervisors = self.process_keys(metrics)
                    return
                require(time.monotonic() - start < 5, 'Original Node supervisor baseline unavailable')
                time.sleep(0.1)

    def verify(self, label, access=False):
        if label == 'before':
            self.initialize_process_accounting()
            # Separate job receipt roots prevent the repeated tenant witness
            # inside the 11-case group from overwriting the first witness.
            for job in self.plan['tests']:
                folder = self.fixture / 'child-receipts' / job['name']
                folder.mkdir(mode=0o700)
                (folder / 'process-observations').mkdir(mode=0o700)
        super().verify(label, access)

    def stop_owned(self):
        if self.cid and self.evidence_fd is not None:
            self.stop_observations += 1
            try:
                self.write('before-stop-' + str(self.stop_observations) + '.json', self.measure())
            except BaseException as error:
                print('Pre-stop PID observation unavailable: ' + str(error), file=sys.stderr)
        super().stop_owned()
        if self.cid:
            self.process_stopped = True

    def validate_job(self, job):
        result = json.loads((self.fixture / 'child-results/startup-owners.results.json').read_text())
        require(result['success'] and result['numTotalTests'] == 26 and result['numPassedTests'] == 26
                and result['numFailedTests'] == 0 and result['numPendingTests'] == 0, 'Owner startup cases failed')
        folder = self.fixture / 'child-receipts/startup-owners'
        load = lambda name: json.loads((folder / (name + '.json')).read_text())
        live, closed, recycled = load('live-wal'), load('clean-closed-wal'), load('recycled-wal')
        for proof in [live, closed, recycled]:
            require(proof['before'] == proof['after'] and proof['entriesBefore'] == proof['entriesAfter'] and proof['node'] == 'v24.22.2', 'Source DB/WAL/SHM changed')
        require(live['before']['tadazz-accounts.sqlite-wal'] is not None and len(live['owners']) == 2, 'Live WAL witness absent')
        require(closed['before']['tadazz-accounts.sqlite-wal'] is None and closed['before']['tadazz-accounts.sqlite-shm'] is None
                and len(closed['owners']) == 1, 'Clean closed WAL witness absent')
        require(len(recycled['owners']) == 2, 'WAL reset witness absent')
        retry, churn = load('changed-source-retry'), load('bounded-source-churn')
        for proof, copies in [(retry, 2), (churn, 3)]:
            require(proof['copies'] == copies and proof['after'] == proof['afterWriter']
                    and proof['allPrivateCopiesRemoved'], 'Capture revalidation/cleanup failure')
        self.write('startup-owners-gate.json', {'passed': True, 'cases': 26, 'sourceNoWriteWitnesses': 3,
                   'boundedRetryCopies': 2, 'boundedChurnCopies': 3, 'privateCopiesRemoved': True})

    def monitored(self, name, command, wall_seconds):
        job = next((v for v in self.plan['tests'] if v['name'] == name), None)
        if name == 'actual-native':
            require('failed-startup-witness' in self.passed_jobs, 'Witness/process gate did not pass')
        if self.pid_observer is not None:
            self.drain('before-' + name)
        if job:
            # Only the explicitly declared per-job receipt paths vary. Every
            # other sanitized env/argv value remains the approved plan value.
            for key, value in job['env'].items():
                original = key + '=' + self.plan['env'][key]
                require(command.count(original) == 1, 'Ambiguous per-job environment binding')
                command = [key + '=' + value if v == original else v for v in command]
        result = super().monitored(name, command, wall_seconds)
        self.drain('after-' + name)
        if job:
            self.validate_job(job)
            self.passed_jobs.add(name)
        return result
