"""Collect only named regular QA reports; never storage state, data volumes or traces."""
import collections, gzip, hashlib, json, os, pathlib, shutil

if os.environ.get('TADAZZ_REMOTE_QA') != '1' or pathlib.Path.cwd() != pathlib.Path('/cleanup'):
    raise SystemExit('Remote isolated /cleanup required')
root = pathlib.Path('/evidence')
out = root/'delivery'
out.mkdir(exist_ok=True)
names = [
    'root-units.json', 'extension-units.json', 'static-status.json',
    'format-lint-status.json', 'new-lint.json', 'modified-lint-comparison.json',
    'baseline-lint-summary.json', 'package-browser-report.json', 'package-browser.log',
    'current-ui-browser-report.json', 'current-ui-browser.log',
    'current-upstream-browser.log', 'legacy-browser-report.json', 'legacy-browser.log',
    'baseline-webkit-browser-report.json', 'baseline-webkit-browser.log',
    'build.log', 'web-types.log', 'socket-types.log', 'extension-types.log',
    'authoring-types.log', 'e2e-types.log', 'authoring-smoke.log',
    'staging-redeploy-status.json', 'staging-restore-status.json',
    'package-staging-config-smoke.json', 'package-staging-restore-smoke.json',
    'protected-apps-proof.json', 'delivery.json',
]
baseline = json.loads((root/'baseline-lint.json').read_text())['diagnostics']
(root/'baseline-lint-summary.json').write_text(json.dumps({'diagnostics':len(baseline),'severity':dict(collections.Counter(d['severity'] for d in baseline)),'rules':dict(collections.Counter(d['code'] for d in baseline))},indent=2))
for name in names:
    source = root/name
    if not source.is_file() or source.is_symlink():
        raise SystemExit(f'Missing regular QA report: {name}')
    data = source.read_bytes()
    if 'browser' in name and name.endswith('.json'):
        report = json.loads(data)
        data = json.dumps({key: report[key] for key in ['stats', 'suites', 'errors'] if key in report}, indent=2).encode()
    if len(data) > 4096:
        (out/(name+'.gz')).write_bytes(gzip.compress(data, mtime=0))
    else:
        (out/name).write_bytes(data)
upstream = pathlib.Path('packages/e2e/test-results/upstream-parity-report.json')
report = json.loads(upstream.read_text())
(out/'current-upstream-browser-report.json.gz').write_bytes(gzip.compress(json.dumps({key: report[key] for key in ['stats','suites','errors'] if key in report},indent=2).encode(),mtime=0))
screens = out/'screenshots'
screens.mkdir(exist_ok=True)
allowed = {'declarative-private-preview.png','independent-arcade-layout.png','independent-cinematic-layout.png','package-preflight-preview.png','package-live-host.png','package-live-player.png','package-live-display-4x3.png','renderer-fallback-retained-room.png'}
for source in pathlib.Path('packages/e2e/test-results/package-runtime').rglob('*.png'):
    if source.name in allowed and source.is_file() and not source.is_symlink():
        prefix = 'webkit-' if source.parent.name.endswith('webkit') else 'chromium-'
        shutil.copyfile(source, screens/(prefix+source.name))
checksums = []
for source in sorted(out.rglob('*')):
    if source.is_file() and source.name != 'SHA256SUMS':
        checksums.append(f'{hashlib.sha256(source.read_bytes()).hexdigest()}  {source.relative_to(out).as_posix()}')
(out/'SHA256SUMS').write_text('\n'.join(checksums)+'\n')
print(json.dumps({'regularArtifacts':len(checksums),'screenshots':len(list(screens.glob('*.png'))),'privateDataIncluded':False}))
