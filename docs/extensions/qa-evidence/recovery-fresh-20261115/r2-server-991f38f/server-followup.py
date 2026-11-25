import pathlib,json,subprocess,shutil,time,hashlib
ROOT=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
SHA='991f38f216ad265e06aec53313db8928437da248'
SRC=ROOT/'source'/('recovery-r2-'+SHA)
FIX=ROOT/'fixtures'/('recovery-r2-'+SHA)/'followup'
EVID=ROOT/'evidence'/('recovery-r2-'+SHA)/'followup'
RUN='tadazz-hq-recovery-r2-20261115'
D=['sudo','-n','docker']
def docker(*args):return subprocess.check_output(D+list(args),text=True)
def save(name,data):(EVID/name).write_text(json.dumps(data,indent=2)+'\n')
def resources():
    used=0
    for sha in ['4138cccbb0f234fd4eb4a426c5d12413cddc6535','8b9593787e88ccad37e924a45b820e353074864a',SHA]:
        for k in ['source','fixtures','evidence']:used+=int(subprocess.check_output(['du','-sb',str(ROOT/k/('recovery-r2-'+sha))],text=True).split()[0])
    x=json.loads(docker('inspect','--size',RUN))[0]
    return {'time':time.time(),'freeBytes':shutil.disk_usage(ROOT).free,'newBytes':used+3*16384,'running':x['State']['Running']}
def verify(label):
    with (EVID/('merged-'+label+'.json')).open('w') as out:subprocess.run(D+['exec',RUN,'node','/inputs/verify-merged.cjs'],stdout=out,check=True)
    prior=ROOT/'fixtures/recovery-r2-9593f24f287f2e404f387f6359e89453cd8a971e/work'
    m=json.loads((ROOT/'source/recovery-r2-9593f24f287f2e404f387f6359e89453cd8a971e/source-manifest.json').read_text())
    bad=[f['path'] for f in m['files'] if hashlib.sha256((prior/f['path']).read_bytes()).hexdigest()!=f['sha256']]
    save('base-'+label+'.json',{'priorCommit':'9593f24f287f2e404f387f6359e89453cd8a971e','verifiedFiles':len(m['files']),'mismatches':bad})
    if bad:raise RuntimeError('retained prior input changed')
def job(name,args):
    before=resources()
    if before['freeBytes']<2600*1024**2 or before['newBytes']>96*1024**2:raise RuntimeError('resource start gate')
    save(name+'-before.json',before)
    with (EVID/(name+'.log')).open('w') as out,(EVID/(name+'-resources.jsonl')).open('w') as res:
        p=subprocess.Popen(D+['exec','-w','/work/extensions',RUN]+args,stdout=out,stderr=subprocess.STDOUT)
        while True:
            r=resources();res.write(json.dumps(r)+'\n');res.flush()
            if r['freeBytes']<2*1024**3 or r['newBytes']>96*1024**2:
                docker('stop','--time','10',RUN);raise RuntimeError('resource hold')
            try:code=p.wait(timeout=10);break
            except subprocess.TimeoutExpired:pass
    (EVID/(name+'.exit')).write_text(str(code)+'\n');print(name,code,flush=True)
    return code
if FIX.exists() or EVID.exists():raise RuntimeError('no followup overwrite')
if shutil.disk_usage(ROOT).free<2600*1024**2:raise RuntimeError('disk start gate')
old=json.loads(docker('inspect',RUN))[0]
if old['State']['Running'] or not old['HostConfig']['ReadonlyRootfs']:raise RuntimeError('expected stopped read-only full runner')
FIX.mkdir();EVID.mkdir()
args=['create','--name',RUN,'--pull=never','--cpus=0.25','--memory=2g','--memory-swap=2g','--network=none','--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--env','TSX_DISABLE_CACHE=1','--env','HOME=/tmp']
for i,m in enumerate(old['Mounts']):
    if m['Type']!='bind':continue
    source=m['Source']
    if m['Destination']=='/qa':source=str(EVID)
    elif m['RW']:
        folder=FIX/('output-'+str(i));folder.mkdir();source=str(folder)
    args+=['--mount','type=bind,src='+source+',dst='+m['Destination']+('' if m['RW'] else ',readonly')]
fake=FIX/'fake';fake.mkdir()
args+=['--mount','type=bind,src='+str(fake)+',dst=/fake',old['Image'],'node','-e','setInterval(()=>{},3600000)']
docker('rename',RUN,'tadazz-hq-recovery-r2-991-full-20261115')
docker(*args);docker('start',RUN)
identity=json.loads(docker('inspect',RUN))[0]
save('runner-identity.json',{k:identity[k] for k in ['Id','Image','State','Mounts','HostConfig']})
save('execution-correction.json',{'sourceCommit':SHA,'applicationChanges':False,'productionConfigChanges':False,'rootStillReadOnly':True,'additionalWritableFixtureOnly':'/fake','mapBaseDiskMirror':False,'timeoutMs':30000,'freshCachesAndOutputs':True,'priorFullRunnerId':old['Id']})
verify('before')
base=['node','node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts']
flags=['--maxWorkers=1','--no-file-parallelism','--reporter','verbose']
codes=[]
try:
    codes.append(job('api-routes',base+['src/server/api/routes.test.ts']+flags))
    codes.append(job('theme-installation-original-budget',base+['src/server/show-themes/installation.test.ts']+flags))
    verify('after')
    save('fixture-state.json',{'files':[str(p.relative_to(fake)) for p in fake.rglob('*') if p.is_file()],'quizzDirectoryExists':(fake/'quizz').exists()})
finally:
    save('resources-final.json',resources());docker('stop','--time','10',RUN)
    x=json.loads(docker('inspect','--size',RUN))[0];save('runner-after-stop.json',{'id':x['Id'],'state':x['State'],'sizeRw':x.get('SizeRw',0)})
if any(codes):raise RuntimeError('followup failures '+str(codes))
