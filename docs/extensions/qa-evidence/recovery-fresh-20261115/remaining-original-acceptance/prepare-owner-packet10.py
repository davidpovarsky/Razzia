"""Assemble a bounded successor using the retained C1 controller/dependencies."""
import ast,hashlib,io,json,pathlib,re,subprocess,tarfile
HERE=pathlib.Path(__file__).resolve().parent
E=HERE.parent
BASE=E/'c1-server-packet6'
OUT=E/'c1-server-packet10'
OUT.mkdir()
sha=lambda b:hashlib.sha256(b).hexdigest()
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert head=='5ef867db68d6d6ab371964990cf2b93b8248a59e'
for v in json.loads((BASE/'packet-hashes.json').read_bytes())['files']:
 (OUT/v['path']).write_bytes((BASE/v['path']).read_bytes())
plan=json.loads((BASE/'plan.json').read_text().replace('packet6-wave','packet10-wave'))
manifest=json.loads((BASE/'manifest.json').read_text().replace('packet6-wave','packet10-wave'))
paths=list(dict.fromkeys([v['path'] for v in manifest['files']]+[
 'packages/socket/src/services/account-db.ts','extensions/src/server/storage/startup-recovery.ts',
 'extensions/src/server/storage/startup-recovery.test.ts']))
records=[]
with tarfile.open(OUT/'overlay.tar.gz','w:gz') as archive:
 for path in paths:
  data=pathlib.Path(path).read_bytes()
  assert subprocess.check_output(['git','show',head+':'+path])==data,path
  entry=tarfile.TarInfo(path);entry.size=len(data);entry.mode=0o400;archive.addfile(entry,io.BytesIO(data))
  records.append({'path':path,'size':len(data),'sha256':sha(data),'blob':subprocess.check_output(['git','hash-object','--',path],text=True).strip()})
manifest.update(sourceCommit=head,files=records,sourceBytes=sum(v['size'] for v in records),
 archiveBytes=(OUT/'overlay.tar.gz').stat().st_size,archiveSha256=sha((OUT/'overlay.tar.gz').read_bytes()),
 applicationAndTestBytesUnchangedFrom=None,runtimeTestsExecuted=False,
 scope='Approved canonical account metadata private-copy snapshot and explicit-root original Media/Sidecar startup qualification')
manifest['skeleton']=[v for v in manifest['skeleton'] if v['path'] not in paths]
effective={v['path']:v for v in manifest['effectiveFiles']}
for record in records:
 effective[record['path']]={**record,'gitMode':'100644','source':'owner-snapshot-overlay','physicalSource':plan['src']+'/namespace/'+record['path']}
manifest['effectiveFiles']=list(effective.values())
for mount in plan['mounts']:
 relative=mount['destination'].removeprefix('/work/')
 if relative in paths:mount['source']=plan['src']+'/namespace/'+relative
plan.update(sourceCommit=head,qualificationScope='startup-owners',priorLeasePhysicalBytes=18382848,
 description='26 focused Linux owner snapshot/startup tests, no C1 witness or broad rerun')
plan['env']['RECOVERY_OWNER_RECEIPT_ROOT']='/qa/receipts'
plan['tests']=[{'name':'startup-owners','cwd':'/work','args':['node','node_modules/vitest/vitest.mjs','run',
 '--config','/work/extensions/vitest.config.ts','--root','/work/extensions','src/server/storage/startup-recovery.test.ts',
 '--maxWorkers=1','--no-file-parallelism','--reporter=verbose','--reporter=json',
 '--outputFile=/qa/results/startup-owners.results.json'],'expectedCases':26,'expectedPassed':26,'expectedPending':0,
 'expectedObservedChildren':0,'wallSeconds':240,'env':{'C1_RECEIPT_ROOT':'/qa/receipts/startup-owners',
 'C1_PROCESS_OBSERVER_ROOT':'/qa/receipts/startup-owners/process-observations',
 'RECOVERY_OWNER_RECEIPT_ROOT':'/qa/receipts/startup-owners'}}]
base=(OUT/'runner_base.py').read_text().replace("grant.get('sourceDisposition') == 'APPROVE_WITH_EXACT_GATES'",
 "grant.get('sourceDisposition') == 'OWNER_AUTHORIZED_SOURCE_QUALIFICATION'")
