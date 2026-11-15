import os,sys,json,hashlib,pathlib,subprocess,time,shutil
ROOT=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
SHA='4138cccbb0f234fd4eb4a426c5d12413cddc6535'
OLD='9593f24f287f2e404f387f6359e89453cd8a971e'
SRC=ROOT/'source'/('recovery-r2-'+SHA)
BASE=ROOT/'fixtures'/('recovery-r2-'+OLD)/'work'
FIX=ROOT/'fixtures'/('recovery-r2-'+SHA)
EVID=ROOT/'evidence'/('recovery-r2-'+SHA)
RUN='tadazz-hq-recovery-r2-20261115'
ARCHIVED='tadazz-hq-recovery-r2-9593f24-20261115'
IMAGE='sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647'
DOCKER=['sudo','-n','docker']
def invoke(args,**kwargs):return subprocess.run(args,check=True,text=True,**kwargs)
def docker(*args):return subprocess.check_output(DOCKER+list(args),text=True)
def save(name,data):
    (EVID/name).write_text(json.dumps(data,indent=2)+'\n')
def base_verify(label):
    manifest=json.loads((ROOT/'source'/('recovery-r2-'+OLD)/'source-manifest.json').read_text())
    bad=[]
    for f in manifest['files']:
        p=BASE/f['path']
        if not p.is_file() or p.stat().st_size!=f['size'] or hashlib.sha256(p.read_bytes()).hexdigest()!=f['sha256']:bad.append(f['path'])
    save('base-'+label+'.json',{'priorCommit':OLD,'verifiedFiles':len(manifest['files']),'mismatches':bad})
    if bad:raise RuntimeError('prior source changed '+str(bad))
def resource():
    used=sum(int(subprocess.check_output(['du','-sb',str(p)],text=True).split()[0]) for p in (SRC,FIX,EVID) if p.exists())
    inspect=json.loads(docker('inspect','--size',RUN))[0]
    used+=inspect.get('SizeRw',0)
    return {'time':time.time(),'freeBytes':shutil.disk_usage(ROOT).free,'newBytes':used,'sizeRw':inspect.get('SizeRw',0),'running':inspect['State']['Running']}
def merged(label):
    with (EVID/('merged-'+label+'.json')).open('w') as out:invoke(DOCKER+['exec',RUN,'node','/inputs/verify-merged.cjs'],stdout=out)
def run_job(name,wd,args,env=None):
    if (EVID/(name+'.exit')).exists():raise RuntimeError('no result overwrite '+name)
    r=resource()
    if r['freeBytes']<2600*1024*1024:raise RuntimeError('initial disk below 2600 MiB')
    if r['newBytes']>96*1024*1024:raise RuntimeError('new bytes exceed 96 MiB')
    cmd=DOCKER+['exec','-w',wd,RUN]
    if env:cmd+=['env']+[k+'='+v for k,v in env.items()]
    cmd+=args
    with (EVID/(name+'.log')).open('w') as out,(EVID/(name+'-resources.jsonl')).open('w') as resources:
        p=subprocess.Popen(cmd,stdout=out,stderr=subprocess.STDOUT)
        while True:
            r=resource();resources.write(json.dumps(r)+'\n');resources.flush()
            if r['freeBytes']<2*1024**3 or r['newBytes']>96*1024**2:
                docker('stop','--time','10',RUN);p.wait();(EVID/(name+'.exit')).write_text('INFRA_HOLD\n');raise RuntimeError('resource floor/budget breached '+json.dumps(r))
            try:code=p.wait(timeout=10);break
            except subprocess.TimeoutExpired:pass
    (EVID/(name+'.exit')).write_text(str(code)+'\n')
    print(name,code,flush=True)
    return code
def setup():
    if (EVID/'container-id.txt').exists():raise RuntimeError('runner already created')
    if shutil.disk_usage(ROOT).free<2600*1024**2:raise RuntimeError('setup disk below 2600 MiB')
    EVID.mkdir(exist_ok=True);FIX.mkdir(exist_ok=True)
    base_verify('before')
    manifest=json.loads((SRC/'staged-manifest.json').read_text())
    for f in manifest['files']+manifest['aux']:
        p=(SRC/'overlay'/f['path']) if f.get('source')=='overlay' else BASE/f['path']
        if p.stat().st_size!=f['size'] or hashlib.sha256(p.read_bytes()).hexdigest()!=f['sha256']:raise RuntimeError('staging mismatch '+str(p))
    cache_paths=['extensions/node_modules/.vite','extensions/node_modules/.vite-temp','node_modules/.vite','node_modules/.vite-temp','packages/socket/dist','docs/extensions/qa-evidence/tadazz-next-source-parity-20261106']
    created=[];mounts=[]
    for i,p in enumerate(cache_paths):
        target=BASE/p
        if not target.exists():invoke(['sudo','-n','install','-d',str(target)]);created.append(p)
        writable=FIX/('output-'+str(i));writable.mkdir(exist_ok=True)
        mounts+=['--mount','type=bind,src='+str(writable)+',dst=/work/'+p]
    save('mountpoint-directories-created.json',{'emptyIgnoredDirectoriesOnly':created,'priorTrackedFilesUnchanged':True})
    shutil.copyfile(SRC/'tsconfig.server-r2.json',EVID/'tsconfig.server-r2.json')
    old=json.loads(docker('inspect',RUN))[0]
    if old['State']['Running'] or old['Image']!=IMAGE:raise RuntimeError('prior runner not stopped or unexpected image')
    docker('rename',RUN,ARCHIVED)
    args=['create','--name',RUN,'--pull=never','--cpus=0.25','--memory=2g','--memory-swap=2g','--network=none','--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--env','TSX_DISABLE_CACHE=1','--env','HOME=/tmp','--mount','type=bind,src='+str(BASE)+',dst=/work,readonly','--mount','type=bind,src='+str(EVID)+',dst=/qa','--mount','type=bind,src='+str(SRC)+',dst=/inputs,readonly']
    for p in [manifest['overlayDirectory']]+[p for p in manifest['changed'] if not p.startswith(manifest['overlayDirectory']+'/')]:args+=['--mount','type=bind,src='+str(SRC/'overlay'/p)+',dst=/work/'+p+',readonly']
    args+=mounts+[IMAGE,'node','-e','setInterval(()=>{}, 3600000)']
    cid=docker(*args).strip();(EVID/'container-id.txt').write_text(cid+'\n');docker('start',RUN)
    identity=json.loads(docker('inspect',RUN))[0]
    save('runner-identity.json',{k:identity[k] for k in ['Id','Image','State','Mounts','HostConfig']})
    merged('before');save('resources-before.json',resource())
    print('OVERLAY_READY',flush=True)
