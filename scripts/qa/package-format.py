"""Format only new task-owned text files, then report their focused lint result."""
import json, os, pathlib, subprocess, tarfile
if os.environ.get('TADAZZ_REMOTE_QA') != '1' or pathlib.Path.cwd() != pathlib.Path('/cleanup'):
    raise SystemExit('Remote isolated /cleanup required')
files = json.loads(pathlib.Path('/tmp/package-format-files.json').read_text())
if any(pathlib.Path(p).is_absolute() or '..' in pathlib.Path(p).parts for p in files):
    raise SystemExit('Unsafe path inventory')
with open('/evidence/new-format.log','w') as log:
    code = subprocess.run(['pnpm','exec','prettier','--write',*files],stdout=log,stderr=subprocess.STDOUT).returncode
source = [p for p in files if p.endswith(('.ts','.tsx')) and not p.endswith('.d.ts')]
for attempt in range(4):
    with open('/evidence/new-lint-fixes.json','w') as log:
        subprocess.run(['pnpm','exec','oxlint','--fix','--format','json',*source],stdout=log,stderr=subprocess.STDOUT)
    with open('/evidence/new-format-after-fix.log','w') as log:
        subprocess.run(['pnpm','exec','prettier','--write',*files],stdout=log,stderr=subprocess.STDOUT)
    with open('/evidence/new-lint.json','w') as log:
        lint = subprocess.run(['pnpm','exec','oxlint','--format','json',*source],stdout=log,stderr=subprocess.STDOUT).returncode
    diagnostics = json.loads(pathlib.Path('/evidence/new-lint.json').read_text()).get('diagnostics',[])
    padding = {}
    for diagnostic in diagnostics:
        if diagnostic.get('code') == '@stylistic(padding-line-between-statements)':
            padding.setdefault(diagnostic['filename'],set()).add(diagnostic['labels'][0]['span']['line'])
    if not padding:
        break
    for filename, lines in padding.items():
        if filename not in source:
            raise SystemExit('Unexpected formatter target')
        target = pathlib.Path(filename)
        content = target.read_text().splitlines(keepends=True)
        for number in sorted(lines,reverse=True):
            if number > 1 and content[number-2].strip():
                content.insert(number-1,'\n')
        target.write_text(''.join(content))
with tarfile.open('/evidence/formatted-source.tar.gz','w:gz') as archive:
    for p in files: archive.add(p,arcname=p)
pathlib.Path('/evidence/format-lint-status.json').write_text(json.dumps({'format':code,'lint':lint}))
