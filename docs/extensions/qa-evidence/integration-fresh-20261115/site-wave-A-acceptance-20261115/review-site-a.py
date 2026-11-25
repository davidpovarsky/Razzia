import datetime,hashlib,json,pathlib,subprocess
root=pathlib.Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-site-20261115')
p=root/'docs/extensions/qa-evidence/site-release-20261115/wave-A-20261115'
load=lambda n:json.loads((p/n).read_text(encoding='utf-8-sig'))
before=load('rollback-before.json'); after=load('rollback-after.json'); game=load('continuity.json')
assert len(before['live'])==len(after['live'])==242
assert len(before['backup'])==len(after['backup'])==202
assert before['backup']==after['backup']
expected=dict(before['live']);expected['index.html']=before['backup']['index.html']
assert after['live']==expected
assert len(set(after['live'])-set(after['backup']))==40
assert after['runtime']['processes']==before['runtime']['processes']
obs=after['observations'];eid=after['hold']['execId']
assert len(obs)==87 and sum(x['running'] for x in obs)==79
assert all(x['execId']==eid and x['containerId'].startswith('505772e38a7c') for x in obs)
assert not obs[-1]['running'] and obs[-1]['exitCode']==0
assert after['result']==dict(classification='old-entry-full-additions',filesystemPhase='journal-fenced',identity='verified',recoveryOf=None,requestedAction='rollback',status='verified')
assert game['status']=='PASS' and game['answers']==3 and game['unchangedTimeOrigins'] and game['errors']==[]
assert len(game['samples'])==291
allowed={before['live']['index.html'],after['live']['index.html']}
assert all(x['status']==200 and x['hash'] in allowed for x in game['samples'])
for engine in ['chromium','webkit']:
    x=load(f'metadata-{engine}.json')
    assert x['status']=='PASS' and len(x['observations'])==48 and x['errors']==[]
helper=root/'docs/extensions/qa-evidence/site-release-20261115/production-entry-v1/atomic-web-publish.py'
assert hashlib.sha256(helper.read_bytes()).hexdigest()==after['hold']['helper']=='352734823777d3397ebea2515323f6565c22a22437e8cde6392526534b7003a2'
assert after['hold']['history'][0]['execId']=='0af8e929ebd92b1439a1a4b7c29fa8e86b849f8977f4ead97feeaa4ebbb15818'
remote='''import hashlib,json,pathlib
paths=['/run/tadazz-atomic-qa/175b5f805067a9953b75954abff0e839/phase2-wave-A/after.json','/home/ubuntu/tadazz-hq-qa-20261115/fixtures/atomic-3527-fault-175b5f805067a9953b75954abff0e839/control/production-operation-hold.json']
print(json.dumps([dict(path=p,bytes=pathlib.Path(p).stat().st_size,sha256=hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()) for p in paths]))
'''
q=subprocess.run(['ssh','-i','C:/Users/DAVID/.ssh/tadazz_oracle_2026','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','ubuntu@132.145.25.168','sudo -n python3 -'],input=remote,capture_output=True,text=True,timeout=25)
assert q.returncode==0,q.stderr
actual=json.loads(q.stdout)
assert actual[0]['sha256']==hashlib.sha256((p/'rollback-after.json').read_bytes()).hexdigest()=='eb33b2072f571ddbfdd22088ac132ad2a0fbe23af6fde7395784b4f1a3aeddcb'
assert actual[1]['sha256']==after['holdSha256']=='f1e41324302a6bd5f764e1444b55a01eec85aa1faa3903c1db354cc63aa820b1'
receipt=dict(captured_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),reviewer='manager01a1dfa1-57d8-7223-a965-2f4f31fe8b23',source='6c87f0431ebc3786752a5492bb988497241db7b6',status='PASS_SCOPED_SYNTHETIC_ROLLBACK_EVIDENCE_NOT_PRODUCTION',live=242,backup=202,retainedAdditions=40,observations=87,runningObservations=79,answers=3,unchangedPageTimeOrigins=True,httpSamples=291,metadata={'chromium':48,'webkit':48},remoteRehashed=actual,sourceHelperUnchanged=True,retainedOriginalPublishLink=True,limitations=['active game during original publish not proven','no fresh WebKit active rollback','production and live acceptance open','rights/customer/provider/powerloss unchanged'])
out=pathlib.Path(__file__).parent/'site-a-manager-review.json'
out.write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(json.dumps(receipt,indent=2))
