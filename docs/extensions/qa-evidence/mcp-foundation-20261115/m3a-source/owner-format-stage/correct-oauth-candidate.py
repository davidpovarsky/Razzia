"""Correct a scoped source candidate in another RAM root; retain the first attempt."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'.git').exists())
NAME='mcp-oauth-F-20261115-01a1dfaa'
manifest=json.loads((HERE/'oauth-01/final-input-manifest.json').read_text())
overlay={}
for row in manifest['files']:
    data=(ROOT/row['path']).read_bytes();row.update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
    if row['path'] in manifest['deltaPaths']:overlay[row['path']]=base64.b64encode(data).decode()
manifest['kind']='OAUTH_FIXED_TYPECHECK_WORKTREE_CANDIDATE'
formatter=(HERE/'oauth-01/format-and-compare.mjs').read_text()
formatter=formatter.replace('/ram/work','/ram/work-oauth-fixed').replace('/delivery/final-input-manifest.json','/evidence/fixed-raw-input-manifest.json')
formatter=formatter.replace('/evidence/formatted','/evidence/fixed-formatted').replace('/evidence/semantic-equivalence.json','/evidence/fixed-semantic-equivalence.json')
script=r'''
import base64,hashlib,json,os,subprocess
from pathlib import Path
E=Path('/evidence');base=Path('/ram/work');root=Path('/ram/work-oauth-fixed');module='extensions/src/mcp-app/'
assert os.getuid()==1001 and (E/'awaiting-owned-finish.json').exists() and not root.exists()
old=json.loads((E/'formatted-input-manifest.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for row in old['files']:assert sha(base/row['path'])==row['sha256'],row['path']
manifest=MANIFEST
overlay={name:base64.b64decode(data) for name,data in OVERLAY.items()}
for row in manifest['files']:
    name=row['path'];data=overlay[name] if name in overlay else (base/name).read_bytes()
    assert hashlib.sha256(data).hexdigest()==row['sha256'] and len(data)==row['bytes'],name
    target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);target.chmod(0o444)
(root/module/'node_modules').symlink_to(base/module/'node_modules',target_is_directory=True)
(root/'node_modules').symlink_to(base/module/'node_modules',target_is_directory=True)
(E/'fixed-raw-input-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(E/'format-fixed.mjs').write_text(FORMATTER)
env=dict(os.environ,HOME='/ram/home',TMPDIR='/ram/tmp',XDG_CACHE_HOME='/ram/home/.cache',
    XDG_DATA_HOME='/ram/home/.local/share',XDG_STATE_HOME='/ram/home/.local/state',XDG_RUNTIME_DIR='/ram/runtime',
    PNPM_HOME='/ram/pnpm',npm_config_cache='/ram/npm-cache',NPM_CONFIG_USERCONFIG='/ram/empty-user.npmrc',
    NPM_CONFIG_GLOBALCONFIG='/ram/empty-global.npmrc',NODE_OPTIONS='',NODE_PATH='',NO_UPDATE_NOTIFIER='1',
    MCP_SYNTHETIC_REVIEW_EVIDENCE='/evidence/review-witnesses')
checks=lambda folder:[str(p.relative_to(root/module)) for p in sorted((root/module/folder).glob('*.nodecheck.ts'))]
tsx=['node',str(base/module/'node_modules/tsx/dist/cli.mjs'),'--tsconfig','tsconfig.json','--test','--test-concurrency=1']
phases={}
for name,command in [('06-fixed-format',['node','/evidence/format-fixed.mjs']),
    ('07-fixed-typecheck',['node',str(base/module/'node_modules/typescript/lib/tsc.js'),'--noEmit','-p','tsconfig.json']),
    ('08-fixed-first-party-oauth',tsx+checks('tests/first-party')),('09-fixed-sdk',tsx+checks('tests/server'))]:
    r=subprocess.run(['python3','/delivery/run-phase.py',name,*command],cwd=root/module,env=env)
    phases[name]=r.returncode
    if r.returncode:break
final=json.loads((E/'fixed-formatted-input-manifest.json').read_text())
for row in final['files']:assert sha(root/row['path'])==row['sha256'],row['path']
for row in old['files']:assert sha(base/row['path'])==row['sha256'],row['path']
(E/'fixed-candidate-summary.json').write_text(json.dumps({'phases':phases,'sourceInputs':len(final['files']),
    'manifestSha256':sha(E/'fixed-formatted-input-manifest.json'),'originalAttemptPreserved':True,
    'actualCustomerOrHostAccount':False,'dependencyInstallRepeated':False},indent=2)+'\n')
print(json.dumps({'phases':phases,'sourceInputs':len(final['files'])}),flush=True)
raise SystemExit(0 if len(phases)==4 and not any(phases.values()) else 1)
'''.replace('MANIFEST',repr(manifest)).replace('OVERLAY',repr(overlay)).replace('FORMATTER',repr(formatter))
SSH=['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-i',
    'C:/Users/DAVID/.ssh/tadazz_oracle_2026','ubuntu@132.145.25.168']
r=subprocess.run(SSH+['sudo -n docker exec -i tadazz-hq-'+NAME+' python3 -'],input=script,text=True,capture_output=True)
(HERE/'oauth-01/fixed-dispatch.json').write_text(json.dumps({'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr},indent=2)+'\n')
print(json.dumps({'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr},indent=2))
raise SystemExit(r.returncode)
