#!/usr/bin/env python3
"""Add one canonical-site client-address header with backup and verified rollback.

Preflight is the default. This edits only the inspected tadazz.com app proxy;
the phone gateway, sandbox and unrelated preview aliases retain their bytes.
"""
import argparse
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import urllib.request
import uuid


CONFIG = Path('/etc/caddy/Caddyfile')
LOCK = Path('/run/lock/tadazz-mcp-deploy.lock')
EVIDENCE_PARENT = Path('/home/ubuntu')
OLD_SITE = '''tadazz.com {
    encode zstd gzip

    handle_path /phone/* {
        reverse_proxy 127.0.0.1:38991
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}'''
NEW_SITE = OLD_SITE.replace('        reverse_proxy 127.0.0.1:3000', '''        reverse_proxy 127.0.0.1:3000 {
            header_up X-Tadazz-Client-IP {remote_host}
        }''')


class GuardError(RuntimeError):
    pass


def need(value, code):
    if not value:
        raise GuardError(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def private_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def command(argv, evidence, label):
    result = subprocess.run(argv, capture_output=True, timeout=30)
    private_write(evidence / (label + '.stdout'), result.stdout)
    private_write(evidence / (label + '.stderr'), result.stderr)
    need(result.returncode == 0, label.upper() + '_FAILED')
    return result.stdout


def http_json(url, *, headers=None):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, message, response_headers, newurl):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(urllib.request.Request(url, headers=headers or {}), timeout=10) as response:
        data = response.read(4 * 1024**2 + 1)
        need(response.status == 200 and len(data) <= 4 * 1024**2, 'HTTP_PROOF_FAILED')
    return json.loads(data)


def active_config():
    return http_json('http://127.0.0.1:2019/config/')


def expected_config(before):
    after = copy.deepcopy(before)
    targets = []

    def visit(value, hosts=None):
        if isinstance(value, list):
            for child in value:
                visit(child, hosts)
        elif isinstance(value, dict):
            for matcher in value.get('match', []):
                if isinstance(matcher, dict) and 'host' in matcher:
                    hosts = matcher['host']
            if value.get('handler') == 'reverse_proxy' and hosts == ['tadazz.com']:
                if value.get('upstreams') == [{'dial': '127.0.0.1:3000'}]:
                    need('headers' not in value, 'CANONICAL_PROXY_HEADERS_CHANGED')
                    targets.append(value)
            for key, child in value.items():
                if key != 'match':
                    visit(child, hosts)

    visit(after)
    need(len(targets) == 1, 'CANONICAL_PROXY_NOT_UNIQUE')
    targets[0]['headers'] = {'request': {'set': {'X-Tadazz-Client-Ip': ['{http.request.remote.host}']}}}
    return after


