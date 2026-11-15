"""Exactly one genuine Vite metadata request; reuse all 458 verified RAM files."""
import datetime,hashlib,json,os,pathlib,ssl,urllib.parse,urllib.request
E=pathlib.Path('/evidence');R=pathlib.Path('/ram');LIMIT=768*1024**2
os.environ.clear();os.environ.update({'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','HOME':'/ram/home','TMPDIR':'/ram/tmp','NPM_CONFIG_USERCONFIG':'/ram/empty-user.npmrc','NPM_CONFIG_GLOBALCONFIG':'/ram/empty-global.npmrc'})
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def validate(url):
    p=urllib.parse.urlsplit(url)
    assert p.scheme=='https' and p.hostname=='registry.npmjs.org' and p.port in (None,443) and p.path=='/vite' and not p.query and not p.fragment and not p.username and not p.password
class Redirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,request,fp,code,msg,headers,url):
        validate(url);return super().redirect_request(request,fp,code,msg,headers,url)
prior=json.loads(pathlib.Path('/prior/hydration-receipt.json').read_text())
assert not prior['complete'] and len(prior['results'])==458
records=prior['results'];total=0
for entry in records:
    p=R/'metadata'/entry['cache_relative_path']
    assert sha(p)==entry['cache_sha256'] and p.stat().st_size==entry['cache_bytes']
    total+=entry['cache_bytes']
assert set(prior['locked_names'])-{x['package'] for x in records}=={'vite'}
assert sha(pathlib.Path('/input/pnpm-lock.yaml'))==prior['allowlist_lock_sha256']
assert not (R/'ready.json').exists()
url='https://registry.npmjs.org/vite';validate(url);started=now()
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPSHandler(context=ssl.create_default_context()),Redirect())
request=urllib.request.Request(url,headers={'Accept':'application/json','Accept-Encoding':'identity','User-Agent':'Tadazz-isolated-public-metadata-QA/1'})
path=R/'metadata/https%3A+registry.npmjs.org/vite.jsonl';temp=path.with_suffix('.retry-complete')
assert not path.exists() and not temp.exists()
failure=[];result=None
try:
    with opener.open(request,timeout=30) as response:
        validate(response.url);assert response.status==200 and response.headers.get('Content-Encoding','identity')=='identity'
        # ETag is already genuine at the start of the body. Modified is optional
        # in pnpm's headers; the complete registry time map stays in the body.
        header={'etag':response.headers['ETag']} if response.headers.get('ETag') else {}
        prefix=json.dumps(header,separators=(',',':')).encode()+b'\n'
        h=hashlib.sha256();received=0
        with temp.open('xb') as f:
            f.write(prefix)
            while True:
                block=response.read(64*1024)
                if not block:break
                received+=len(block);assert total+len(prefix)+received<=LIMIT,'768MiB aggregate metadata ceiling'
                f.write(block);h.update(block)
        with temp.open('rb') as f:
            f.readline();body=json.load(f)
        assert body.get('name')=='vite' and isinstance(body.get('versions'),dict) and isinstance(body.get('time'),dict) and isinstance(body.get('dist-tags'),dict)
        result={'package':'vite','source':'https_public_registry','url':url,'final_url':response.url,'started_utc':started,'received_utc':now(),'status':response.status,'etag':response.headers.get('ETag'),'last_modified_header':response.headers.get('Last-Modified'),'response_sha256':h.hexdigest(),'response_bytes':received,'cache_sha256':sha(temp),'cache_bytes':len(prefix)+received,'cache_relative_path':'https%3A+registry.npmjs.org/vite.jsonl','versions':len(body['versions']),'all_registry_time_and_version_fields_preserved':True}
        os.replace(temp,path);records.append(result);total+=result['cache_bytes']
    assert len(records)==459 and {x['package'] for x in records}==set(prior['locked_names'])
    for entry in records:
        p=R/'metadata'/entry['cache_relative_path'];assert sha(p)==entry['cache_sha256'];os.chmod(p,0o444)
    for d in sorted((R/'metadata').rglob('*'),reverse=True):
        if d.is_dir():os.chmod(d,0o555)
    os.chmod(R/'metadata',0o555)
except Exception as exc:failure.append(repr(exc))
receipt={**prior,'complete':not failure,'results':sorted(records,key=lambda x:x['package']),'failures':failure,'expanded_metadata_bytes':total,'expanded_limit':LIMIT,'finished_utc':now(),'prior_partial_receipt_sha256':sha(pathlib.Path('/prior/hydration-receipt.json')),'reused_verified_ram_mirrors':458,'new_http_requests':1,'repair':'Remove unnecessary32MiB single-response guard; unchanged768MiB aggregate ceiling; same official full response and no projection','memory_peak':pathlib.Path('/sys/fs/cgroup/memory.peak').read_text().strip(),'ram_snapshot':{'metadata_root':'/ram/metadata','capacity_bytes':os.statvfs(R).f_blocks*os.statvfs(R).f_frsize,'used_bytes':(os.statvfs(R).f_blocks-os.statvfs(R).f_bfree)*os.statvfs(R).f_frsize,'memory_events':pathlib.Path('/sys/fs/cgroup/memory.events').read_text()}}
(E/'hydration-receipt.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
if failure:raise SystemExit(1)
inventory=R/'inventory.json';inventory.write_text(json.dumps({'receipt_sha256':sha(E/'hydration-receipt.json'),'files':records},indent=2,sort_keys=True)+'\n');os.chmod(inventory,0o444)
ready=R/'ready.json';ready.write_text(json.dumps({'complete':True,'files':459,'inventory_sha256':sha(inventory),'hydration_receipt_sha256':sha(E/'hydration-receipt.json'),'expanded_bytes':total},indent=2)+'\n');os.chmod(ready,0o444)
print(json.dumps({'complete':True,'mirrors':459,'expanded_bytes':total,'vite_response_bytes':result['response_bytes']}),flush=True)
