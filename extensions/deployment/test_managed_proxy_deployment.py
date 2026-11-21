import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


DEPLOY = module('managed_deploy', 'deploy-mcp-site.py')
PROXY = module('managed_proxy', 'configure-managed-client-proxy.py')


def before():
    def route(host, port):
        return {'match': [{'host': [host]}], 'handle': [{'handler': 'subroute', 'routes': [
            {'handle': [{'handler': 'reverse_proxy', 'upstreams': [{'dial': port}]}]}
        ]}]}
    return {'apps': {'http': {'servers': {'srv0': {'routes': [
        route('tadazz.com', '127.0.0.1:38991'),
        route('tadazz.com', '127.0.0.1:3000'),
        route('preview.example.invalid', '127.0.0.1:3000'),
        route('www.tadazz.com', '127.0.0.1:3192'),
    ]}}}}}


def target(config):
    return config['apps']['http']['servers']['srv0']['routes'][1]['handle'][0]['routes'][0]['handle'][0]


def options(config):
    return DEPLOY.managed_client_proxy_options(SimpleNamespace(
        managed_client_proxy_config_sha256=hashlib.sha256(DEPLOY.canonical(config)).hexdigest()))


class ProxyPolicyTests(unittest.TestCase):
    def test_exact_header_and_host_scope_accept(self):
        original = before()
        candidate = PROXY.expected_config(original)
        self.assertNotIn('headers', target(original))
        self.assertEqual(DEPLOY.managed_client_proxy_config_proof(candidate, options(candidate)), options(candidate))
        stripped = copy.deepcopy(candidate)
        del target(stripped)['headers']
        self.assertEqual(stripped, original)

    def test_stale_config_pin_and_unsafe_header_sources_rejected(self):
        candidate = PROXY.expected_config(before())
        pin = options(candidate)
        changed = copy.deepcopy(candidate)
        changed['unrelated'] = True
        with self.assertRaises(DEPLOY.GateError):
            DEPLOY.managed_client_proxy_config_proof(changed, pin)
        for placeholder in ['{http.request.header.X-Tadazz-Client-IP}', '{http.request.header.X-Forwarded-For}', '127.0.0.1']:
            changed = copy.deepcopy(candidate)
            target(changed)['headers']['request']['set']['X-Tadazz-Client-Ip'] = [placeholder]
            with self.assertRaises(DEPLOY.GateError):
                DEPLOY.managed_client_proxy_config_proof(changed, options(changed))

    def test_shared_host_ambiguous_route_or_header_append_rejected(self):
        candidate = PROXY.expected_config(before())
        for kind in ['shared-host', 'duplicate-route', 'append', 'delete', 'duplicate-case']:
            changed = copy.deepcopy(candidate)
            routes = changed['apps']['http']['servers']['srv0']['routes']
            if kind == 'shared-host':
                routes[1]['match'][0]['host'].append('preview.example.invalid')
            elif kind == 'duplicate-route':
                routes.append(copy.deepcopy(routes[1]))
            elif kind == 'append':
                target(changed)['headers']['request']['add'] = {'X-Tadazz-Client-IP': ['spoof']}
            elif kind == 'delete':
                target(changed)['headers']['request']['delete'] = ['X-Tadazz-Client-IP']
            else:
                target(changed)['headers']['request']['set']['x-tadazz-client-ip'] = ['{http.request.remote.host}']
            with self.subTest(kind=kind), self.assertRaises(DEPLOY.GateError):
                DEPLOY.managed_client_proxy_config_proof(changed, options(changed))

    def test_no_optin_preserves_environment_and_explicit_pin_adds_only_two_values(self):
        original = {'Config': {'Env': ['EXISTING=kept']}}
        self.assertIsNone(DEPLOY.managed_client_proxy_options(SimpleNamespace()))
        normal = DEPLOY.env_map(DEPLOY.desired_package_container(original)['Config']['Env'])
        opted = DEPLOY.env_map(DEPLOY.desired_package_container(original, managed_proxy=options(PROXY.expected_config(before())))['Config']['Env'])
        self.assertEqual(opted, {**normal, 'TADAZZ_MANAGED_CLIENT_TRUST_PROXY': 'loopback', 'TADAZZ_MANAGED_CLIENT_PROXY_HOST': 'tadazz.com'})


