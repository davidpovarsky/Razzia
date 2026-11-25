"""Owned SB2 remote runner. No production source/config/mounts/ports."""
import sys, json, hashlib, pathlib, tarfile, subprocess, time, os

ROOT = pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
CONTAINER = 'tadazz-hq-sb2-validation-20261115'
IMAGE = 'tadazz:design-system-qa-20261110'
overlay_sha = sys.argv[1]
if len(overlay_sha) != 64 or any(c not in '0123456789abcdef' for c in overlay_sha):
    raise ValueError('overlay SHA required')
name = 'sb2-port2-' + overlay_sha
source, evidence, fixtures = (ROOT / kind / name for kind in ['source','evidence','fixtures'])
for p in [source,evidence,fixtures]:
    if p.parent.parent != ROOT or not p.name.startswith('sb2-port2-'):
        raise ValueError('lease path escape')
source.mkdir(exist_ok=False); evidence.mkdir(exist_ok=False)
manifest = json.loads((fixtures / ('port2-manifest-' + overlay_sha + '.json')).read_text())
receipt = {'overlaySha':overlay_sha,'base':manifest['base'],'commands':[],'status':'RUNNING'}

def atomic_receipt():
    temporary=evidence/'receipt.json.tmp'
    temporary.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
    temporary.replace(evidence/'receipt.json')

