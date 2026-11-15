"""NOT RUN. Requires separate independent disposition and explicit manager grant.
No installs, pulls, clone, ports, production mounts, host-PID kill or source edits.
"""
import hashlib, json, os, pathlib, shutil, stat, subprocess, sys, tarfile, time

HERE = pathlib.Path(__file__).resolve().parent
P = json.loads((HERE / 'plan.json').read_text())
M = json.loads((HERE / 'manifest.json').read_text())
S, F, E = (pathlib.Path(P[k]) for k in ('src', 'fixture', 'evidence'))
D = ['sudo', '-n', 'docker']
MIB = 1024 ** 2
cid = None
began = time.monotonic()

def require(condition, message):
    if not condition: raise RuntimeError(message)

def output(args):
    return subprocess.check_output(args, text=True, timeout=30)

def write(name, value):
    with (E / name).open('x') as target: target.write(json.dumps(value, indent=2) + '\n')

def check_file(file, expected):
    require(file.is_file() and not file.is_symlink(), 'Nonregular source ' + str(file))
    data = file.read_bytes()
    require(len(data) == expected['size'] and hashlib.sha256(data).hexdigest() == expected['sha256'], 'Source hash mismatch ' + str(file))

def physical_bytes():
    seen, total = set(), 0
    for root in (S, F, E):
        if not root.exists(): continue
        for directory, dirs, files in os.walk(root, followlinks=False):
            for name in ['.'] + dirs + files:
                item = pathlib.Path(directory) if name == '.' else pathlib.Path(directory) / name
                value = item.lstat()
                key = (value.st_dev, value.st_ino)
                if key not in seen: total += value.st_blocks * 512; seen.add(key)
    # Charge new container metadata conservatively; retained shared 435 MiB is
    # accounted once by HQ, not duplicated as C1 growth.
    if cid:
        state = json.loads(output(D + ['inspect', '--size', cid]))[0]
        total += state.get('SizeRw', 0) + 2 * MIB
    return total

def resources(grant, admission=False):
    used = physical_bytes()
    free = shutil.disk_usage(P['root']).free
    remaining = sum(grant['otherRemainingMiB'].values()) + max(0, 64 - used / MIB)
    required = (2048 + remaining + 200 + 64) * MIB
    available = int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))) * 1024
    result = {'time': time.time(), 'freeBytes': free, 'ownPhysicalBytes': used, 'requiredFreeBytes': required, 'availableRamBytes': available}
    require(free >= P['absoluteDiskFloorBytes'] and used <= P['newPhysicalBytesCap'], 'Resource floor or C1 growth cap: ' + json.dumps(result))
    if admission:
        require(free >= required and available >= 2304 * MIB, 'Fresh resource admission failed: ' + json.dumps(result))
    return result

def verify(label):
    result = output(D + ['exec', cid, 'node', '/inputs/verify-merged.cjs'])
    write('merged-' + label + '.json', json.loads(result))
    # Preserve the retained 1,391-input source fixture, in addition to the C1
    # effective graph. No old source/test/receipt is rewritten or removed.
    old = pathlib.Path(P['root']) / 'source/recovery-r2-9593f24f287f2e404f387f6359e89453cd8a971e/source-manifest.json'
    data = old.read_bytes()
    require(hashlib.sha256(data).hexdigest() == '67fecbcd28cfdef2a768c4ae7203e41a08a33c0cab6134f38aca3155fe0b7fe1', 'Retained manifest changed')
    prior = json.loads(data)
    for file in prior['files']: check_file(pathlib.Path(P['base']) / file['path'], file)
    write('retained-' + label + '.json', {'files': len(prior['files']), 'mismatches': []})

def stop_owned():
    if not cid: return
    identity = json.loads(output(D + ['inspect', cid]))[0]
    require(identity['Id'] == cid and identity['Name'] == '/' + P['runner'], 'Runner identity changed; no stop attempted')
    subprocess.run(D + ['stop', '--time', '5', cid], check=True, timeout=20, stdout=subprocess.DEVNULL)