class ProxyCutoverTests(unittest.TestCase):
    def scenario(self, failure=None, apply=True):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            config = root / 'Caddyfile'
            original = (PROXY.OLD_SITE + '\n').encode()
            config.write_bytes(original)
            config.chmod(0o644)
            initial = before()
            wanted = PROXY.expected_config(initial)
            state = {'active': initial, 'failureInjected': False, 'reloads': []}
            real_atomic = PROXY.atomic_config
            real_fstat = os.fstat
            real_lstat = Path.lstat

            def root_owned(info):
                # Root ownership is an external deployment prerequisite. Keep
                # the operator's checks intact while using ordinary temp files.
                fields = list(info)
                fields[4] = fields[5] = 0
                return os.stat_result(fields)

            def atomic(data, info, expected):
                real_atomic(data, info, expected)
                if failure == 'post-replace-fsync' and not state['failureInjected']:
                    state['failureInjected'] = True
                    raise OSError('synthetic directory fsync failure after replace')
                if failure == 'signal-after-replace' and not state['failureInjected']:
                    state['failureInjected'] = True
                    signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)

            def command(argv, evidence, label):
                if label == 'adapt-before':
                    return PROXY.canonical(initial)
                if label == 'adapt-candidate':
                    return PROXY.canonical(wanted)
                if label.startswith('reload-'):
                    state['reloads'].append(label)
                    if label == 'reload-candidate':
                        state['active'] = wanted
                        if failure == 'reload-health':
                            raise PROXY.GuardError('SYNTHETIC_RELOAD_FAILURE')
                    else:
                        state['active'] = initial
                    return b''
                if label.startswith('active-'):
                    return b'active\n'
                return b''

            args = ['configure-managed-client-proxy.py', '--expected-file-sha256', PROXY.sha(original),
                    '--expected-active-sha256', PROXY.sha(PROXY.canonical(initial)),
                    '--expected-app-container', 'a' * 64, '--expected-app-image', 'sha256:' + 'b' * 64]
            if apply:
                args.append('--apply')
            with patch.object(PROXY, 'CONFIG', config), patch.object(PROXY, 'LOCK', root / 'lock'), \
                    patch.object(PROXY, 'EVIDENCE_PARENT', root), patch.object(PROXY, 'command', command), \
                    patch.object(PROXY, 'active_config', lambda: copy.deepcopy(state['active'])), \
                    patch.object(PROXY, 'inspect_application', lambda *_: {'unchanged': True}), \
                    patch.object(PROXY, 'http_json', lambda *_args, **_kwargs: {'status': 'ok'}), \
                    patch.object(PROXY, 'atomic_config', atomic), patch('sys.argv', args), \
                    patch.object(PROXY.os, 'geteuid', lambda: 0), \
                    patch.object(PROXY.os, 'fstat', lambda fd: root_owned(real_fstat(fd))), \
                    patch.object(Path, 'lstat', lambda path: root_owned(real_lstat(path))), \
                    patch.object(PROXY.os, 'chown', lambda *_args: None), \
                    contextlib.redirect_stdout(io.StringIO()):
                code = PROXY.main()
            receipt = json.loads(next(root.glob('tadazz-managed-client-proxy-*/result.json')).read_bytes())
            if failure:
                self.assertEqual(code, 1)
                self.assertTrue(receipt['rolledBack'])
                self.assertFalse(receipt.get('reconciliationRequired', False))
                self.assertEqual(config.read_bytes(), original)
                self.assertEqual(state['active'], initial)
                self.assertIn('reload-rollback', state['reloads'])
            else:
                self.assertEqual(code, 0)
                self.assertTrue(receipt['ok'])
                self.assertEqual(receipt['applied'], apply)
                self.assertEqual(state['active'], wanted if apply else initial)
                self.assertEqual(config.read_bytes(), (PROXY.NEW_SITE + '\n').encode() if apply else original)

    def test_preflight_does_not_reload_or_change_live_config(self):
        self.scenario(apply=False)

    def test_exact_apply_preserves_application(self):
        self.scenario()

    def test_failure_after_replace_rolls_back(self):
        self.scenario('post-replace-fsync')

    def test_sigterm_after_replace_rolls_back(self):
        self.scenario('signal-after-replace')

    def test_reload_failure_rolls_back_file_and_active_config(self):
        self.scenario('reload-health')


if __name__ == '__main__':
    unittest.main()
