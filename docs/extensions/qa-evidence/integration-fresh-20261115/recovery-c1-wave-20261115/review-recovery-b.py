import datetime,hashlib,json,pathlib,subprocess
base=pathlib.Path('C:/Users/DAVID/Code/Razzia-worktrees')
producer=base/'tadazz-hq-recovery-fresh-20261115'
target=base/'tadazz-hq-integration-20261115'
p=producer/'docs/extensions/qa-evidence/recovery-fresh-20261115'
source='9934b9522c4296c049197c2c5589cc75c53db697'
audit=json.loads((p/'c1-wave-source-audit.json').read_text())
rows=[]
for entry in audit['files']:
    path=entry['file']
    raw=subprocess.check_output(['git','-C',str(producer),'show',f'{source}:{path}'])
    assert hashlib.sha256(raw).hexdigest()==entry['sha256'],path
    assert (producer/path).read_bytes()==raw,path
    prior=subprocess.run(['git','-C',str(target),'show',f'96767de6d40b594324687e15b0f386b87dd7ef19:{path}'],capture_output=True)
    dest=target/path
    if dest.exists(): assert prior.returncode==0 and dest.read_bytes()==prior.stdout, f'Protect integrated changes: {path}'
    else: assert prior.returncode!=0,path
    rows.append(dict(path=path,sha256=entry['sha256'],new=not dest.exists(),base_compatible=True))
packets=[]
for n,count,children,kills in [(5,8,0,0),(6,134,24,8),(7,48,3,1)]:
    local=p/f'c1-execution-wave-packet{n}'
    manifest=json.loads((local/'server-download-manifest.json').read_text())
    assert len(manifest['files'])==count
    for row in manifest['files']:
        path=(local/row['path']).resolve()
        assert path.is_relative_to(local.resolve())
        raw=path.read_bytes()
        assert len(raw)==row['bytes'] and hashlib.sha256(raw).hexdigest()==row['sha256'],str(path)
    outcomes=list(local.rglob('*.result.json'))
    assert len(outcomes)==children
    killcount=0
    for file in outcomes:
        x=json.loads(file.read_text())
        assert x['event']=='close' and x['observationErrors']==[]
        assert (x['signal']=='SIGKILL' and x['code'] is None) or (x['signal'] is None and x['code']==0)
        killcount+=x['signal']=='SIGKILL'
        for stream in x['streams'].values():
            raw=(file.parent/stream['file']).read_bytes()
            assert len(raw)==stream['bytes'] and hashlib.sha256(raw).hexdigest()==stream['sha256']
    assert killcount==kills
    stopped=json.loads((local/'host/runner-after-stop.json').read_text())
    assert not stopped['state']['Running'] and stopped['state']['Pid']==0 and not stopped['state']['OOMKilled']
    if n in [6,7]:
        summary=json.loads((local/'resource-summary.json').read_text())
        assert summary['maxPidLimitEvents']==summary['maxZombiesObserved']==0
        assert summary['maxPidsPeak']<=96 and summary['minFreeBytes']>2147483648
    packets.append(dict(packet=n,rawFilesVerified=count,childOutcomes=children,sigkill=kills,exit0=children-kills,container=stopped['id'],stopped=True))
native=json.loads((p/'c1-execution-wave-packet6/host/analysis.json').read_text())
assert native['summaries'][0]['passed']==1 and native['summaries'][1]['passed']==11
assert len(native['nativeKillChecks'])==6
for case in native['nativeKillChecks']:
    assert len(set([case['killedPid'],*case['replayPids']]))==3
for n in [6,7]:
    for stage in (['before','failed-startup-witness','actual-native'] if n==6 else ['before','failed-startup-witness']):
        x=json.loads((p/f'c1-execution-wave-packet{n}/host/merged-{stage}.json').read_text())
        assert x['mismatches']==[] and x['files']==1288 and x['aux']==2 and x['retainedFiles']==1391
result=dict(captured_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),producer=source,application='e1fb1b28420a62acca17ddd69f1e72b3a9d27907',observer='47b68268375b5adf8c56a8496882830bc5922de3',sourcePaths=rows,packets=packets,status='PASS_SCOPED_C1_PRODUCER_QUALIFICATION_REVIEW',scope='one synchronous cooperating writer; feature OFF; no production or full task acceptance',old37='REUSED_OLD_PROFILE_NOT_RERUN',historicalGoCause='NOT_ESTABLISHED')
out=pathlib.Path(__file__).parent/'recovery-b-manager-review.json'
out.write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(dict(sourceFiles=len(rows),packets=packets,status=result['status']),indent=2))