VITEST=['node','node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts']
FLAGS=['--maxWorkers=1','--no-file-parallelism','--reporter','verbose']
def focused():
    merged('before-focused')
    codes=[]
    codes.append(run_job('native-r2','/work/extensions',VITEST+['src/server/storage/native-binding.test.ts','src/server/storage/native-binding-r2.test.ts','src/server/storage/package-stage-r2.test.ts']+FLAGS,{'RECOVERY_NATIVE_RECEIPT_ROOT':'/qa/native-r2'}))
    codes.append(run_job('process-r2','/work/extensions',VITEST+['src/server/storage/process-interruption.test.ts']+FLAGS,{'RECOVERY_PROCESS_RECEIPT_ROOT':'/qa/process-r2'}))
    codes.append(run_job('original-focused-r2','/work/extensions',VITEST+['src/server/storage.test.ts','src/server/media-library.test.ts','src/server/storage/journal-recovery.test.ts','src/server/storage/create-recovery.test.ts','src/server/media-library-recovery.test.ts']+FLAGS,{'RECOVERY_RECEIPT_PATH':'/qa/media-focused.jsonl','RECOVERY_TRANSACTION_RECEIPT_PATH':'/qa/transactions-focused.jsonl'}))
    merged('after-focused');base_verify('after-focused');save('resources-after-focused.json',resource())
    if any(codes):raise RuntimeError('focused failure '+str(codes))
def checks():
    files=['extensions/src/server/'+p for p in ['media-library.ts','media-library.test.ts','media-library-recovery.test.ts','storage.test.ts','storage/physical-binding.ts','storage/native-recovery-adapter.ts','storage/recovery-state.ts','storage/sidecar.ts','storage/journal.ts','storage/service.ts','storage/native-binding.test.ts','storage/native-binding-r2.test.ts','storage/native-binding-child.ts','storage/native-binding-fixture.ts','storage/package-stage-r2.test.ts']]
    codes=[run_job('types-r2','/work',['node','extensions/node_modules/typescript/bin/tsc','-p','/qa/tsconfig.server-r2.json']),run_job('format-r2','/work',['node','node_modules/prettier/bin/prettier.cjs','--check']+files),run_job('freeze-r2','/work',['node','extensions/qa/tds-boundary.mjs','--files-only'])]
    merged('after-checks');base_verify('after-checks')
    if any(codes):raise RuntimeError('check failure '+str(codes))
def broad():
    for name in ['native-r2','process-r2','original-focused-r2','types-r2','format-r2','freeze-r2']:
        if (EVID/(name+'.exit')).read_text().strip()!='0':raise RuntimeError('prerequisite not green '+name)
    merged('before-broad')
    codes=[run_job('extensions-full','/work/extensions',VITEST+FLAGS),run_job('socket-build','/work/packages/socket',['node','node_modules/rolldown/bin/cli.mjs','-c']),run_job('root-socket-targeted','/work',['node','node_modules/vitest/vitest.mjs','run','--project','socket','packages/socket/src/services/config.test.ts','packages/socket/src/services/media.test.ts']+FLAGS)]
    merged('after-broad');base_verify('after-broad');save('resources-after-broad.json',resource())
    if any(codes):raise RuntimeError('broad failure '+str(codes))
def stop():
    merged('final');base_verify('final');save('resources-final.json',resource());docker('stop','--time','10',RUN)
    x=json.loads(docker('inspect','--size',RUN))[0];save('runner-after-stop.json',{'id':x['Id'],'image':x['Image'],'state':x['State'],'sizeRw':x.get('SizeRw',0)})
def review():
    merged('before-review')
    run_job('review-before','/work/extensions',VITEST+['src/server/storage/review-binding.test.ts']+FLAGS,{'RECOVERY_REVIEW_RECEIPT_ROOT':'/qa/review-before'})
    merged('after-review');base_verify('after-review')
{'review':review,'setup':setup,'focused':focused,'checks':checks,'broad':broad,'stop':stop}[sys.argv[1]]()
