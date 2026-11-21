"""Reuse a task-owned WIP snapshot, synchronize hash-checked deltas, check on Linux."""
import base64
import hashlib
import io
import json
import pathlib
import shlex
import subprocess
import sys
import tarfile
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[3]
RUN = sys.argv[1]
MODE = sys.argv[2] if len(sys.argv) > 2 else '--focused'
assert MODE in {'--focused', '--repair-regressions', '--all-unit-tests'}, 'Unknown verification mode'
assert RUN.startswith('tadazz-gallery-wip-') and '/' not in RUN and '\\' not in RUN
EVIDENCE = ROOT / 'docs/extensions/plans/public-gallery-20261119' / RUN
original = json.loads((EVIDENCE / 'input-manifest.json').read_text(encoding='utf8'))
BASE = original.get('formatBase', 'HEAD')
previous = EVIDENCE / 'working-manifest.json'
if not previous.exists(): previous = EVIDENCE / 'formatted-manifest.json'
expected = json.loads(previous.read_text(encoding='utf8'))
names = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','extensions','packages','package.json','tsconfig.json','vitest.config.ts','pnpm-workspace.yaml','pnpm-lock.yaml','oxlint.config.ts','.prettierrc.json','.gitignore','.prettierignore','docs/extensions/references/TADAZZ_Motion_Showcase_One_Click_20261105.html'],cwd=ROOT).decode().split('\0')
names = sorted({name for name in names if name and '.bak.' not in name and (ROOT/name).is_file()})
manifest = {name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in names}
delta = {name:base64.b64encode((ROOT/name).read_bytes()).decode() for name in names if expected.get(name)!=manifest[name]}
assert sum(len(x) for x in delta.values())<50*1024**2, 'Use a new full snapshot for large deltas'
iteration = 'recheck-'+uuid.uuid4().hex[:8]
local = EVIDENCE / iteration
local.mkdir(exist_ok=False)
changed = subprocess.check_output(['git','diff','--name-only','-z',BASE],cwd=ROOT).decode().split('\0')
untracked = subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z','--','extensions','packages'],cwd=ROOT).decode().split('\0')
format_files = sorted({name for name in changed+untracked if name in manifest and pathlib.Path(name).suffix in {'.ts','.tsx','.mjs','.js','.json','.css'}})
config = {'mode':MODE,'run':RUN,'remote':original['remote'],'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip(),'iteration':iteration,'expected':expected,'manifest':manifest,'deltas':delta,'formatFiles':format_files}
(local/'input-manifest.json').write_text(json.dumps({k:v for k,v in config.items() if k!='deltas'},indent=2)+'\n',encoding='utf8')
SSH=['ssh','-i',str(pathlib.Path.home()/'.ssh/tadazz_oracle_2026'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','ubuntu@132.145.25.168']
remote=r'''
import pathlib,json,hashlib,base64,subprocess,time,atexit
c=CONFIG
root=pathlib.Path(c['remote']);source=root/'source';out=root/c['iteration'];out.mkdir(exist_ok=False)
assert {p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['expected']}==c['expected'],'Server source drift'
for name,body in c['deltas'].items():
 p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(body))
for name in c['expected']:
 if name not in c['manifest']:(source/name).unlink()
assert {p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}==c['manifest']
name=c['run']+'-checks';facts=json.loads(subprocess.check_output(['docker','inspect',name]))[0]
assert not facts['State']['Running'] and facts['Config']['Labels']['com.tadazz.qa']=='public-gallery'
subprocess.run(['docker','start',name],check=True,stdout=subprocess.DEVNULL)
atexit.register(lambda:subprocess.run(['docker','stop','--time','10',name],check=True,stdout=subprocess.DEVNULL,timeout=25))
checks=[]
def run(label,argv,seconds,cwd='/evidence/source'):
 prefix=['docker','exec','-w',cwd,'-e','TMPDIR=/tmp','-e','XDG_DATA_HOME=/tmp/vitest-data','-e','TSX_DISABLE_CACHE=1','-e','NODE_OPTIONS=--max-old-space-size=1400','-e','TADAZZ_GALLERY_EVIDENCE=/evidence/'+c['iteration']+'/account','-e','TADAZZ_GALLERY_SOURCE_SHA=WIP-'+c['head'],name,'nice','-n','19']
 start=time.time();q=subprocess.run(prefix+['timeout','-k','5',str(seconds),*argv],capture_output=True,timeout=seconds+15)
 (out/(label+'.stdout.log')).write_bytes(q.stdout);(out/(label+'.stderr.log')).write_bytes(q.stderr)
 row={'label':label,'exit':q.returncode,'seconds':round(time.time()-start,2),'command':argv};checks.append(row)
 (out/'progress.json').write_text(json.dumps(checks,indent=2)+'\n');print(json.dumps(row),flush=True)
 return q.returncode==0
lint=[p for p in c['formatFiles'] if pathlib.PurePosixPath(p).suffix in {'.ts','.tsx'}]
# Keep imported branch source intact; explicit fixes are reviewed before this run.
# The unchanged full lint report is compared separately against the exact deployed baseline.
if c['formatFiles']:run('format',['node','/cleanup/node_modules/prettier/bin/prettier.cjs','--write',*c['formatFiles']],120)
syntax_code="import ast,pathlib\nfor p in pathlib.Path('extensions/qa/public-gallery').glob('*.py'):\n tree=ast.parse(p.read_text(),filename=str(p));compile(tree,str(p),'exec')\n snippets=[tree]\n for node in ast.walk(tree):\n  if isinstance(node,ast.Constant) and isinstance(node.value,str) and node.value.lstrip().startswith('import ') and '\\n' in node.value:\n   nested=ast.parse(node.value,filename=str(p)+':remote');compile(nested,str(p)+':remote','exec');snippets.append(nested)\n for snippet in snippets:\n  for node in ast.walk(snippet):\n   if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute) and node.func.attr=='write_text' and node.args and isinstance(node.args[0],ast.BinOp) and isinstance(node.args[0].right,ast.Constant):\n    assert node.args[0].right.value!='\\\\n','Literal slash-n instead of newline'\n print(str(p)+' syntax and newline literals valid')\n"
run('qa-controller-syntax',['python3','-c',syntax_code],30)
for script in ['account-verify.mjs','browser-verify.mjs','editor-verify.mjs','palette-verify.mjs']:
 run('qa-syntax-'+script.removesuffix('.mjs'),['node','--check','extensions/qa/public-gallery/'+script],30)
formatted={p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}
tests=[]
for suffix in ['public-demo-catalogue.test.ts', 'show-themes.test.ts', 'public-catalogue-install.test.ts', 'account-preview-source.test.ts', 'application-preview-input.test.ts', 'site/tests/locales.test.ts', 'site/tests/client.test.ts', 'full-show-preview-timeline.test.ts', 'question-lead-in.test.ts', 'preview-stage-continuity.test.ts', 'tadazz-show/question-sequencing.test.ts', 'platform-controls.test.ts', 'end-answer-timer.test.ts', 'application-package-preview.test.ts', 'package-preview-scene.test.ts', 'package-runtime/projection.test.ts', 'package-runtime/question-family.test.ts', 'server/packages/transfers.test.ts', 'package-leaderboard-metadata.test.ts']:
 found=[p for p in c['manifest'] if p.startswith('extensions/') and p.endswith(suffix)];assert found;tests+=found
if c['mode']=='--all-unit-tests':
 run('extensions-unit-tests',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--configLoader','runner','--no-cache','--maxWorkers','1','--no-file-parallelism'],600,'/evidence/source/extensions')
 run('core-unit-tests',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--configLoader','runner','--no-cache','--maxWorkers','1','--no-file-parallelism'],600)
elif c['mode']=='--repair-regressions':
 ext_suffixes=['server/api/routes.test.ts','server/media-library.test.ts','server/packages/transfers.test.ts','server/storage/package-stage-r2.test.ts','server/storage/startup-recovery.test.ts','server/real-telephony-e2e.test.ts','core/show-library/native-media-library.test.ts','core/show-themes/history-audio.test.ts','presentation/show-library-preview/preview-candidate.test.ts','presentation/tadazz-show/presentation-scene.test.ts','presentation/tadazz-show/motion-spec.test.ts','presentation/tadazz-v4/full-show.test.ts','presentation/tadazz-v4/types.test.ts','server/show-themes/authoring.test.ts']
 core_suffixes=['common/src/validators/quizz.test.ts','socket/src/api/pilot-phone.test.ts','socket/src/services/game/downstream-game.test.ts','socket/src/services/game/game.test.ts','socket/src/services/game/theme-vote-completion.test.ts','web/src/locales/locales.test.ts']
 ext_tests={p for p in c['formatFiles'] if p.startswith('extensions/') and p.endswith('.test.ts')}
 core_tests={p for p in c['formatFiles'] if p.startswith('packages/') and p.endswith('.test.ts')}
 for prefix,suffixes,selected in [('extensions/',ext_suffixes,ext_tests),('packages/',core_suffixes,core_tests)]:
  for suffix in suffixes:
   found=[p for p in c['manifest'] if p.startswith(prefix) and p.endswith(suffix)];assert len(found)==1,'Repair test missing or ambiguous: '+suffix;selected.update(found)
 run('extensions-repair-tests',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--configLoader','runner','--no-cache','--maxWorkers','1','--no-file-parallelism',*[p.removeprefix('extensions/') for p in sorted(ext_tests)]],450,'/evidence/source/extensions')
 run('core-repair-tests',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--configLoader','runner','--no-cache','--maxWorkers','1','--no-file-parallelism',*sorted(core_tests)],300)
else:
 run('focused-tests',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--configLoader','runner','--no-cache',*[p.removeprefix('extensions/') for p in tests]],300,'/evidence/source/extensions')
 run('socket-demo-catalog',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts','--configLoader','runner','--no-cache','--project','socket','packages/socket/src/api/extensions/demo-catalog.test.ts','packages/socket/src/services/game/question-sequencing.test.ts','packages/socket/src/services/game/creating-worlds-repair.test.ts','packages/socket/src/handlers/end-answer-timer.test.ts'],180)
if lint:run('gallery-lint',['node','/cleanup/node_modules/oxlint/bin/oxlint','--format','json',*lint],120)
run('account-native-http',['node','/cleanup/extensions/node_modules/tsx/dist/cli.mjs','--tsconfig','tsconfig.json','extensions/qa/public-gallery/account-verify.mjs'],150)
run('phone-question-sequencing',['node','/cleanup/node_modules/vitest/vitest.mjs','run','--config','qa/phase3-phone/vitest.config.ts','--configLoader','runner','--no-cache','qa/phase3-phone/phone-v2-authority-startup.test.ts'],180,'/evidence/source/extensions')
run('extensions-types',['node','/cleanup/node_modules/typescript/bin/tsc','--noEmit','-p','extensions/tsconfig.json'],180)
run('socket-types',['node','/cleanup/node_modules/typescript/bin/tsc','--noEmit','-p','packages/socket/tsconfig.json'],180)
run('web-types',['node','/cleanup/node_modules/typescript/bin/tsc','--noEmit','-p','packages/web/tsconfig.app.json','--tsBuildInfoFile','/tmp/gallery-web.tsbuildinfo'],180)
assert {p:hashlib.sha256((source/p).read_bytes()).hexdigest() for p in c['manifest']}==formatted
report={'run':c['run'],'iteration':c['iteration'],'head':c['head'],'immutableCommit':False,'mode':c['mode'],'checks':checks,'passed':all(x['exit']==0 for x in checks if x['label']!='lint-fix'),'sourceManifest':formatted,'formattedPaths':[p for p in c['manifest'] if formatted[p]!=c['manifest'][p]],'linuxOnly':True,'customerMountUsed':False,'productionChanged':False}
(root/'working-manifest.json').write_text(json.dumps(formatted,sort_keys=True,indent=2)+'\n');(out/'receipt.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'formatted':len(report['formattedPaths'])}),flush=True)
'''.replace('c=CONFIG','c='+repr(config))
result=subprocess.run([*SSH,'sudo -n python3 -'],input=remote.encode(),capture_output=True,timeout=2400 if MODE=='--all-unit-tests' else 1800)
(local/'controller.stdout.log').write_bytes(result.stdout);(local/'controller.stderr.log').write_bytes(result.stderr)
print(result.stdout.decode(errors='replace'),flush=True)
if result.returncode:
 print(result.stderr.decode(errors='replace'));raise SystemExit(result.returncode)
pull=r'''
import pathlib,tarfile,sys,json
root=pathlib.Path(sys.argv[1]);out=root/sys.argv[2];r=json.loads((out/'receipt.json').read_text())
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz') as a:
 for p in out.rglob('*'):
  if p.is_file():a.add(p,arcname='evidence/'+str(p.relative_to(out)))
 a.add(root/'working-manifest.json',arcname='working-manifest.json')
 for p in r['formattedPaths']:a.add(root/'source'/p,arcname='formatted/'+p)
'''
result=subprocess.run([*SSH,'sudo -n python3 -c '+shlex.quote(pull)+' '+shlex.quote(original['remote'])+' '+shlex.quote(iteration)],capture_output=True,timeout=120,check=True)
copied=[]
with tarfile.open(fileobj=io.BytesIO(result.stdout),mode='r:gz') as archive:
 for member in archive:
  p=pathlib.PurePosixPath(member.name);assert member.isfile() and not p.is_absolute() and '..' not in p.parts
  b=archive.extractfile(member).read()
  if member.name.startswith('evidence/'):
   target=local/member.name.removeprefix('evidence/');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
  elif member.name=='working-manifest.json':(EVIDENCE/'working-manifest.json').write_bytes(b)
  elif member.name.startswith('formatted/'):
   name=member.name.removeprefix('formatted/');assert name in manifest
   target=ROOT/name;assert hashlib.sha256(target.read_bytes()).hexdigest()==manifest[name],'Concurrent local edit: '+name
   target.write_bytes(b);copied.append(name)
(local/'copyback.json').write_text(json.dumps({'inputHashGuarded':True,'files':copied},indent=2)+'\n',encoding='utf8')
report=json.loads((local/'receipt.json').read_text(encoding='utf8'))
print(json.dumps({'run':RUN,'iteration':iteration,'passed':report['passed'],'copiedBack':copied}),flush=True)
raise SystemExit(0 if report['passed'] else 1)
