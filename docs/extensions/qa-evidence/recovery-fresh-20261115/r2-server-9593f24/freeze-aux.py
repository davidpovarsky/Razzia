import hashlib,json,sys,tarfile
from pathlib import Path
archive,manifest,work=map(Path,sys.argv[1:4]);mode=sys.argv[4]
data=json.loads(manifest.read_text());expected={'docs/extensions/plans/tds-freeze.json','docs/extensions/plans/tds-approved-seams.json'}
assert data['commit']=='9593f24f287f2e404f387f6359e89453cd8a971e'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==data['archiveSha256']=='091898e6181cf5012b810cac665a3cd7d7b552f661b8a47e11e139642b1aa4e8'
assert {x['path'] for x in data['files']}==expected
work=work.resolve(strict=True)
assert work==Path('/home/ubuntu/tadazz-hq-qa-20261115/fixtures/recovery-r2-9593f24f287f2e404f387f6359e89453cd8a971e/work')
if mode=='extract':
 with tarfile.open(archive,'r:gz') as tar:
  members={m.name:m for m in tar.getmembers() if m.isfile()}
  assert set(members)==expected
  assert all(m.isdir() or m.isfile() for m in tar.getmembers())
  for entry in data['files']:
   raw=tar.extractfile(members[entry['path']]).read()
   assert len(raw)==entry['size'] and hashlib.sha256(raw).hexdigest()==entry['sha256']
   target=work/entry['path'];assert not target.exists() and not target.is_symlink()
   target.parent.mkdir(parents=True,exist_ok=True)
   assert target.parent.resolve().is_relative_to(work)
   with target.open('xb') as output:output.write(raw)
elif mode!='verify':raise RuntimeError('Unexpected auxiliary input operation')
for entry in data['files']:
 target=work/entry['path'];assert not target.is_symlink()
 assert target.stat().st_size==entry['size'] and hashlib.sha256(target.read_bytes()).hexdigest()==entry['sha256']
print(json.dumps({'status':'PASS','sourceCommit':data['commit'],'auxiliaryInputs':len(expected),'mode':mode,'files':data['files']},indent=2))
