#!/usr/bin/env python3
"""Install one pinned, read-only package renderer and its two HTTPS routes.

The application remains unchanged. Its package runtime flag is enabled later by
the separately qualified MCP cutover. No private values enter output or argv.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request

STORE = Path('/var/lib/tadazz-release-5312660/config/extensions/packages')
SECRET_ROOT = Path('/var/lib/tadazz-package-runtime')
SECRET = SECRET_ROOT / 'runtime-capability'
CADDY = Path('/etc/caddy/Caddyfile')
ORIGIN = 'https://www.tadazz.com'
PARENT = 'https://tadazz.com'
HOST = 'www.tadazz.com'
NAME = 'tadazz-package-runtime'
IMAGE = re.compile(r'sha256:[a-f0-9]{64}')
HEX = re.compile(r'[a-f0-9]{64}')
WWW_BLOCK = re.compile(r'(?m)^www\.tadazz\.com\s*\{\s*redir https://tadazz\.com\{uri\} permanent\s*\}')
NEW_BLOCK = '''www.tadazz.com {
    @package_runtime path /render /health
    handle @package_runtime {
        reverse_proxy 127.0.0.1:3192 {
            header_up -Cookie
            header_up -Authorization
            header_down -Set-Cookie
        }
    }
    handle {
        redir https://tadazz.com{uri} permanent
    }
}'''


class GateError(RuntimeError):
    pass


def need(value, code):
    if not value:
        raise GateError(code)


def command(argv, code, **kwargs):
    result = subprocess.run(argv, capture_output=True, timeout=60, **kwargs)
    need(result.returncode == 0, code)
    return result.stdout


def inspect(name, kind='container'):
    return json.loads(command(['docker', kind, 'inspect', name], 'DOCKER_INSPECT_FAILED'))[0]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def plain(path, directory=False):
    for part in [*reversed(path.parents), path]:
        info = part.lstat()
        need(not stat.S_ISLNK(info.st_mode), 'SYMLINK_REJECTED')
    info = path.stat()
    need(info.st_uid == 0, 'ROOT_OWNER_REQUIRED')
    need(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), 'PATH_TYPE')
    return info


def candidate_caddy(old):
    text = old.decode('utf-8')
    need(len(WWW_BLOCK.findall(text)) == 1, 'WWW_REDIRECT_SHAPE_CHANGED')
    need('request>uri delete' in text and 'request>headers>Referer delete' in text,
         'REQUEST_LOG_REDACTION_REQUIRED')
    return WWW_BLOCK.sub(lambda _: NEW_BLOCK, text, count=1).encode('utf-8')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def probe(origin, path, expected, host=None):
    req = urllib.request.Request(origin + path, headers={'Host': host} if host else {})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        response = opener.open(req, timeout=8)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        status_code = response.code
        headers = {k.lower(): v for k, v in response.headers.items()}
        body = response.read(4097)
    need(status_code == expected, 'RUNTIME_HTTP_STATUS')
    need(len(body) <= 4096 and 'set-cookie' not in headers, 'RUNTIME_RESPONSE_BOUNDARY')
    need(headers.get('referrer-policy') == 'no-referrer', 'RUNTIME_REFERRER_POLICY')
    need(headers.get('x-content-type-options') == 'nosniff', 'RUNTIME_NOSNIFF')
    need('no-store' in headers.get('cache-control', ''), 'RUNTIME_NO_STORE')
    if expected == 200:
        need(json.loads(body) == {'status': 'ok'}, 'RUNTIME_HEALTH_BODY')
    return {'path': path.split('?')[0], 'status': status_code, 'noCookies': True}


def identity(args):
    app = inspect('tadazz')
    need(app['Id'] == args.expected_app_container and app['Image'] == args.expected_app_image,
         'APP_IDENTITY_CHANGED')
    need(app['State']['Running'] and not app['State'].get('Restarting'), 'APP_NOT_STABLE')
    image = inspect(args.image, 'image')
    need(image['Id'] == args.image, 'IMAGE_PIN_CHANGED')
    need((image['Config'].get('Labels') or {}).get('org.opencontainers.image.revision') == args.revision,
         'IMAGE_REVISION_CHANGED')
    need(image['Config'].get('Entrypoint') == ['node', '/app/runtime/bootstrap.mjs'] and
         image['Config'].get('Cmd') in (None, []), 'RUNTIME_LAUNCH_CONTRACT')
    env = dict(x.split('=', 1) for x in image['Config'].get('Env', []) if '=' in x)
    need(not any(k in env for k in ['JWT_SECRET', 'TADAZZ_RUNTIME_CAPABILITY_SECRET']), 'IMAGE_CONTAINS_AUTHORITY')
    plain(STORE, directory=True)
    plain(STORE / 'packages.sqlite')
    plain(CADDY)
    old = CADDY.read_bytes()
    need(digest(old) == args.expected_caddy_sha256, 'CADDY_CHANGED')
    need(subprocess.run(['docker', 'container', 'inspect', NAME], capture_output=True).returncode != 0,
         'RUNTIME_CONTAINER_ALREADY_EXISTS')
    return app, old, candidate_caddy(old)


def verify_runtime(container, args, run_id):
    data = inspect(container)
    config, host = data['Config'], data['HostConfig']
    need(data['Image'] == args.image and data['State']['Running'], 'RUNTIME_IMAGE_STATE')
    need(config.get('User') == '0:0' and config.get('Entrypoint') == ['node', '/app/runtime/bootstrap.mjs']
         and config.get('Cmd') in (None, []), 'RUNTIME_PROCESS_BOUNDARY')
    need((config.get('Labels') or {}).get('com.tadazz.runtime.deployment') == run_id, 'RUNTIME_OWNERSHIP')
    need(host.get('ReadonlyRootfs') is True and not host.get('Privileged')
         and set(host.get('CapDrop') or []) == {'ALL'} and not host.get('CapAdd')
         and set(host.get('SecurityOpt') or []) in ({'no-new-privileges'}, {'no-new-privileges=true'}),
         'RUNTIME_SECURITY_BOUNDARY')
    need(host.get('NetworkMode') == 'bridge'
         and host.get('PortBindings') == {'3192/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3192'}]},
         'RUNTIME_NETWORK_BOUNDARY')
    need(host.get('Memory') == 268435456 and host.get('MemorySwap') == 268435456
         and host.get('NanoCpus') == 500000000 and host.get('PidsLimit') == 64, 'RUNTIME_RESOURCE_BOUNDARY')
    need({(m['Type'], m['Source'], m['Destination'], m['RW']) for m in data['Mounts']} == {
        ('bind', str(STORE), '/runtime-store', False),
        ('bind', str(SECRET), '/run/secrets/runtime-capability', False)}, 'RUNTIME_MOUNT_BOUNDARY')
    env = dict(x.split('=', 1) for x in config.get('Env', []) if '=' in x)
    need(not any(k in env for k in ['JWT_SECRET', 'TADAZZ_RUNTIME_CAPABILITY_SECRET']), 'RUNTIME_ENV_AUTHORITY')
    expected = {'TADAZZ_PACKAGE_STORE': '/runtime-store', 'TADAZZ_PACKAGE_PARENT_ORIGIN': PARENT,
                'TADAZZ_PACKAGE_RUNTIME_ORIGIN': ORIGIN, 'TADAZZ_PACKAGE_RUNTIME_PORT': '3192'}
    need(all(env.get(k) == v for k, v in expected.items()), 'RUNTIME_ENV_CHANGED')


def write_private(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())


def main(args):
    need(sys.platform == 'linux' and os.geteuid() == 0, 'LINUX_ROOT_REQUIRED')
    need(IMAGE.fullmatch(args.image) and IMAGE.fullmatch(args.expected_app_image), 'IMAGE_FORMAT')
    need(HEX.fullmatch(args.expected_app_container) and HEX.fullmatch(args.expected_caddy_sha256), 'PIN_FORMAT')
    need(re.fullmatch(r'[a-f0-9]{40}', args.revision), 'REVISION_FORMAT')
    os.umask(0o077)
    lock = os.open('/run/lock/tadazz-mcp-deploy.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    app, old, updated = identity(args)
    if args.action == 'preflight':
        print(json.dumps({'preflight': 'PASS', 'image': args.image, 'mutationsPerformed': False,
                          'caddyBefore': digest(old), 'caddyAfter': digest(updated)}))
        return 0
    release = Path(args.release_dir)
    need(re.fullmatch(r'/home/ubuntu/tadazz-package-runtime-release-[a-zA-Z0-9-]+', str(release)), 'RELEASE_PATH')
    release.mkdir(mode=0o700, exist_ok=False)
    write_private(release / 'Caddyfile.before', old)
    write_private(release / 'Caddyfile.candidate', updated)
    command(['caddy', 'validate', '--adapter', 'caddyfile', '--config', str(release / 'Caddyfile.candidate')], 'CADDY_CANDIDATE_INVALID')
    report = {'success': False, 'image': args.image, 'revision': args.revision,
              'appContainer': app['Id'], 'appUnchanged': True, 'origin': ORIGIN,
              'caddyBefore': digest(old), 'caddyAfter': digest(updated), 'phase': 'secret'}
    created = None
    caddy_changed = False
    run_id = secrets.token_hex(16)
    creation_requested = False
    try:
        env = dict(x.split('=', 1) for x in app['Config']['Env'] if '=' in x)
        signing = env.get('JWT_SECRET', '')
        need(len(signing) >= 32, 'PERSISTENT_SIGNING_SECRET_REQUIRED')
        derived = hmac.new(signing.encode(), b'tadazz-package-runtime-v1', hashlib.sha256).hexdigest().encode()
        if not SECRET_ROOT.exists():
            SECRET_ROOT.mkdir(mode=0o700)
        need(stat.S_IMODE(plain(SECRET_ROOT, directory=True).st_mode) == 0o700, 'SECRET_DIRECTORY_MODE')
        if SECRET.exists():
            info = plain(SECRET)
            need(stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1
                 and hmac.compare_digest(SECRET.read_bytes(), derived), 'SECRET_IDENTITY_CHANGED')
        else:
            write_private(SECRET, derived)
        del derived, signing, env
        report['phase'] = 'container'
        argv = ['docker', 'run', '--detach', '--pull=never', '--name', NAME,
                '--restart', 'unless-stopped', '--network', 'bridge', '--read-only', '--user', '0:0',
                '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                '--cpus', '0.5', '--memory', '256m', '--memory-swap', '256m', '--pids-limit', '64',
                '--publish', '127.0.0.1:3192:3192',
                '--mount', 'type=bind,source=' + str(STORE) + ',target=/runtime-store,readonly',
                '--mount', 'type=bind,source=' + str(SECRET) + ',target=/run/secrets/runtime-capability,readonly',
                '--env', 'TADAZZ_PACKAGE_STORE=/runtime-store',
                '--env', 'TADAZZ_PACKAGE_PARENT_ORIGIN=' + PARENT,
                '--env', 'TADAZZ_PACKAGE_RUNTIME_ORIGIN=' + ORIGIN,
                '--env', 'TADAZZ_PACKAGE_RUNTIME_PORT=3192',
                '--label', 'com.tadazz.role=package-runtime',
                '--label', 'com.tadazz.runtime.deployment=' + run_id,
                '--label', 'org.opencontainers.image.revision=' + args.revision, args.image]
        creation_requested = True
        created = command(argv, 'RUNTIME_CREATE_FAILED').decode().strip()
        need(HEX.fullmatch(created), 'RUNTIME_CONTAINER_ID')
        report['container'] = created
        for attempt in range(30):
            try:
                probe('http://127.0.0.1:3192', '/health', 200, HOST)
                break
            except (OSError, GateError):
                if attempt == 29:
                    raise GateError('RUNTIME_LOCAL_START_FAILED') from None
                time.sleep(0.5)
        probe('http://127.0.0.1:3192', '/render?ticket=runtime-readiness-probe&theme=invalid', 403, HOST)
        verify_runtime(created, args, run_id)
        report['phase'] = 'https-route'
        need(digest(CADDY.read_bytes()) == args.expected_caddy_sha256, 'CADDY_RACED')
        temporary = CADDY.with_name('Caddyfile.package-runtime-candidate')
        write_private(temporary, updated)
        os.chmod(temporary, stat.S_IMODE(CADDY.stat().st_mode))
        os.replace(temporary, CADDY)
        caddy_changed = True
        command(['systemctl', 'reload', 'caddy'], 'CADDY_RELOAD_FAILED')
        report['probes'] = [probe(ORIGIN, '/health', 200),
                            probe(ORIGIN, '/render?ticket=runtime-readiness-probe&theme=invalid', 403)]
        verify_runtime(created, args, run_id)
        current = inspect('tadazz')
        need(current['Id'] == app['Id'] and current['Image'] == app['Image'] and current['State']['Running'], 'APP_CHANGED')
        report.update(success=True, phase='verified', readOnlyStore=True, noAccountAuthority=True)
    except Exception as error:
        report['failureCode'] = str(error) if isinstance(error, GateError) else type(error).__name__
        if creation_requested and not created:
            recovery = subprocess.run(['docker', 'container', 'inspect', NAME], capture_output=True, timeout=15)
            if recovery.returncode == 0:
                possible = json.loads(recovery.stdout)[0]
                if (possible['Config'].get('Labels') or {}).get('com.tadazz.runtime.deployment') == run_id and possible['Image'] == args.image:
                    created = possible['Id']
                    report['container'] = created
                    report['uncertainCreationReconciled'] = True
            else:
                report['runtimeCreationNotObserved'] = True
        if caddy_changed:
            need(digest(CADDY.read_bytes()) == digest(updated), 'ROLLBACK_CADDY_RACED')
            rollback = CADDY.with_name('Caddyfile.package-runtime-rollback')
            write_private(rollback, old)
            os.chmod(rollback, stat.S_IMODE(CADDY.stat().st_mode))
            os.replace(rollback, CADDY)
            command(['systemctl', 'reload', 'caddy'], 'CADDY_ROLLBACK_FAILED')
            report['caddyRestored'] = True
        if created:
            command(['docker', 'stop', '--time', '10', created], 'RUNTIME_STOP_FAILED')
            report['runtimeRetainedStopped'] = True
    finally:
        report['finishedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        write_private(release / 'runtime-deployment-result.json', (json.dumps(report, indent=2) + '\n').encode())
        print(json.dumps(report))
        os.close(lock)
    return 0 if report['success'] else 1


def self_test():
    old = b'{\n log default { format filter { fields { request>uri delete\n request>headers>Referer delete } } }\n}\ntadazz.com { reverse_proxy 127.0.0.1:3000 }\nwww.tadazz.com {\n redir https://tadazz.com{uri} permanent\n}\n'
    new = candidate_caddy(old)
    assert b'tadazz.com { reverse_proxy 127.0.0.1:3000 }' in new
    assert new.count(b'@package_runtime path /render /health') == 1
    assert b'redir https://tadazz.com{uri} permanent' in new
    for bad in [old + b'www.tadazz.com { redir https://tadazz.com{uri} permanent }\n',
                old.replace(b'request>uri delete', b'request>uri keep'),
                old.replace(b'www.tadazz.com', b'elsewhere.example')]:
        try:
            candidate_caddy(bad)
        except GateError:
            continue
        raise AssertionError('Invalid Caddy boundary accepted')
    print(json.dumps({'selfTest': 'PASS', 'checks': ['scoped-route-change', 'redirect-preserved', 'log-redaction-required', 'ambiguous-site-denied']}))


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
        raise SystemExit(0)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--action', choices=['preflight', 'deploy'], default='preflight')
    parser.add_argument('--image', required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--expected-app-container', required=True)
    parser.add_argument('--expected-app-image', required=True)
    parser.add_argument('--expected-caddy-sha256', required=True)
    parser.add_argument('--release-dir')
    try:
        raise SystemExit(main(parser.parse_args()))
    except Exception as error:
        print(json.dumps({'success': False, 'failureCode': str(error) if isinstance(error, GateError) else type(error).__name__}))
        raise SystemExit(1)
