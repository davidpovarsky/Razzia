"""Repeatable frozen-cache validation of one new immutable overlay namespace."""
import pathlib, subprocess, json, hashlib, tarfile, time, sys
ROOT=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
SHA=sys.argv[1]
if len(SHA)!=64 or any(c not in '0123456789abcdef' for c in SHA):raise ValueError('SHA')
NAME='sb-metadata-'+SHA;SOURCE=ROOT/'source'/NAME;EVIDENCE=ROOT/'evidence'/NAME;FIXTURES=ROOT/'fixtures'/NAME
CONTAINER='tadazz-hq-sb-metadata-20261115';SOURCE.mkdir(exist_ok=False);EVIDENCE.mkdir(exist_ok=False)
manifest=json.loads((FIXTURES/('port3-manifest-'+SHA+'.json')).read_text())
receipt={'overlaySha':SHA,'base':manifest['base'],'portVersion':3,'identityRuleVersion':2,'commands':[],'status':'RUNNING'}
def save():
 p=EVIDENCE/'receipt.json.tmp';p.write_text(json.dumps(receipt,indent=2)+'\n');p.replace(EVIDENCE/'receipt.json')
def run(label,args,stdin=None):
 start=time.time();result=subprocess.run(args,input=stdin,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 (EVIDENCE/(label+'.log')).write_bytes(result.stdout)
 item={'label':label,'args':args,'exitCode':result.returncode,'seconds':round(time.time()-start,3),'logSha256':hashlib.sha256(result.stdout).hexdigest()}
 receipt['commands'].append(item);save();print(json.dumps(item),flush=True);return result.returncode
def digest(path,algorithm='sha256',prefix=b''):
 h=hashlib.new(algorithm);h.update(prefix)
 with path.open('rb') as stream:
  for chunk in iter(lambda:stream.read(1048576),b''):h.update(chunk)
 return h.hexdigest()
def extract(path,expected):
 if digest(path)!=expected:raise ValueError('archive SHA')
 with tarfile.open(path,'r:gz') as tar:
  seen=set()
  for item in tar:
   relative=pathlib.PurePosixPath(item.name)
   if relative.is_absolute() or '..' in relative.parts or item.name in seen:raise ValueError('unsafe archive')
   seen.add(item.name);target=SOURCE.joinpath(*relative.parts)
   if SOURCE not in target.resolve().parents and target.resolve()!=SOURCE:raise ValueError('archive escape')
   if item.isdir():target.mkdir(parents=True,exist_ok=True);continue
   if not item.isfile():raise ValueError('nonregular archive entry')
   target.parent.mkdir(parents=True,exist_ok=True)
   with target.open('wb') as out:
    stream=tar.extractfile(item)
    for chunk in iter(lambda:stream.read(1048576),b''):out.write(chunk)
   target.chmod(0o755 if item.mode&0o111 else 0o644)
def audit(label):
 errors=[]
 for entry in manifest['baseline']:
  p=SOURCE/entry['path'];prefix=('blob '+str(entry['bytes'])+'\0').encode()
  if not p.is_file() or p.stat().st_size!=entry['bytes'] or digest(p,'sha1',prefix)!=entry['gitBlob']:errors.append(entry['path'])
 for entry in manifest['files']:
  p=SOURCE/entry['path']
  if not p.is_file() or digest(p)!=entry['sha256']:errors.append(entry['path'])
 result={'status':'PASS' if not errors else 'FAIL','baselineFiles':len(manifest['baseline']),'overlayFiles':len(manifest['files']),'errors':errors}
 (EVIDENCE/(label+'.json')).write_text(json.dumps(result,indent=2)+'\n')
 if errors:raise RuntimeError('source mismatch')
try:
 extract(FIXTURES/manifest['baseArchive']['name'],manifest['baseArchive']['sha256'])
 extract(FIXTURES/('port3-overlay-'+SHA+'.tar.gz'),SHA);audit('source-before')
 if run('git-init',['git','-C',str(SOURCE),'init','-q']):raise RuntimeError('git init')
 for name in ['git-reference-objects.pack','git-freeze-blobs.pack']:
  if run('git-import-'+name,['git','-C',str(SOURCE),'index-pack','--stdin'],(FIXTURES/name).read_bytes()):raise RuntimeError('git objects')
 for label,args in [('git-ref',['update-ref','refs/heads/sb3-validation',manifest['base']]),('git-head',['symbolic-ref','HEAD','refs/heads/sb3-validation']),('git-index',['read-tree',manifest['base']]),('git-stage',['add','--','extensions/src/core/show-library'])]:
  if run(label,['git','-C',str(SOURCE),*args]):raise RuntimeError(label)
 create=['sudo','-n','docker','run','-d','--name',CONTAINER,'--cpus=0.25','--memory=2g','--pids-limit=256','--network=none','--workdir=/workspace','--env','GIT_CONFIG_COUNT=1','--env','GIT_CONFIG_KEY_0=safe.directory','--env','GIT_CONFIG_VALUE_0=/workspace','--env','PATH=/fixtures/git-runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','-v',str(SOURCE)+':/workspace','-v',str(EVIDENCE)+':/evidence','-v',str(FIXTURES)+':/fixtures','--entrypoint=sleep','tadazz:design-system-qa-20261110','infinity']
 if run('container-create',create):raise RuntimeError('container')
 prefix=['sudo','-n','docker','exec',CONTAINER]
 if run('toolchain',prefix+['sh','-c','node --version && pnpm --version && git --version']):raise RuntimeError('toolchain')
 if run('dependencies-frozen-offline',prefix+['pnpm','install','--offline','--frozen-lockfile','--ignore-scripts','--store-dir=/fixtures/pnpm-store']):raise RuntimeError('frozen cache')
 audit('source-after-dependencies')
 paths=('\n'.join(e['path'] for e in manifest['baseline'])+'\n').encode()
 if run('git-baseline-blobs',['sudo','-n','docker','exec','-i',CONTAINER,'git','-c','core.compression=1','hash-object','-w','--no-filters','--stdin-paths'],paths):raise RuntimeError('git baseline')
 tests=['src/core/show-library/'+name+'.test.ts' for name in ['stage-metadata','projection-assets','projection','preview-port']]
 run('focused-tests',['sudo','-n','docker','exec','-w','/workspace/extensions',CONTAINER,'node','node_modules/vitest/vitest.mjs','run',*tests,'--maxWorkers=1','--no-file-parallelism','--reporter=json','--outputFile=/evidence/focused-tests.json'])
 run('focused-types',prefix+['node','extensions/node_modules/typescript/bin/tsc','--project','extensions/src/core/show-library/tsconfig.focused.json'])
 run('scoped-format',prefix+['node','node_modules/prettier/bin/prettier.cjs','--check','--no-config','--no-semi','--tab-width','2','--single-quote','false','--print-width','80','--trailing-comma','all','extensions/src/core/show-library'])
 for label,script in [('design','tds-design-check.mjs'),('tokens','tds-token-registry.mjs'),('catalog','tds-catalog-check.mjs'),('freeze','tds-boundary.mjs')]:run(label,prefix+['node','extensions/qa/'+script,*(['--check'] if label=='tokens' else [])])
 run('lease-diff',prefix+['git','diff','--name-status',manifest['base']]);audit('source-after')
 run('network-state',['sudo','-n','docker','inspect','--format','{{json .NetworkSettings.Networks}}',CONTAINER])
 receipt['status']='FINISHED_CHECK_RECEIPTS'
except Exception as error:
 receipt['status']='FAILED';receipt['failure']=str(error);print(json.dumps({'failure':str(error)}),flush=True)
finally:save()
