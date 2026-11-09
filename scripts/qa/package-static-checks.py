"""Run checks serially in the disposable Oracle QA container, with actual exits."""
import argparse, json, os, pathlib, re, subprocess, time
parser = argparse.ArgumentParser()
parser.add_argument('--source-root', choices=['/cleanup', '/verify'], default='/cleanup')
parser.add_argument('--prefix', default='')
args = parser.parse_args()
if args.prefix and not re.fullmatch(r'[a-z0-9-]+', args.prefix):
    raise SystemExit('Invalid evidence prefix')
prefix = args.prefix + '-' if args.prefix else ''
if os.environ.get('TADAZZ_REMOTE_QA') != '1' or pathlib.Path.cwd() != pathlib.Path(args.source_root):
    raise SystemExit('Remote isolated source root required')
out = pathlib.Path('/evidence')
checks = [
    ('root-units', ['pnpm','test','--maxWorkers','2','--reporter=json',f'--outputFile=/evidence/{prefix}root-units.json']),
    ('extension-units', ['pnpm','--filter','@razzia/extensions','test','--maxWorkers','2','--reporter=json',f'--outputFile=/evidence/{prefix}extension-units.json']),
    ('web-types', ['pnpm','exec','tsc','--noEmit','-p','packages/web/tsconfig.app.json']),
    ('web-tooling-types', ['pnpm','exec','tsc','--noEmit','-p','packages/web/tsconfig.node.json']),
    ('socket-types', ['pnpm','exec','tsc','--noEmit','-p','packages/socket/tsconfig.json']),
    ('extension-types', ['pnpm','exec','tsc','--noEmit','-p','extensions/tsconfig.json']),
    ('authoring-types', ['pnpm','exec','tsc','--noEmit','-p','extensions/tsconfig.package-authoring.json']),
    ('e2e-types', ['pnpm','exec','tsc','--noEmit','-p','packages/e2e/tsconfig.json']),
    ('scripts-types', ['pnpm','exec','tsc','--noEmit','-p','extensions/scripts/tsconfig.json']),
    ('qa-types', ['pnpm','exec','tsc','--noEmit','-p','extensions/tsconfig.qa.json']),
    ('build', ['pnpm','build']),
    ('root-lint', ['pnpm','lint','--deny-warnings','--format','json']),
    ('format', ['pnpm','format']),
]
result = []
for name, command in checks:
    started = time.time()
    with (out/(prefix+name+'.log')).open('w') as log:
        completed = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
    result.append({'check':name,'command':command,'exitCode':completed.returncode,'seconds':round(time.time()-started,2)})
    (out/(prefix+'static-status.json')).write_text(json.dumps(result, indent=2))
    print(name, completed.returncode, flush=True)
raise SystemExit(0 if all(c['exitCode']==0 for c in result) else 1)
