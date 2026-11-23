"""Public packuments only, in a separate bounded network-enabled container.

pnpm 12.18 view uses the uncached fetcher. Its mirror reader explicitly accepts
header-JSON + newline + a genuine complete JSON packument. No version, timestamp,
integrity, policy verdict or registry provenance is invented by this adapter.
"""
import concurrent.futures, datetime, gzip, hashlib, json, os, pathlib, re, shutil, ssl, tarfile, threading, time, urllib.parse, urllib.request

E=pathlib.Path(__file__).resolve().parent
W=pathlib.Path('/work')
LIMIT=128*1024**2
MAX_ARCHIVE=16*1024**2
REGISTRY='https://registry.npmjs.org/'
REGISTRY_KEY='https%3A+registry.npmjs.org'
os.environ.clear()
os.environ.update({'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','HOME':'/work/home','TMPDIR':'/work/tmp','XDG_RUNTIME_DIR':'/work/runtime','NPM_CONFIG_USERCONFIG':'/work/empty-user.npmrc','NPM_CONFIG_GLOBALCONFIG':'/work/empty-global.npmrc'})
for name in ('home','tmp','runtime','metadata'): (W/name).mkdir(mode=0o700)
for name in ('empty-user.npmrc','empty-global.npmrc'): (W/name).write_bytes(b'')
lock=pathlib.Path('/input/pnpm-lock.yaml').read_bytes()
assert hashlib.sha256(lock).hexdigest()=='ef4c7513fd4f9e56e9e38a8d7b1555d3c00f84650b400b1e8280c8d49ed37df2'
section=lock.decode().split('\npackages:\n',1)[1].split('\nsnapshots:\n',1)[0]
identities=[line.strip()[:-1].strip("'") for line in section.splitlines() if line.startswith('  ') and not line.startswith('   ') and line.endswith(':')]
names=sorted({x.rsplit('@',1)[0] for x in identities})
assert len(names)==459 and all(re.fullmatch(r'(?:@[a-z0-9_.-]+/)?[a-z0-9_.-]+',x) for x in names)
allowed_paths={'/'+urllib.parse.quote(name,safe='@'):name for name in names}
mutex=threading.Lock(); total=0; results=[]; originals={}; failures=[]

def sha(data): return hashlib.sha256(data).hexdigest()
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def reserve(n):
    global total
    with mutex:
        if total+n>LIMIT: raise RuntimeError('128MiB expanded metadata ceiling reached')
        total+=n

class Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,request,fp,code,msg,headers,newurl):
        validate_url(newurl)
        return super().redirect_request(request,fp,code,msg,headers,newurl)

def validate_url(url):
    parsed=urllib.parse.urlsplit(url)
    assert parsed.scheme=='https' and parsed.hostname=='registry.npmjs.org' and parsed.port in (None,443) and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment
    assert parsed.path in allowed_paths, 'request is not an allowlisted package metadata endpoint'

def cache_path(name):
    return W/'metadata'/REGISTRY_KEY/(name+'.jsonl')

def reuse_existing():
    roots=[pathlib.Path('/root/.cache/pnpm/v12/metadata-full'),pathlib.Path('/metadata-sdk')]
    for name in names:
        relative=pathlib.Path(REGISTRY_KEY)/(name+'.jsonl')
        for root in roots:
            src=root/relative
            if not src.is_file(): continue
            assert not src.is_symlink()
            data=src.read_bytes(); reserve(len(data)); dst=cache_path(name);dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(data)
            originals[str(src)]={'sha256':sha(data),'size':len(data),'mode':src.stat().st_mode&0o777,'mtime_ns':src.stat().st_mtime_ns}
            results.append({'package':name,'source':'existing_public_metadata','source_path':str(src),'cache_relative_path':str(relative),'cache_sha256':sha(data),'cache_bytes':len(data)})
            break

