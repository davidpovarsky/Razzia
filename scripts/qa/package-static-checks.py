"""Run checks serially in the disposable Oracle QA container, with actual exits."""
import json, os, pathlib, subprocess, sys
if os.environ.get('TADAZZ_REMOTE_QA') != '1' or pathlib.Path.cwd() != pathlib.Path('/cleanup'):
    raise SystemExit('Remote isolated /cleanup required')
out = pathlib.Path('/evidence')
checks = [
    ('root-units', ['pnpm','test','--maxWorkers','2','--reporter=json','--outputFile=/evidence/root-units.json']),
    ('extension-units', ['pnpm','--filter','@razzia/extensions','test','--maxWorkers','2','--reporter=json','--outputFile=/evidence/extension-units.json']),
    ('web-types', ['pnpm','exec','tsc','--noEmit','-p','packages/web/tsconfig.app.json']),
    ('socket-types', ['pnpm','exec','tsc','--noEmit','-p','packages/socket/tsconfig.json']),
    ('extension-types', ['pnpm','exec','tsc','--noEmit','-p','extensions/tsconfig.json']),
    ('authoring-types', ['pnpm','exec','tsc','--noEmit','-p','extensions/tsconfig.package-authoring.json']),
    ('e2e-types', ['pnpm','exec','tsc','--noEmit','-p','packages/e2e/tsconfig.json']),
    ('build', ['pnpm','build']),
    ('root-lint', ['pnpm','lint']),
]
result = []
for name, command in checks:
    with (out/(name+'.log')).open('w') as log:
        completed = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
    result.append({'check':name,'exitCode':completed.returncode})
    (out/'static-status.json').write_text(json.dumps(result, indent=2))
    print(name, completed.returncode, flush=True)
raise SystemExit(0 if all(c['exitCode']==0 for c in result) else 1)
