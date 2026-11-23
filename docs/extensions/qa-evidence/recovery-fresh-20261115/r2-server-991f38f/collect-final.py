import pathlib,hashlib,json,subprocess
root=pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
sha='991f38f216ad265e06aec53313db8928437da248'
fixture=root/'fixtures'/('recovery-r2-'+sha)
evidence=root/'evidence'/('recovery-r2-'+sha)
source=root/'source'/('recovery-r2-'+sha)
runner=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','--size','tadazz-hq-recovery-r2-20261115']))[0]
if runner['State']['Running']:raise RuntimeError('collect only after stopped runner')
def digest(file):
    h=hashlib.sha256()
    with file.open('rb') as src:
        for part in iter(lambda:src.read(1024*1024),b''):h.update(part)
    return h.hexdigest()
artifacts=[]
for file in sorted(fixture.rglob('*')):
    if file.is_file() and not file.is_symlink():artifacts.append({'relative':str(file.relative_to(fixture)),'bytes':file.stat().st_size,'sha256':digest(file)})
result={'executedCommit':sha,'runnerStopped':True,'generatedArtifacts':artifacts,'stagedManifestSha256':digest(source/'staged-manifest.json'),'overlayArchiveSha256':digest(source/'overlay-inputs.tar.gz'),'overlayArchiveBytes':(source/'overlay-inputs.tar.gz').stat().st_size}
(evidence/'artifact-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'artifacts':len(artifacts),'bytes':sum(a['bytes'] for a in artifacts),'runnerStopped':True,'manifestSha256':result['stagedManifestSha256']}))