def inspect_application(expected_id, expected_image):
    result = subprocess.run(['docker', 'inspect', 'tadazz'], capture_output=True, check=True, timeout=10)
    row = json.loads(result.stdout)[0]
    need(row['Id'] == expected_id and row['Image'] == expected_image and
         row['State']['Running'] and not row['State'].get('Restarting') and
         row['HostConfig']['PortBindings'] == {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3000'}]},
         'APPLICATION_BASELINE_CHANGED')
    return {'id': row['Id'], 'image': row['Image'], 'startedAt': row['State']['StartedAt']}


def atomic_config(data, info, expected_current):
    need(sha(CONFIG.read_bytes()) == expected_current and not CONFIG.is_symlink(), 'CADDY_CONFIG_DRIFT')
    pending = CONFIG.parent / ('.tadazz-managed-client-' + uuid.uuid4().hex + '.tmp')
    private_write(pending, data)
    os.chown(pending, info.st_uid, info.st_gid)
    os.chmod(pending, stat.S_IMODE(info.st_mode))
    need(sha(CONFIG.read_bytes()) == expected_current, 'CADDY_CONFIG_DRIFT_BEFORE_REPLACE')
    os.replace(pending, CONFIG)
    fd = os.open(CONFIG.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-file-sha256', required=True)
    parser.add_argument('--expected-active-sha256', required=True)
    parser.add_argument('--expected-app-container', required=True)
    parser.add_argument('--expected-app-image', required=True)
    args = parser.parse_args()
    need(os.geteuid() == 0, 'ROOT_REQUIRED')
    for value in (args.expected_file_sha256, args.expected_active_sha256, args.expected_app_container):
        need(re.fullmatch(r'[a-f0-9]{64}', value), 'DIGEST_ARGUMENT_INVALID')
    need(re.fullmatch(r'sha256:[a-f0-9]{64}', args.expected_app_image), 'IMAGE_ARGUMENT_INVALID')
    os.umask(0o077)
    lock = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    li = os.fstat(lock)
    need(stat.S_ISREG(li.st_mode) and li.st_uid == 0 and li.st_nlink == 1 and
         stat.S_IMODE(li.st_mode) == 0o600, 'LOCK_UNSAFE')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    evidence = EVIDENCE_PARENT / ('tadazz-managed-client-proxy-' + uuid.uuid4().hex[:12])
    evidence.mkdir(mode=0o700)
    result = {'ok': False, 'applied': False, 'applicationChanged': False, 'evidence': str(evidence)}
    replaced = False
    candidate = None
    handlers = {}
    for sig in (signal.SIGTERM, signal.SIGINT):
        handlers[sig] = signal.signal(sig, lambda signum, frame: (_ for _ in ()).throw(GuardError('OPERATOR_INTERRUPTED')))
    try:
        info = CONFIG.lstat()
        need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and
             stat.S_IMODE(info.st_mode) == 0o644 and CONFIG.resolve() == CONFIG, 'CADDY_FILE_UNSAFE')
        original = CONFIG.read_bytes()
        need(sha(original) == args.expected_file_sha256, 'CADDY_BASELINE_CHANGED')
        text = original.decode()
        need(text.count(OLD_SITE) == 1 and 'X-Tadazz-Client-IP' not in text, 'CADDY_TARGET_CHANGED')
        candidate = text.replace(OLD_SITE, NEW_SITE, 1).encode()
        original_path = evidence / 'Caddyfile.before'
        candidate_path = evidence / 'Caddyfile.candidate'
        private_write(original_path, original)
        private_write(candidate_path, candidate)
        before = active_config()
        need(sha(canonical(before)) == args.expected_active_sha256, 'ACTIVE_CADDY_CHANGED')
        adapted_before = json.loads(command(['/usr/bin/caddy', 'adapt', '--config', str(CONFIG), '--adapter', 'caddyfile'], evidence, 'adapt-before'))
        need(before == adapted_before, 'CADDY_RUNTIME_DISK_DIVERGENCE')
        after = json.loads(command(['/usr/bin/caddy', 'adapt', '--config', str(candidate_path), '--adapter', 'caddyfile'], evidence, 'adapt-candidate'))
        need(after == expected_config(before), 'CADDY_CHANGE_NOT_EXACT_ONE_HEADER')
        command(['/usr/bin/caddy', 'validate', '--config', str(candidate_path), '--adapter', 'caddyfile'], evidence, 'validate-candidate')
        app_before = inspect_application(args.expected_app_container, args.expected_app_image)
        need(command(['systemctl', 'is-active', 'caddy'], evidence, 'active-before').strip() == b'active', 'CADDY_NOT_ACTIVE')
        result.update(beforeFileSha256=sha(original), candidateFileSha256=sha(candidate),
                      beforeActiveSha256=sha(canonical(before)), candidateActiveSha256=sha(canonical(after)))
        if args.apply:
            need(active_config() == before, 'CADDY_RUNTIME_DRIFT_BEFORE_REPLACE')
            atomic_config(candidate, info, sha(original))
            replaced = True
            command(['/usr/bin/caddy', 'reload', '--config', str(CONFIG), '--force'], evidence, 'reload-candidate')
            need(active_config() == after, 'CADDY_RELOAD_NOT_EXACT')
            need(command(['systemctl', 'is-active', 'caddy'], evidence, 'active-after').strip() == b'active', 'CADDY_NOT_ACTIVE_AFTER')
            need(http_json('https://tadazz.com/api/health', headers={'X-Tadazz-Client-IP': '192.0.2.99'}) == {'status': 'ok'}, 'APP_HEALTH_FAILED')
            result['applied'] = True
        need(inspect_application(args.expected_app_container, args.expected_app_image) == app_before, 'APPLICATION_RESTARTED')
        result['ok'] = True
    except BaseException as error:
        result['failureCode'] = str(error) if isinstance(error, GuardError) else type(error).__name__
        # os.replace may have succeeded before a directory fsync or signal
        # raised. Detect our exact replacement bytes at the failure boundary.
        try:
            replaced = replaced or (candidate is not None and not CONFIG.is_symlink() and
                                    sha(CONFIG.read_bytes()) == sha(candidate))
        except OSError:
            result['reconciliationRequired'] = True
        if replaced:
            for sig in handlers:
                signal.signal(sig, signal.SIG_IGN)
            try:
                need(active_config() in (before, after), 'FOREIGN_CADDY_RUNTIME_CHANGE')
                atomic_config(original, info, sha(candidate))
                command(['/usr/bin/caddy', 'reload', '--config', str(CONFIG), '--force'], evidence, 'reload-rollback')
                need(active_config() == before, 'CADDY_ROLLBACK_NOT_EXACT')
                result['rolledBack'] = True
            except BaseException as rollback_error:
                result['reconciliationRequired'] = True
                result['rollbackFailureCode'] = str(rollback_error) if isinstance(rollback_error, GuardError) else type(rollback_error).__name__
    finally:
        try:
            private_write(evidence / 'result.json', canonical(result) + b'\n')
        finally:
            os.close(lock)
            for sig, handler in handlers.items():
                signal.signal(sig, handler)
            print(json.dumps(result))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