def run_job(job, grant):
    require(time.monotonic() - began < P['maximumWallSeconds'], 'Whole-packet timeout')
    # Initial manager admission reserves the complete packet. Between stages,
    # other lanes can spend their admitted growth; never re-count it as unused.
    resources(grant)
    log, samples = E / (job['name'] + '.log'), E / (job['name'] + '-resources.jsonl')
    env = ['env', '-i'] + [key + '=' + value for key, value in P['env'].items()]
    command = D + ['exec', '-w', job['cwd'], cid] + env + job['args']
    write(job['name'] + '-command.json', {'argv': command, 'expectedCases': job['expectedCases']})
    start = time.monotonic()
    code = None
    with log.open('x') as stream, samples.open('x') as observations:
        child = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT)
        try:
            while True:
                sample = resources(grant)
                observations.write(json.dumps(sample) + '\n'); observations.flush()
                require(log.stat().st_size <= P['perLogBytesCap'], 'Bounded raw log cap exceeded')
                require(time.monotonic() - start < job['wallSeconds'], 'Job wall timeout')
                require(time.monotonic() - began < P['maximumWallSeconds'], 'Whole-packet timeout')
                try: code = child.wait(timeout=P['sampleSeconds']); break
                except subprocess.TimeoutExpired: pass
        except BaseException:
            stop_owned()
            child.wait(timeout=20)
            raise
    with (E / (job['name'] + '.exit')).open('x') as target: target.write(str(code) + '\n')
    verify(job['name'])
    require(code == 0, 'Functional failure; preserve raw output and stop remaining jobs: ' + job['name'])

