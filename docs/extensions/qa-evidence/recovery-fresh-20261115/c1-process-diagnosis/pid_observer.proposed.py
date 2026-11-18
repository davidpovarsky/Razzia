"""PROPOSED host-only sampler; never executed against a running trial yet.
It reads only the exact owned cgroup/processes; no exec, signals or writes.
"""
import pathlib
import time


class PidObserver:
    def __init__(self, cid, init_host_pid, expected_max=96):
        if len(cid) != 64 or any(ch not in '0123456789abcdef' for ch in cid):
            raise RuntimeError('Require exact owned container ID')
        self.cid, self.init_pid, self.expected_max = cid, int(init_host_pid), expected_max
        membership = pathlib.Path(f'/proc/{self.init_pid}/cgroup').read_text().splitlines()
        relative = next(line[3:] for line in membership if line.startswith('0::'))
        if cid not in relative:
            raise RuntimeError('Init process is not in the owned cgroup')
        root = pathlib.Path('/sys/fs/cgroup')
        self.scope = root / relative.lstrip('/')
        if self.scope.resolve() != self.scope or not self.scope.is_relative_to(root):
            raise RuntimeError('Untrusted cgroup path')
        self.previous = {}
        self.limits = {}
        self.initial_max_events = None

    @staticmethod
    def fields(path):
        if not path.exists():
            return None
        return {key: int(value) for key, value in
                (line.split() for line in path.read_text().splitlines())}

    def capture(self):
        started = time.monotonic_ns()
        current = int((self.scope / 'pids.current').read_text())
        maximum = (self.scope / 'pids.max').read_text().strip()
        if maximum != str(self.expected_max):
            raise RuntimeError('Actual pids.max differs from reviewed cap')
        events = self.fields(self.scope / 'pids.events')
        if not events or 'max' not in events:
            raise RuntimeError('Missing actual pids.events counter')
        if self.initial_max_events is None:
            self.initial_max_events = events['max']
        rows, gone, transitions = [], [], []
        for pid in sorted(set(int(v) for v in (self.scope / 'cgroup.procs').read_text().split())):
            proc = pathlib.Path('/proc') / str(pid)
            try:
                if self.cid not in (proc / 'cgroup').read_text():
                    gone.append({'hostPid': pid, 'movedOut': True})
                    continue
                values = dict(line.split(':', 1) for line in (proc / 'status').read_text().splitlines() if ':' in line)
                raw_stat = (proc / 'stat').read_text()
                tail = raw_stat[raw_stat.rfind(')') + 2:].split()
                start_ticks = tail[19]
                key = (pid, start_ticks)
                ppid = int(values['PPid'].strip())
                prior = self.previous.get(key)
                if prior is not None and prior != ppid:
                    transitions.append({'hostPid': pid, 'startTicks': start_ticks,
                                        'oldPpid': prior, 'newPpid': ppid,
                                        'adoptedToInit': ppid == self.init_pid})
                self.previous[key] = ppid
                row = {'hostPid': pid, 'startTicks': start_ticks, 'ppid': ppid,
                       'name': values['Name'].strip(), 'state': values['State'].strip(),
                       'threads': int(values['Threads']),
                       'namespacePids': [int(v) for v in values.get('NSpid', '').split()],
                       'uid': values['Uid'].split(), 'gid': values['Gid'].split()}
                if key not in self.limits:
                    # Non-sensitive resource limits of verified owned processes,
                    # never command lines, environment or unrelated host processes.
                    self.limits[key] = [line for line in (proc / 'limits').read_text().splitlines()
                                        if line.startswith(('Max processes', 'Max open files'))]
                row['limits'] = self.limits[key]
                rows.append(row)
            except FileNotFoundError:
                gone.append({'hostPid': pid, 'exitedDuringRead': True})
        ancestors = []
        parent = self.scope.parent
        for _ in range(16):
            if not parent.is_relative_to(pathlib.Path('/sys/fs/cgroup')):
                break
            file = parent / 'pids.max'
            if file.exists():
                ancestors.append({'path': str(parent), 'pidsMax': file.read_text().strip(),
                                  'events': self.fields(parent / 'pids.events')})
            if parent == pathlib.Path('/sys/fs/cgroup'):
                break
            parent = parent.parent
        peak_file = self.scope / 'pids.peak'
        return {'capturedEpoch': time.time(), 'durationNs': time.monotonic_ns() - started,
                'scope': str(self.scope), 'pidsCurrent': current, 'pidsMax': int(maximum),
                'pidsPeak': int(peak_file.read_text()) if peak_file.exists() else None,
                'pidsEvents': events, 'pidsEventsLocal': self.fields(self.scope / 'pids.events.local'),
                'maxEventsSinceBaseline': events['max'] - self.initial_max_events,
                'processes': rows, 'exitedOrMovedDuringRead': gone, 'parentTransitions': transitions,
                'processCountObserved': len(rows), 'sumThreadsObserved': sum(v['threads'] for v in rows),
                'zombiesObserved': sum(v['state'].startswith('Z') for v in rows),
                'ancestorControllerLimitsOnly': ancestors,
                'snapshotIsRacy': True, 'spawnedInContainerToObserve': False}