def run(label,args,stdin=None):
    start=time.time()
    p=subprocess.run(args,input=stdin,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    output=evidence/(label+'.log');output.write_bytes(p.stdout)
    item={'label':label,'args':args,'exitCode':p.returncode,'seconds':round(time.time()-start,3),'logSha256':hashlib.sha256(p.stdout).hexdigest()}
    receipt['commands'].append(item);atomic_receipt()
    print(json.dumps(item),flush=True)
    return p.returncode

def digest_file(p,algorithm='sha256',prefix=b''):
    h=hashlib.new(algorithm);h.update(prefix)
    with p.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def extract(archive,expected):
    if digest_file(archive)!=expected:raise ValueError('archive hash mismatch')
    with tarfile.open(archive,'r:gz') as tar:
        seen=set()
        for entry in tar:
            relative=pathlib.PurePosixPath(entry.name)
            if relative.is_absolute() or '..' in relative.parts or entry.name in seen:raise ValueError('unsafe archive path')
            seen.add(entry.name)
            target=source.joinpath(*relative.parts)
            if source not in target.resolve().parents and target.resolve()!=source:raise ValueError('archive escape')
            if entry.isdir():target.mkdir(parents=True,exist_ok=True);continue
            if not entry.isfile():raise ValueError('archive link/device rejected')
            target.parent.mkdir(parents=True,exist_ok=True)
            stream=tar.extractfile(entry)
            if stream is None:raise ValueError('missing archive bytes')
            with target.open('wb') as out:
                for chunk in iter(lambda:stream.read(1024*1024),b''):out.write(chunk)
            target.chmod(0o755 if entry.mode & 0o111 else 0o644)

def audit(label):
    errors=[]
    for entry in manifest['baseline']:
        p=source/entry['path']
        if not p.is_file() or p.stat().st_size!=entry['bytes']:
            errors.append(entry['path']);continue
        prefix=('blob '+str(entry['bytes'])+'\0').encode()
        if digest_file(p,'sha1',prefix)!=entry['gitBlob']:errors.append(entry['path'])
    for entry in manifest['files']:
        p=source/entry['path']
        if not p.is_file() or digest_file(p)!=entry['sha256']:errors.append(entry['path'])
    result={'baselineFiles':len(manifest['baseline']),'overlayFiles':len(manifest['files']),'errors':errors,'status':'PASS' if not errors else 'FAIL'}
    (evidence/(label+'.json')).write_text(json.dumps(result,indent=2)+'\n')
    if errors:raise ValueError('source audit mismatch')

try:
    extract(fixtures/manifest['baseArchive']['name'],manifest['baseArchive']['sha256'])
    extract(fixtures/('port2-overlay-'+overlay_sha+'.tar.gz'),overlay_sha)
    audit('source-before')
    # Genuine reference commits/trees/hunk blobs; no fabricated Git responses.
    for label,args in [('git-init',['git','-C',str(source),'init','-q']),('git-index-pack',['git','-C',str(source),'index-pack','--stdin'])]:
        data=(fixtures/manifest['gitReferences']['name']).read_bytes() if label=='git-index-pack' else None
        if data is not None and hashlib.sha256(data).hexdigest()!=manifest['gitReferences']['sha256']:raise ValueError('git pack hash mismatch')
        if run(label,args,data):raise RuntimeError(label)
    for label,args in [('git-ref',['git','-C',str(source),'update-ref','refs/heads/sb2-validation',manifest['base']]),('git-head',['git','-C',str(source),'symbolic-ref','HEAD','refs/heads/sb2-validation']),('git-index',['git','-C',str(source),'read-tree',manifest['base']]),('git-stage',['git','-C',str(source),'add','--','extensions/src/core/show-library'])]:
        if run(label,args):raise RuntimeError(label)
    create=['sudo','-n','docker','run','-d','--name',CONTAINER,'--cpus=0.75','--memory=3g','--pids-limit=256','--network=none','--workdir=/workspace','--env','GIT_CONFIG_COUNT=1','--env','GIT_CONFIG_KEY_0=safe.directory','--env','GIT_CONFIG_VALUE_0=/workspace','-v',str(source)+':/workspace','-v',str(evidence)+':/evidence','-v',str(fixtures)+':/fixtures','--entrypoint=sleep',IMAGE,'infinity']
    if run('container-create',create):raise RuntimeError('container create')
    prefix=['sudo','-n','docker','exec',CONTAINER]
    if run('toolchain',prefix+['sh','-c','node --version && pnpm --version && command -v node && du -sh /root/.local/share/pnpm/store/v11']):raise RuntimeError('toolchain')
    if run('cache-copy',prefix+['cp','-a','/root/.local/share/pnpm/store/v11','/fixtures/pnpm-store']):raise RuntimeError('cache copy')
    if run('dependencies-offline',prefix+['pnpm','install','--offline','--frozen-lockfile','--ignore-scripts','--store-dir=/fixtures/pnpm-store']):raise RuntimeError('offline dependencies; no automatic network fallback')
    tests=['src/core/show-library/'+name+'.test.ts' for name in ['identity','registry','projection','preview-port']]
    run('focused-tests',['sudo','-n','docker','exec','-w','/workspace/extensions',CONTAINER,'node','node_modules/vitest/vitest.mjs','run',*tests,'--maxWorkers=1','--no-file-parallelism','--reporter=json','--outputFile=/evidence/focused-tests.json'])
    run('focused-types',prefix+['node','extensions/node_modules/typescript/bin/tsc','--project','extensions/src/core/show-library/tsconfig.focused.json'])
    run('scoped-format',prefix+['node','node_modules/prettier/bin/prettier.cjs','--check','--no-config','--no-semi','--tab-width','2','--single-quote','false','--print-width','80','--trailing-comma','all','extensions/src/core/show-library'])
    for label,script in [('design','tds-design-check.mjs'),('tokens','tds-token-registry.mjs'),('catalog','tds-catalog-check.mjs'),('freeze','tds-boundary.mjs')]:
        run(label,prefix+['node','extensions/qa/'+script,*(['--check'] if label=='tokens' else [])])
    audit('source-after')
    run('lease-diff',['git','-C',str(source),'diff','--name-status',manifest['base']])
    receipt['status']='FINISHED_CHECK_RECEIPTS'
except Exception as error:
    receipt['status']='FAILED';receipt['failure']=str(error)
    print(json.dumps({'failure':str(error)}),flush=True)
finally:
    atomic_receipt()
    # Leave our container/evidence intact for inspected fixes; release explicitly after milestone.