(OUT/'runner_base.py').write_text(base,encoding='utf-8',newline='\n')
runner=(OUT/'runner_host.py').read_text()
start=runner.index('    def validate_job(self, job):');end=runner.index('    def monitored(',start)
replacement='''    def validate_job(self, job):
        result = json.loads((self.fixture / 'child-results/startup-owners.results.json').read_text())
        require(result['success'] and result['numTotalTests'] == 26 and result['numPassedTests'] == 26
                and result['numFailedTests'] == 0 and result['numPendingTests'] == 0, 'Owner startup cases failed')
        folder = self.fixture / 'child-receipts/startup-owners'
        load = lambda name: json.loads((folder / (name + '.json')).read_text())
        live, closed, recycled = load('live-wal'), load('clean-closed-wal'), load('recycled-wal')
        for proof in [live, closed, recycled]:
            require(proof['before'] == proof['after'] and proof['entriesBefore'] == proof['entriesAfter'] and proof['node'] == 'v24.22.2', 'Source DB/WAL/SHM changed')
        require(live['before']['tadazz-accounts.sqlite-wal'] is not None and len(live['owners']) == 2, 'Live WAL witness absent')
        require(closed['before']['tadazz-accounts.sqlite-wal'] is None and closed['before']['tadazz-accounts.sqlite-shm'] is None
                and len(closed['owners']) == 1, 'Clean closed WAL witness absent')
        require(len(recycled['owners']) == 2, 'WAL reset witness absent')
        retry, churn = load('changed-source-retry'), load('bounded-source-churn')
        for proof, copies in [(retry, 2), (churn, 3)]:
            require(proof['copies'] == copies and proof['after'] == proof['afterWriter']
                    and proof['allPrivateCopiesRemoved'], 'Capture revalidation/cleanup failure')
        self.write('startup-owners-gate.json', {'passed': True, 'cases': 26, 'sourceNoWriteWitnesses': 3,
                   'boundedRetryCopies': 2, 'boundedChurnCopies': 3, 'privateCopiesRemoved': True})

'''
(OUT/'runner_host.py').write_text(runner[:start]+replacement+runner[end:],encoding='utf-8',newline='\n')
(OUT/'analyze-results.cjs').write_text('''const fs = require('node:fs'), assert = require('node:assert/strict')
const result = JSON.parse(fs.readFileSync('/qa/results/startup-owners.results.json'))
assert.equal(result.success, true); assert.equal(result.numTotalTests, 26); assert.equal(result.numPassedTests, 26)
assert.equal(result.numFailedTests, 0); assert.equal(result.numPendingTests, 0)
const live = JSON.parse(fs.readFileSync('/qa/receipts/startup-owners/live-wal.json'))
const closed = JSON.parse(fs.readFileSync('/qa/receipts/startup-owners/clean-closed-wal.json'))
const recycled = JSON.parse(fs.readFileSync('/qa/receipts/startup-owners/recycled-wal.json'))
for (const value of [live, closed, recycled]) { assert.deepEqual(value.before, value.after); assert.deepEqual(value.entriesBefore, value.entriesAfter) }
assert.equal(recycled.owners.length,2)
console.log(JSON.stringify({passed:26,sourceNoWriteWitnesses:3,closedWalWithoutSidecars:true,liveWalOwners:live.owners,
 scope:'Synthetic canonical owner snapshot and explicit-root startup; no production or hardware claim'}))
''',encoding='utf-8',newline='\n')
for name,value in [('plan.json',plan),('manifest.json',manifest)]:
 (OUT/name).write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8',newline='\n')
old_lock=json.loads((BASE/'packet-hashes.json').read_bytes())
new_lock={**old_lock,'authorizationMeaning':'Owner-approved source qualification; no independent source approval claimed',
 'files':[{'path':v['path'],'size':(OUT/v['path']).stat().st_size,'sha256':sha((OUT/v['path']).read_bytes())} for v in old_lock['files']]}
new_lock['totalTransferBytesExcludingThisHashFileAndActualAdmission']=sum(v['size'] for v in new_lock['files'])
(OUT/'packet-hashes.json').write_text(json.dumps(new_lock,indent=2)+'\n',encoding='utf-8',newline='\n')
old_hash=sha((BASE/'packet-hashes.json').read_bytes());new_hash=sha((OUT/'packet-hashes.json').read_bytes())
transport=(E/'c1-transfer-packet6.py').read_text().replace('packet6-wave','packet10-wave').replace('c1-server-packet6','c1-server-packet10').replace('c1-transfer-packet6','c1-transfer-packet10').replace(old_hash,new_hash)
transport=transport.replace(str(sum(v['size'] for v in old_lock['files'])),str(sum(v['size'] for v in new_lock['files'])))
(E/'c1-transfer-packet10.py').write_text(transport,encoding='utf-8',newline='\n')
for f in list(OUT.glob('*.py'))+[E/'c1-transfer-packet10.py']:ast.parse(f.read_bytes())
print(json.dumps({'sourceCommit':head,'archiveFiles':len(records),'effectiveFiles':len(effective),'archiveBytes':manifest['archiveBytes'],
 'packetHashesSha256':new_hash,'transferredBytes':sum(v['size'] for v in new_lock['files']),'nativeCasesPrepared':26}))