def main():
    global cid
    require(len(sys.argv) == 2, 'Pass an explicit manager-admission JSON path')
    grant = json.loads(pathlib.Path(sys.argv[1]).read_text())
    require(grant.get('executionAuthorized') is True and grant.get('sourceDisposition') == 'APPROVE_WITH_EXACT_GATES', 'Independent review/execution hold')
    require(0 <= time.time() - grant.get('admittedAtEpochSeconds', 0) <= 300, 'Manager resource admission is not fresh; recheck before execution')
    require(grant.get('sourceCommit') == P['sourceCommit'] and grant.get('packetManifestSha256') == hashlib.sha256((HERE / 'manifest.json').read_bytes()).hexdigest(), 'Grant is not for this exact source/packet')
    require(grant.get('packetHashesSha256') == hashlib.sha256((HERE / 'packet-hashes.json').read_bytes()).hexdigest(), 'Grant does not bind the exact scripts/mount/command packet')
    require(set(grant['otherRemainingMiB']) == {'MCP', 'Integrator', 'UI'} and all(isinstance(n, (int, float)) and 0 <= n <= 64 for n in grant['otherRemainingMiB'].values()), 'Invalid remaining-growth ledger')
    require(HERE == S and not F.exists() and not E.exists(), 'Require exact new packet/fixture/evidence paths; never overwrite')
    resources(grant, admission=True)
    for forbidden in ('config', '.config', '.env', '.env.local', '.env.production'):
        require(not os.path.lexists(pathlib.Path(P['base']) / forbidden), 'Unexpected customer/config path in synthetic source fixture; refuse mount without reading it')
    image = json.loads(output(D + ['image', 'inspect', P['image']]))[0]
    require(image['Id'] == P['image'], 'Pinned image unavailable; no pull')
    require(P['runner'] not in output(D + ['ps', '-a', '--format', '{{.Names}}']).splitlines(), 'Runner name already exists; no rename/reuse')
    locks = json.loads((HERE / 'packet-hashes.json').read_text())
    for file in locks['files']:
        check_file(HERE / file['path'], file)
    archive = HERE / M['archive']
    check_file(archive, {'size': M['archiveBytes'], 'sha256': M['archiveSha256']})
    namespace = HERE / 'namespace'
    require(not namespace.exists(), 'No namespace overwrite')
    namespace.mkdir(mode=0o700)
    with tarfile.open(archive, 'r:gz') as archive_input:
        admitted = {file['path'] for file in M['files']}
        observed = set()
        for member in archive_input.getmembers():
            relative = pathlib.PurePosixPath(member.name)
            require(not relative.is_absolute() and '..' not in relative.parts and not member.issym() and not member.islnk(), 'Unsafe archive member')
            if member.isdir(): continue
            require(member.isfile() and member.name in admitted and member.name not in observed, 'Unexpected/duplicate archive file')
            observed.add(member.name)
            destination = namespace / member.name
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with destination.open('xb') as target: target.write(archive_input.extractfile(member).read())
        require(observed == admitted, 'Incomplete overlay')
    for entry in M['skeleton']:
        item = namespace / entry['path']
        item.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if entry['kind'] == 'directory': item.mkdir(mode=0o700)
        else: item.touch(exist_ok=False)
    for file in M['effectiveFiles'] + M['aux']: check_file(pathlib.Path(file['physicalSource']), file)
    F.mkdir(mode=0o700); E.mkdir(mode=0o700)
    for relative in ['scratch', 'scratch/c1', 'scratch/tmp', 'scratch/home', 'scratch/unused-initial-config'] + ['cache-' + str(i) for i in range(4)]:
        (F / relative).mkdir(mode=0o700)
    (E / 'receipts').mkdir(mode=0o700)
    device = (F / 'scratch/c1').stat().st_dev
    require(E.stat().st_dev == device == S.stat().st_dev, 'Persistent inputs/scratch/receipts must share the host filesystem')
    filesystem = output(['findmnt', '-n', '-o', 'FSTYPE', '-T', str(F / 'scratch/c1')]).strip()
    require(filesystem in {'ext4', 'xfs'}, 'Unqualified filesystem; never substitute RAM: ' + filesystem)
    write('storage-profile.json', {'filesystem': filesystem, 'device': device, 'persistentHostScratch': str(F / 'scratch/c1'), 'receipts': str(E / 'receipts'), 'tmpfsUsed': False})
    write('resources-admission.json', resources(grant, admission=True))
    args = D + ['create', '--name', P['runner'], '--pull=never', '--cpus=0.25', '--memory=2g', '--memory-swap=2g', '--pids-limit=96', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--log-driver=none']
    for mount in P['mounts']:
        require(pathlib.Path(mount['source']).exists(), 'Missing existing dependency/source mount; no mkdir in prior fixture')
        args += ['--mount', 'type=bind,src=' + mount['source'] + ',dst=' + mount['destination'] + (',readonly' if mount['readonly'] else '')]
    args += [P['image'], 'node', '-e', 'setInterval(()=>{},3600000)']
    cid = output(args).strip()
    output(D + ['start', cid])
    identity = json.loads(output(D + ['inspect', cid]))[0]
    host = identity['HostConfig']
    require(identity['Image'] == P['image'] and host['NanoCpus'] == 250000000 and host['Memory'] == 2147483648 and host['MemorySwap'] == 2147483648, 'Resource identity mismatch')
    require(host['NetworkMode'] == 'none' and host['ReadonlyRootfs'] and not host['PortBindings'] and not host.get('Tmpfs') and host.get('PidMode', '') == '', 'Isolation mismatch')
    require({(v['Source'], v['Destination'], v['RW']) for v in identity['Mounts']} == {(v['source'], v['destination'], not v['readonly']) for v in P['mounts']}, 'Unexpected mount or customer exposure')
    write('runner-identity.json', {key: identity[key] for key in ['Id', 'Image', 'Mounts', 'HostConfig']})
    verify('before')
    for job in P['tests']: run_job(job, grant)
    subprocess.run(D + ['exec', cid, 'node', '/inputs/analyze-results.cjs'], check=True, timeout=30, stdout=(E / 'analysis.json').open('x'))
    write('resources-final.json', resources(grant))

if __name__ == '__main__':
    try: main()
    except BaseException as error:
        report = {'kind': 'HOLD_OR_FAILURE', 'error': str(error), 'sourceCommit': P['sourceCommit'], 'time': time.time(), 'runtimePassClaimed': False}
        if E.exists(): write('driver-error.json', report)
        else:
            with (HERE / 'admission-error.json').open('x') as target: target.write(json.dumps(report, indent=2) + '\n')
        raise
    finally:
        if cid:
            stop_owned()
            state = json.loads(output(D + ['inspect', '--size', cid]))[0]
            write('runner-after-stop.json', {'id': cid, 'state': state['State'], 'sizeRw': state.get('SizeRw', 0)})
