"""Packet-only host controller. Syntax reviewed locally; no server execution.
All observations use an exclusively claimed host directory absent from mounts.
"""
import hashlib
import json
import math
import os
import pathlib
import shutil
import stat
import subprocess
import tarfile
import time

MIB = 1024 ** 2
D = ['sudo', '-n', 'docker']


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def number(value, name):
    require(type(value) in (int, float) and math.isfinite(value) and value >= 0,
            'Invalid ledger quantity: ' + name)
    return value


class Runner:
    def __init__(self, here):
        self.here = here
        self.plan = json.loads((here / 'plan.json').read_text())
        self.manifest = json.loads((here / 'manifest.json').read_text())
        self.source, self.fixture, self.evidence = (
            pathlib.Path(self.plan[k]) for k in ('src', 'fixture', 'evidence'))
        self.cid = None
        self.evidence_fd = None
        self.evidence_identity = None
        self.started = time.monotonic()
        self.grant = None
        self.ledger = None
        self.ledger_path = None
        self.ledger_digest = None

    def output(self, args):
        return subprocess.check_output(args, text=True, timeout=30)

    def private_owner(self, path):
        value = path.lstat()
        expected = self.plan['identity']
        require(not path.is_symlink() and stat.S_ISDIR(value.st_mode)
                and (value.st_uid, value.st_gid) == (expected['uid'], expected['gid'])
                and value.st_mode & 0o077 == 0,
                'Private directory identity/mode mismatch: ' + str(path))
        require(path.resolve() == path, 'Linked private directory ancestor: ' + str(path))
        return value

    def claim_evidence(self):
        # mkdir is exclusive. A refused pre-existing path never yields a claim.
        self.evidence.mkdir(mode=0o700)
        value = self.private_owner(self.evidence)
        fd = os.open(self.evidence, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        opened = os.fstat(fd)
        require((opened.st_dev, opened.st_ino) == (value.st_dev, value.st_ino),
                'Evidence directory changed during claim')
        self.evidence_fd = fd
        self.evidence_identity = (opened.st_dev, opened.st_ino)

    def open_host(self, name):
        require(self.evidence_fd is not None and self.evidence_identity is not None,
                'No exclusively owned host evidence claim')
        require(pathlib.PurePath(name).name == name and name not in ('.', '..'),
                'Invalid host evidence basename')
        current = self.evidence.lstat()
        require((current.st_dev, current.st_ino) == self.evidence_identity,
                'Host evidence pathname changed; refuse writing')
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=self.evidence_fd)
        return os.fdopen(fd, 'w')

    def write(self, name, value):
        with self.open_host(name) as target:
            target.write(json.dumps(value, indent=2) + '\n')

    def read_control(self, path):
        directory = pathlib.Path(self.plan['resourceAdmission']['directory'])
        require(path.is_absolute() and path.parent == directory and path.suffix == '.json',
                'Control file must be a ROOT-supplied host-only admission JSON')
        self.private_owner(directory)
        value = path.lstat()
        require(stat.S_ISREG(value.st_mode) and not path.is_symlink()
                and (value.st_uid, value.st_gid) == (os.geteuid(), os.getegid())
                and value.st_mode & 0o077 == 0,
                'Control file owner/mode mismatch')
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            opened = os.fstat(fd)
            require((opened.st_dev, opened.st_ino) == (value.st_dev, value.st_ino),
                    'Control file changed during open')
            with os.fdopen(fd, 'rb', closefd=False) as source:
                data = source.read(1024 * 1024 + 1)
            require(len(data) <= 1024 * 1024, 'Oversized control file')
            after = os.fstat(fd)
            named = path.lstat()
            require((opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns,
                     opened.st_ctime_ns) ==
                    (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns,
                     after.st_ctime_ns) and named.st_ino == opened.st_ino,
                    'Control file changed during read')
            return json.loads(data), digest(data)
        finally:
            os.close(fd)

    def fresh(self, captured, expires=None):
        age = time.time() - number(captured, 'capturedAtEpochSeconds')
        require(0 <= age <= self.plan['resourceAdmission']['maximumAgeSeconds'],
                'ROOT admission/ledger is not fresh')
        if expires is not None:
            require(time.time() <= number(expires, 'expiresAtEpochSeconds')
                    <= captured + self.plan['resourceAdmission']['maximumAgeSeconds'],
                    'ROOT ledger expired or exceeds allowed lifetime')

    def load_controls(self, admission_path):
        p = self.plan
        grant, grant_digest = self.read_control(admission_path)
        require(grant.get('issuerThreadId') == p['resourceAdmission'].get('delegatedIssuerThreadId', p['resourceAdmission']['rootThreadId'])
                and grant.get('executionAuthorized') is True
                and grant.get('sourceDisposition') == 'APPROVE_WITH_EXACT_GATES'
                and grant.get('packetDisposition') == ('OWNER_AUTHORIZED_ISOLATED_ITERATION' if p['resourceAdmission'].get('delegatedIssuerThreadId') else 'APPROVE_WITH_EXACT_GATES'),
                'Independent packet review/execution hold')
        if p['resourceAdmission'].get('delegatedIssuerThreadId'):
            require(grant.get('parentAuthorization') == p['parentAuthorization']
                    and grant.get('syntheticFixtureOnly') is True
                    and grant.get('independentReviewClaimed') is False,
                    'Delegated control lacks exact owner authority or misstates its issuer')
        self.fresh(grant.get('admittedAtEpochSeconds'))
        packet_hash = digest((self.here / 'packet-hashes.json').read_bytes())
        require(grant.get('sourceCommit') == p['sourceCommit']
                and grant.get('packetManifestSha256') == digest((self.here / 'manifest.json').read_bytes())
                and grant.get('packetHashesSha256') == packet_hash,
                'Admission does not bind this exact source and packet')
        ledger_path = pathlib.Path(grant['laneLedgerPath'])
        ledger, ledger_digest = self.read_control(ledger_path)
        require(ledger_digest == grant.get('laneLedgerSha256')
                and ledger.get('snapshotId') == grant.get('laneLedgerSnapshotId')
                and ledger.get('issuerThreadId') == p['resourceAdmission'].get('delegatedIssuerThreadId', p['resourceAdmission']['rootThreadId'])
                and ledger.get('sourceCommit') == p['sourceCommit']
                and ledger.get('packetHashesSha256') == packet_hash,
                'ROOT lane-ledger snapshot/digest mismatch')
        self.fresh(ledger.get('capturedAtEpochSeconds'), ledger.get('expiresAtEpochSeconds'))
        require(ledger.get('schemaVersion') == 1 and ledger.get('snapshotId')
                and ledger.get('exampleOnly') is not True, 'Invalid/example ROOT ledger')
        lanes = ledger['lanes']
        require(isinstance(lanes, list) and lanes and len({v['laneId'] for v in lanes}) == len(lanes),
                'Missing/duplicate ROOT lanes')
        own = [v for v in lanes if v['laneId'] == p['resourceAdmission']['ownLaneId']]
        require(len(own) == 1, 'ROOT ledger must include C1 exactly once')
        for lane in lanes:
            for key in ('cpuGrant', 'memoryGrantBytes', 'newPhysicalBudgetBytes', 'consumedPhysicalBytes'):
                number(lane[key], lane['laneId'] + ':' + key)
            require(lane['consumedPhysicalBytes'] <= lane['newPhysicalBudgetBytes'], 'Lane already exceeds its fresh budget')
        require(own[0]['cpuGrant'] == p['cpu'] and own[0]['memoryGrantBytes'] == p['memoryBytes']
                and own[0]['newPhysicalBudgetBytes'] == p['newPhysicalBytesCap'], 'C1 grant differs from reviewed cap')
        aggregate = ledger['aggregate']
        require(sum(v['cpuGrant'] for v in lanes) <= number(aggregate['approvedCpu'], 'approvedCpu')
                and sum(v['memoryGrantBytes'] for v in lanes) <= number(aggregate['approvedMemoryBytes'], 'approvedMemoryBytes'),
                'Fresh aggregate grant exceeds ROOT admission')
        number(aggregate['retainedSharedMetadataBytesOnce'], 'retainedSharedMetadataBytesOnce')
        disk, ram = ledger['disk'], ledger['ram']
        require(number(disk['floorBytes'], 'floorBytes') >= p['absoluteDiskFloorBytes'], 'ROOT disk floor below 2 GiB')
        number(disk['futureReserveBytes'], 'futureReserveBytes')
        number(disk['marginBytes'], 'marginBytes')
        require(number(ram['minimumHostAvailableBytes'], 'minimumHostAvailableBytes') >= p['memoryBytes'], 'Insufficient ROOT RAM admission')
        self.grant, self.ledger = grant, ledger
        self.ledger_path, self.ledger_digest = ledger_path, ledger_digest
        return grant_digest

    def verify_ledger_before_first_job(self):
        ledger, actual = self.read_control(self.ledger_path)
        require(actual == self.ledger_digest and ledger == self.ledger, 'ROOT ledger changed before first job')
        self.fresh(self.grant['admittedAtEpochSeconds'])
        self.fresh(ledger['capturedAtEpochSeconds'], ledger['expiresAtEpochSeconds'])
        sample = self.measure()
        self.write('root-ledger-before-first-job.json', {
            'ledgerSha256': actual, 'snapshot': ledger, 'measured': sample,
            'historicalPlanningValuesUsedAsAuthority': False})
        self.check_resources(sample, admission=True)

    def check_file(self, path, expected):
        require(path.is_file() and not path.is_symlink(), 'Nonregular packet file: ' + str(path))
        data = path.read_bytes()
        require(len(data) == expected['size'] and digest(data) == expected['sha256'],
                'Packet hash mismatch: ' + str(path))

    def physical_bytes(self):
        seen, total = set(), 0
        for root in (self.source, self.fixture, self.evidence):
            if not root.exists():
                continue
            for directory, dirs, files in os.walk(root, followlinks=False):
                for name in ['.'] + dirs + files:
                    item = pathlib.Path(directory) if name == '.' else pathlib.Path(directory) / name
                    value = item.lstat()
                    key = (value.st_dev, value.st_ino)
                    if key not in seen:
                        total += value.st_blocks * 512
                        seen.add(key)
        if self.cid:
            value = json.loads(self.output(D + ['inspect', '--size', self.cid]))[0]
            total += value.get('SizeRw', 0) + 2 * MIB
        return total

    def measure(self):
        used = self.physical_bytes()
        remaining = sum(max(0, v['newPhysicalBudgetBytes'] -
                            (used if v['laneId'] == self.plan['resourceAdmission']['ownLaneId'] else v['consumedPhysicalBytes']))
                        for v in self.ledger['lanes'])
        disk = self.ledger['disk']
        required = disk['floorBytes'] + remaining + disk['futureReserveBytes'] + disk['marginBytes']
        available = int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines()
                             if line.startswith('MemAvailable:'))) * 1024
        return {'time': time.time(), 'freeBytes': shutil.disk_usage(self.plan['root']).free,
                'ownPhysicalBytes': used, 'requiredAdmissionFreeBytes': required, 'availableRamBytes': available,
                'laneLedgerSnapshotId': self.ledger['snapshotId'], 'laneLedgerSha256': self.ledger_digest}

    def check_resources(self, sample, admission=False):
        require(sample['freeBytes'] >= self.ledger['disk']['floorBytes']
                and sample['ownPhysicalBytes'] <= self.plan['newPhysicalBytesCap'],
                'Resource floor/growth cap breached: ' + json.dumps(sample))
        if admission:
            require(sample['freeBytes'] >= sample['requiredAdmissionFreeBytes']
                    and sample['availableRamBytes'] >= self.ledger['ram']['minimumHostAvailableBytes'],
                    'Fresh ROOT resource admission failed: ' + json.dumps(sample))

    def stop_owned(self):
        if not self.cid:
            return
        value = json.loads(self.output(D + ['inspect', self.cid]))[0]
        require(value['Id'] == self.cid and value['Name'] == '/' + self.plan['runner'], 'Runner identity mismatch; no stop')
        subprocess.run(D + ['stop', '--time', '5', self.cid], check=True, timeout=20, stdout=subprocess.DEVNULL)

    def monitored(self, name, command, wall_seconds):
        self.write(name + '-command.json', {'argv': command, 'wallSeconds': wall_seconds})
        self.check_resources(self.measure())
        start = time.monotonic()
        code, failure = None, None
        log = self.evidence / (name + '.log')
        with self.open_host(name + '.log') as stream, self.open_host(name + '-resources.jsonl') as samples:
            child = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT)

            def capture(phase):
                stream.flush()
                sample = self.measure()
                sample.update({'phase': phase, 'returnCode': child.poll(),
                               'terminalObserved': child.poll() is not None, 'logBytes': log.stat().st_size})
                samples.write(json.dumps(sample) + '\n')
                samples.flush()
                if phase == 'terminal':
                    require(sample['terminalObserved'], 'Terminal state was not observed')
                self.check_resources(sample)
                require(sample['logBytes'] <= self.plan['perLogBytesCap'], 'Final/running raw log cap exceeded')
                require(time.monotonic() - start <= wall_seconds, 'Stage wall timeout')
                require(time.monotonic() - self.started <= self.plan['maximumWallSeconds'], 'Whole packet timeout')

            try:
                while True:
                    capture('running')
                    try:
                        code = child.wait(timeout=self.plan['sampleSeconds'])
                        break
                    except subprocess.TimeoutExpired:
                        pass
            except BaseException as error:
                failure = error
                self.stop_owned()
                try:
                    code = child.wait(timeout=20)
                except BaseException as wait_error:
                    failure = wait_error
            finally:
                # The child can exit between two running samples. Always record
                # and enforce terminal log/disk/growth bounds before any next stage.
                try:
                    capture('terminal')
                except BaseException as final_error:
                    failure = failure or final_error
        self.write(name + '-exit.json', {'code': code, 'terminalObserved': child.poll() is not None,
                                       'failure': str(failure) if failure else None})
        if failure:
            raise failure
        require(code == 0, 'Stage failed; later jobs stopped: ' + name)
        return json.loads(log.read_text()) if name.startswith('verify-') or name == 'analyze-results' else None

    def verify(self, label, access=False):
        args = D + ['exec', self.cid, 'node', '/inputs/verify-merged.cjs']
        if access:
            args.append('--access')
        result = self.monitored('verify-' + label, args, 90)
        self.write('merged-' + label + '.json', result)

    def stage_namespace(self):
        namespace = self.here / 'namespace'
        namespace.mkdir(mode=0o700)
        admitted = {f['path'] for f in self.manifest['files']}
        observed = set()
        with tarfile.open(self.here / self.manifest['archive'], 'r:gz') as source:
            for member in source.getmembers():
                relative = pathlib.PurePosixPath(member.name)
                require(not relative.is_absolute() and '..' not in relative.parts
                        and not member.issym() and not member.islnk(), 'Unsafe archive entry')
                if member.isdir():
                    continue
                require(member.isfile() and member.name in admitted and member.name not in observed, 'Unexpected archive file')
                observed.add(member.name)
                target = namespace / member.name
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with target.open('xb') as output:
                    output.write(source.extractfile(member).read())
        require(observed == admitted, 'Incomplete archive')
        for entry in self.manifest['skeleton']:
            item = namespace / entry['path']
            item.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            if entry['kind'] == 'directory':
                item.mkdir(mode=0o700)
            else:
                item.touch(exist_ok=False)
        for file in self.manifest['files']:
            self.check_file(namespace / file['path'], file)

    def run(self, admission_path):
        p = self.plan
        expected = p['identity']
        require((os.getuid(), os.geteuid(), os.getgid(), os.getegid()) ==
                (expected['uid'], expected['uid'], expected['gid'], expected['gid']),
                'Host invocation must match pinned nonroot Docker UID/GID; no DAC assumption')
        require(expected['uid'] > 0 and expected['gid'] > 0, 'Nonroot identity required')
        self.private_owner(self.source)
        grant_digest = self.load_controls(admission_path)
        require(self.here == self.source and not os.path.lexists(self.fixture)
                and not os.path.lexists(self.evidence) and not os.path.lexists(self.here / 'namespace'),
                'Existing path: stderr-only refusal; no reuse or append')
        self.check_resources(self.measure(), admission=True)
        for forbidden in ('config', '.config', '.env', '.env.local', '.env.production'):
            require(not os.path.lexists(pathlib.Path(p['base']) / forbidden), 'Unexpected customer/config path; refuse mount')
        locks = json.loads((self.here / 'packet-hashes.json').read_text())
        for file in locks['files']:
            self.check_file(self.here / file['path'], file)
        image = json.loads(self.output(D + ['image', 'inspect', p['image']]))[0]
        require(image['Id'] == p['image'], 'Pinned image missing; no pull')
        require(p['runner'] not in self.output(D + ['ps', '-a', '--format', '{{.Names}}']).splitlines(), 'Existing runner; no reuse')
        self.claim_evidence()
        self.write('root-admission.json', {'admissionSha256': grant_digest, 'admission': self.grant,
                                          'laneLedgerSha256': self.ledger_digest, 'ledger': self.ledger})
        self.stage_namespace()
        self.fixture.mkdir(mode=0o700)
        for relative in ['scratch', 'scratch/c1', 'scratch/tmp', 'scratch/home', 'scratch/unused-initial-config',
                         'child-results', 'child-receipts', 'child-output-root',
                         'child-output-root/results', 'child-output-root/receipts'] + ['cache-' + str(i) for i in range(4)]:
            (self.fixture / relative).mkdir(mode=0o700)
        owners = {str(v): {'uid': self.private_owner(v).st_uid, 'gid': self.private_owner(v).st_gid,
                          'mode': oct(v.stat().st_mode & 0o777)}
                  for v in [self.source, self.fixture, self.evidence] + [m for m in self.fixture.rglob('*') if m.is_dir()]}
        self.write('host-path-ownership.json', owners)
        device = (self.fixture / 'scratch/c1').stat().st_dev
        require(self.evidence.stat().st_dev == device == self.source.stat().st_dev, 'Inputs/scratch/observations must share device')
        filesystem = self.output(['findmnt', '-n', '-o', 'FSTYPE', '-T', str(self.fixture / 'scratch/c1')]).strip()
        require(filesystem in {'ext4', 'xfs'}, 'Unqualified filesystem; never substitute RAM')
        self.write('storage-profile.json', {'filesystem': filesystem, 'device': device, 'tmpfsUsed': False})
        self.check_resources(self.measure(), admission=True)
        args = D + ['create', '--name', p['runner'], '--user', f"{expected['uid']}:{expected['gid']}",
                    '--pull=never', '--cpus=0.25', '--memory=2g', '--memory-swap=2g', '--pids-limit=96',
                    '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--log-driver=none']
        if p.get('initEnabled'):
            args += ['--init']
        for mount in p['mounts']:
            source = pathlib.Path(mount['source'])
            require(source.exists(), 'Missing existing mount; no prior-fixture mkdir')
            require(source != self.evidence and not self.evidence.is_relative_to(source), 'Host observation tree must not be mounted')
            require(not pathlib.Path(p['resourceAdmission']['directory']).is_relative_to(source), 'Host admission tree must not be mounted')
            args += ['--mount', 'type=bind,src=' + str(source) + ',dst=' + mount['destination'] + (',readonly' if mount['readonly'] else '')]
        args += [p['image'], 'node', '-e', 'setInterval(()=>{},3600000)']
        self.cid = self.output(args).strip()
        self.output(D + ['start', self.cid])
        identity = json.loads(self.output(D + ['inspect', self.cid]))[0]
        host = identity['HostConfig']
        require(identity['Config']['User'] == f"{expected['uid']}:{expected['gid']}" and host['CapDrop'] == ['ALL']
                and any(v.startswith('no-new-privileges') for v in host['SecurityOpt']), 'Identity/capability mismatch')
        require(identity['Image'] == p['image'] and host['NanoCpus'] == 250000000
                and host['Memory'] == p['memoryBytes'] and host['MemorySwap'] == p['memoryBytes'], 'Resource mismatch')
        require(host['NetworkMode'] == 'none' and host['ReadonlyRootfs'] and not host['PortBindings']
                and not host.get('Tmpfs') and host.get('PidMode', '') == '', 'Isolation mismatch')
        require({(v['Source'], v['Destination'], v['RW']) for v in identity['Mounts']} ==
                {(v['source'], v['destination'], not v['readonly']) for v in p['mounts']}, 'Unexpected mount')
        self.write('runner-identity.json', {**{k: identity[k] for k in ['Id', 'Image', 'Mounts', 'HostConfig']},
                                           'configUser': identity['Config']['User']})
        self.verify('before', access=True)
        self.verify_ledger_before_first_job()
        for job in p['tests']:
            env = ['env', '-i'] + [k + '=' + v for k, v in p['env'].items()]
            self.monitored(job['name'], D + ['exec', '-w', job['cwd'], self.cid] + env + job['args'], job['wallSeconds'])
            self.verify(job['name'])
        result = self.monitored('analyze-results', D + ['exec', self.cid, 'node', '/inputs/analyze-results.cjs'], 90)
        self.write('analysis.json', result)
        final = self.measure()
        self.write('resources-final.json', final)
        self.check_resources(final)