def fetch(name):
    url=REGISTRY+urllib.parse.quote(name,safe='@');validate_url(url)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPSHandler(context=ssl.create_default_context()),Redirects())
    started=now()
    request=urllib.request.Request(url,headers={'Accept':'application/json','Accept-Encoding':'identity','User-Agent':'Tadazz-isolated-public-metadata-QA/1'})
    tmp=cache_path(name).with_suffix('.response')
    tmp.parent.mkdir(parents=True,exist_ok=True)
    with opener.open(request,timeout=30) as response:
        validate_url(response.url)
        assert response.status==200 and response.headers.get('Content-Encoding','identity')=='identity'
        received=0; h=hashlib.sha256()
        with tmp.open('wb') as f:
            while True:
                block=response.read(64*1024)
                if not block: break
                received+=len(block)
                if received>32*1024**2: raise RuntimeError('single metadata response exceeds32MiB')
                reserve(len(block));h.update(block);f.write(block)
        raw=tmp.read_bytes(); body=json.loads(raw)
        assert body.get('name')==name and isinstance(body.get('versions'),dict) and isinstance(body.get('time'),dict) and isinstance(body.get('dist-tags'),dict), 'not a complete npm packument'
        headers={}
        if response.headers.get('ETag'):headers['etag']=response.headers['ETag']
        modified=body.get('modified') or body['time'].get('modified')
        if modified is not None:
            assert isinstance(modified,str)
            headers['modified']=modified
        prefix=json.dumps(headers,separators=(',',':'),ensure_ascii=False).encode()+b'\n'
        reserve(len(prefix))
        # Replace an owned temporary response atomically. The full genuine body
        # is preserved byte-for-byte after the documented header line.
        output=cache_path(name); staged=output.with_suffix('.new')
        with staged.open('wb') as f:f.write(prefix);f.write(raw)
        os.replace(staged,output);tmp.unlink()
        record={'package':name,'source':'https_public_registry','url':url,'final_url':response.url,'started_utc':started,'received_utc':now(),'status':response.status,'etag':response.headers.get('ETag'),'last_modified_header':response.headers.get('Last-Modified'),'response_sha256':h.hexdigest(),'response_bytes':received,'cache_sha256':sha(prefix+raw),'cache_bytes':len(prefix)+len(raw),'cache_relative_path':str(output.relative_to(W/'metadata')),'versions':len(body['versions']),'all_registry_time_and_version_fields_preserved':True}
        with mutex:results.append(record)
        return record

try:
    reuse_existing()
    missing=[name for name in names if not cache_path(name).is_file()]
    print(json.dumps({'locked_names':len(names),'reused_metadata':len(results),'to_fetch':len(missing),'expanded_bytes_before_fetch':total}),flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures={pool.submit(fetch,name):name for name in missing}
        for future in concurrent.futures.as_completed(futures):
            try:future.result()
            except Exception as exc:failures.append({'package':futures[future],'error':repr(exc)})
    if failures:raise RuntimeError('metadata requests failed; see hydration-receipt.json')
    assert len(results)==459
    archive=E/'metadata-full.tar.gz';partial=E/'metadata-full.partial'
    class BoundedArchive:
        def __init__(self,file):self.file,self.count=file,0
        def write(self,data):
            if self.count+len(data)>MAX_ARCHIVE:raise RuntimeError('retained metadata archive would exceed16MiB')
            self.count+=len(data);return self.file.write(data)
        def flush(self):return self.file.flush()
    with partial.open('wb') as raw_archive:
        with tarfile.open(fileobj=BoundedArchive(raw_archive),mode='w|gz',compresslevel=6) as tar:
            for record in sorted(results,key=lambda x:x['package']):
                p=W/'metadata'/record['cache_relative_path'];assert sha(p.read_bytes())==record['cache_sha256'];tar.add(p,arcname=record['cache_relative_path'],recursive=False)
    os.replace(partial,archive)
    print(json.dumps({'metadata_complete':True,'expanded_bytes':total,'archive_bytes':archive.stat().st_size,'archive_sha256':sha(archive.read_bytes())}),flush=True)
except Exception as exc:
    failures.append({'stage':'hydration','error':repr(exc)})
finally:
    originals_preserved=all(sha(pathlib.Path(p).read_bytes())==s['sha256'] and pathlib.Path(p).stat().st_size==s['size'] and pathlib.Path(p).stat().st_mtime_ns==s['mtime_ns'] and pathlib.Path(p).stat().st_mode&0o777==s['mode'] for p,s in originals.items())
    receipt={'complete':not failures,'allowlist_lock_sha256':sha(lock),'locked_names':names,'request_concurrency':4,'network_policy':'only HTTPS registry.npmjs.org:443 allowlisted package metadata paths, same restriction on redirects; default TLS validation; no proxy/auth/config inheritance; no package-body or attestation fetch','cache_format':'documented pnpm12.18 legacy NDJSON headers plus complete unmodified genuine packument; view uses uncached fetch_full_metadata','expanded_metadata_bytes':total,'expanded_limit':LIMIT,'original_metadata_files_preserved':originals_preserved,'original_metadata':originals,'results':sorted(results,key=lambda x:x['package']),'failures':failures,'finished_utc':now(),'memory_peak':pathlib.Path('/sys/fs/cgroup/memory.peak').read_text().strip()}
    if (E/'metadata-full.tar.gz').exists():receipt['archive']={'bytes':(E/'metadata-full.tar.gz').stat().st_size,'sha256':sha((E/'metadata-full.tar.gz').read_bytes())}
    (E/'hydration-receipt.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
    assert originals_preserved,'original public metadata cache changed'
if failures:raise SystemExit(1)
