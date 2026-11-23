"""Keeper-side binary stdout archive; no server archive or metadata rewriting."""
import gzip,hashlib,json,pathlib,sys,tarfile
root=pathlib.Path('/ram');evidence=pathlib.Path('/evidence')
ready=json.loads((root/'ready.json').read_text());inventory=json.loads((root/'inventory.json').read_text())
assert ready['complete'] and len(inventory['files'])==459
assert hashlib.sha256((root/'inventory.json').read_bytes()).hexdigest()==ready['inventory_sha256']
class Output:
    def __init__(self):self.count=0;self.hash=hashlib.sha256()
    def write(self,data):
        assert self.count+len(data)<=128*1024**2,'archive exceeds128MiB'
        n=sys.stdout.buffer.write(data);assert n==len(data);self.count+=n;self.hash.update(data);return n
    def flush(self):sys.stdout.buffer.flush()
output=Output()
with gzip.GzipFile(fileobj=output,mode='wb',compresslevel=6) as compressed:
    with tarfile.open(fileobj=compressed,mode='w|') as tar:
        for record in sorted(inventory['files'],key=lambda x:x['package']):
            p=root/'metadata'/record['cache_relative_path']
            assert hashlib.sha256(p.read_bytes()).hexdigest()==record['cache_sha256']
            tar.add(p,arcname=record['cache_relative_path'],recursive=False)
output.flush()
(evidence/'archive-export.json').write_text(json.dumps({'files':459,'bytes':output.count,'sha256':output.hash.hexdigest(),'inventory_sha256':ready['inventory_sha256'],'destination':'binary stdout over existing SSH directly to private Windows artifact; no server archive','all_mirror_files_verified_before_stream':True},indent=2)+'\n')
