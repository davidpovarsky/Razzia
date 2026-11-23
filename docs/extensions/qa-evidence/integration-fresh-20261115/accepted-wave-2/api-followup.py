"""Run only inside the bounded server container; never edit input caches."""
import base64, hashlib, json, math, os, pathlib, re, shutil, sqlite3, stat, struct, subprocess, tarfile, time, traceback

E = pathlib.Path(__file__).resolve().parent
W = pathlib.Path('/work')
CACHES = [pathlib.Path('/cache-root/v11'), pathlib.Path('/cache-sdk/v11')]

def save(name, value):
    (E/name).write_text(json.dumps(value, indent=2, sort_keys=True)+'\n')

def hydrated_metadata():
    receipt=json.loads(pathlib.Path('/metadata-receipt.json').read_text())
    archive=pathlib.Path('/metadata-input.tar.gz')
    assert receipt['complete'] and digest(archive)==receipt['archive']['sha256']
    assert receipt['allowlist_lock_sha256']==digest(pathlib.Path('/input/pnpm-lock.yaml'))
    entries={x['cache_relative_path']:x for x in receipt['results']}
    assert len(entries)==459
    root=W/'home/.cache/pnpm/v12/metadata-full';root.mkdir(parents=True)
    expanded=0
    with tarfile.open(archive,'r:gz') as tar:
        members=tar.getmembers();assert {m.name for m in members}==set(entries) and len(members)==459
        for m in members:
            assert m.isfile() and not m.issym() and not m.islnk() and not pathlib.PurePosixPath(m.name).is_absolute() and '..' not in pathlib.PurePosixPath(m.name).parts
            expanded+=m.size;assert expanded<=128*1024**2
            p=root/m.name;p.parent.mkdir(parents=True,exist_ok=True)
            with tar.extractfile(m) as src,p.open('wb') as dst:shutil.copyfileobj(src,dst,1024*1024)
            assert digest(p)==entries[m.name]['cache_sha256'];os.chmod(p,0o444)
    save('hydrated-metadata.json',{'archive_sha256':digest(archive),'files':len(entries),'expanded_bytes':expanded,'all_file_sha256_match_hydration_receipt':True,'input_archive_readonly_mount':'/metadata-input.tar.gz','prior_verification_verdicts_copied':False})

def ram_metadata():
    root=pathlib.Path('/snapshot');ready=json.loads((root/'ready.json').read_text())
    receipt=json.loads(pathlib.Path('/metadata-receipt.json').read_text())
    inventory=json.loads((root/'inventory.json').read_text())
    assert ready['complete'] and receipt['complete'] and not receipt['failures']
    assert ready['inventory_sha256']==digest(root/'inventory.json')
    assert ready['hydration_receipt_sha256']==digest(pathlib.Path('/metadata-receipt.json'))==inventory['receipt_sha256']
    assert receipt['allowlist_lock_sha256']==digest(pathlib.Path('/input/pnpm-lock.yaml'))
    entries={x['cache_relative_path']:x for x in receipt['results']}
    assert len(entries)==459 and entries=={x['cache_relative_path']:x for x in inventory['files']}
    expanded=0;genuine_bodies=0
    for name,entry in entries.items():
        assert name=='https%3A+registry.npmjs.org/'+entry['package']+'.jsonl'
        p=root/'metadata'/name;assert p.is_file() and not p.is_symlink()
        assert digest(p)==entry['cache_sha256'] and p.stat().st_size==entry['cache_bytes']
        if entry['source']=='https_public_registry':
            with p.open('rb') as f:
                header=json.loads(f.readline());h=hashlib.sha256();length=0
                for block in iter(lambda:f.read(1024*1024),b''):h.update(block);length+=len(block)
            assert h.hexdigest()==entry['response_sha256'] and length==entry['response_bytes'] and header.get('etag')==entry['etag']
            genuine_bodies+=1
        expanded+=entry['cache_bytes']
    assert expanded<=768*1024**2 and expanded==ready['expanded_bytes']
    cache=W/'home/.cache/pnpm/v12';cache.mkdir(parents=True)
    (cache/'metadata-full').symlink_to(root/'metadata',target_is_directory=True)
    save('hydrated-metadata.json',{'files':459,'expanded_bytes':expanded,'raw_https_response_bodies_verified':genuine_bodies,'inventory_sha256':digest(root/'inventory.json'),'hydration_receipt_sha256':digest(pathlib.Path('/metadata-receipt.json')),'all_file_sha256_match_hydration_receipt':True,'metadata_mount_readonly':True,'prior_verification_verdicts_copied':False})
    return entries

def digest(path, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024*1024), b''):
            h.update(block)
    return h.hexdigest()

class Decoder:
    # Read-only subset of msgpackr records, per pnpm v12.18.0 primary source.
    # Unknown extensions/shapes fail rather than discarding fields.
    def __init__(self, data):
        self.data, self.pos, self.slots = data, 0, {}
    def take(self, n):
        out = self.data[self.pos:self.pos+n]
        assert len(out)==n, 'truncated msgpack'
        self.pos += n
        return out
    def number(self, n, signed=False):
        return int.from_bytes(self.take(n), 'big', signed=signed)
    def mapping(self, pairs):
        out = {}
        for key, value in pairs:
            assert isinstance(key, str) and key not in out, 'unknown/duplicate map key'
            out[key] = value
        return out
    def value(self):
        h = self.number(1)
        if 0x40 <= h <= 0x7f and self.slots:
            assert h in self.slots, 'unknown record slot'
            return self.mapping((key, self.value()) for key in self.slots[h])
        if h <= 0x7f: return h
        if h >= 0xe0: return h-256
        if 0xa0 <= h <= 0xbf: return self.take(h&31).decode('utf-8')
        if 0x90 <= h <= 0x9f: return [self.value() for _ in range(h&15)]
        if 0x80 <= h <= 0x8f: return self.mapping((self.value(),self.value()) for _ in range(h&15))
        if h==0xc0: return None
        if h in (0xc2,0xc3): return h==0xc3
        if h in (0xca,0xcb):
            value=struct.unpack('>f' if h==0xca else '>d',self.take(4 if h==0xca else 8))[0]
            assert math.isfinite(value), 'nonfinite number'
            return value
        if h in (0xcc,0xcd,0xce,0xcf): return self.number(1<<(h-0xcc))
        if h in (0xd0,0xd1,0xd2,0xd3): return self.number(1<<(h-0xd0), True)
        if h in (0xd9,0xda,0xdb): return self.take(self.number(1<<(h-0xd9))).decode('utf-8')
        if h in (0xdc,0xdd): return [self.value() for _ in range(self.number(2 if h==0xdc else 4))]
        if h in (0xde,0xdf): return self.mapping((self.value(),self.value()) for _ in range(self.number(2 if h==0xde else 4)))
        if h==0xd4:
            kind, slot = self.number(1), self.number(1)
            if kind==0 and slot==0: return {'$msgpackrUndefined': True}
            assert kind==0x72 and 0x40<=slot<=0x7f, 'unknown extension'
            fields=self.value()
            assert isinstance(fields,list) and all(isinstance(k,str) for k in fields) and len(set(fields))==len(fields)
            self.slots[slot]=fields
            return self.mapping((key,self.value()) for key in fields)
        raise ValueError('unknown msgpack header '+hex(h))
    def decode(self):
        out=self.value()
        assert self.pos==len(self.data), 'trailing bytes'
        return out

def differences(a,b,path=()):
    if type(a) is not type(b): return [{'path':list(path),'root':a,'sdk':b}]
    if isinstance(a,dict):
        if a.keys()!=b.keys(): return [{'path':list(path),'root_keys':sorted(a),'sdk_keys':sorted(b)}]
        return [d for k in sorted(a) for d in differences(a[k],b[k],path+(k,))]
    if isinstance(a,list):
        if len(a)!=len(b): return [{'path':list(path),'root':a,'sdk':b}]
        return [d for i in range(len(a)) for d in differences(a[i],b[i],path+(i,))]
    return [] if a==b else [{'path':list(path),'root':a,'sdk':b}]

def timestamp_only(diff):
    p=diff['path']
    return ((len(p)==3 and p[0]=='files' and p[-1]=='checkedAt') or (len(p)==5 and p[0]=='sideEffects' and p[2]=='added' and p[-1]=='checkedAt')) and all(isinstance(diff.get(k),(int,float)) and not isinstance(diff.get(k),bool) for k in ('root','sdk'))

def source_check(root, manifest):
    bad=[]
    for x in manifest['entries']:
        p=root/x['path']; data=p.read_bytes()
        blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        if blob!=x['blob'] or stat.S_IMODE(p.stat().st_mode)!=(int(x['mode'],8)&0o777): bad.append(x['path'])
    assert not bad, 'source/mode mismatch '+repr(bad)
    return {'entries':len(manifest['entries']),'mismatches':bad}

def cache_snapshot():
    output=[]
    for cache in CACHES:
        files={}
        for p in sorted((cache/'files').glob('*/*')):
            assert p.is_file() and not p.is_symlink(), 'unexpected CAFS entry'
            s=p.stat()
            files[str(p.relative_to(cache))]={'sha512':digest(p,'sha512'),'size':s.st_size,'mode':stat.S_IMODE(s.st_mode),'mtime_ns':s.st_mtime_ns,'inode':s.st_ino}
        db=cache/'index.db'
        output.append({'path':str(cache),'db_sha256':digest(db),'files':files})
    return output

def cache_union(before):
    connections=[sqlite3.connect('file:'+str(p/'index.db')+'?mode=ro&immutable=1',uri=True) for p in CACHES]
    rows=[dict(c.execute('SELECT key,data FROM package_index')) for c in connections]
    aliases=[dict(c.execute('SELECT key,target FROM package_index_alias')) for c in connections]
    parsed=[{k:Decoder(v).decode() for k,v in group.items()} for group in rows]
    lock=(pathlib.Path('/input')/'pnpm-lock.yaml').read_text()
    section=lock.split('\npackages:\n',1)[1].split('\nsnapshots:\n',1)[0]
    integrities={}
    current=None
    for line in section.splitlines():
        if line.startswith('  ') and not line.startswith('   ') and line.endswith(':'):
            current=line.strip()[:-1].strip("'")
        match=re.search(r'integrity: ([^,}]+)',line)
        if match: integrities[current]=match[1]
    shared=[]
    for key in sorted(rows[0].keys() & rows[1].keys()):
        ds=differences(parsed[0][key],parsed[1][key])
        report={'key':key,'root_raw_sha256':hashlib.sha256(rows[0][key]).hexdigest(),'sdk_raw_sha256':hashlib.sha256(rows[1][key]).hexdigest(),'differences':ds,'equivalent_except_verification_timestamps':all(timestamp_only(d) for d in ds)}
        shared.append(report)
    save('shared-row-comparison.json',shared)
    assert all(x['equivalent_except_verification_timestamps'] for x in shared), 'semantic shared-row conflict; see exact diff'
    for key in sorted(set(rows[1])):
        integrity, identity=key.split('\t')
        m=parsed[1][key]['manifest']
        assert identity==m['name']+'@'+m['version']
        assert integrities.get(identity)==integrity, 'SDK row not in final locked registry resolution: '+identity
        if key in parsed[0]:
            assert parsed[0][key]['manifest']['name']==m['name'] and parsed[0][key]['manifest']['version']==m['version']
    for key in aliases[0].keys() & aliases[1].keys(): assert aliases[0][key]==aliases[1][key], 'alias semantic conflict'
    checked=0
    for i, group in enumerate(parsed):
        for key, row in group.items():
            integrity, identity=key.split('\t')
            assert row['algo']=='sha512' and identity==row['manifest']['name']+'@'+row['manifest']['version'], 'cache identity mismatch'
            file_groups=[row['files']]+[x.get('added',{}) for x in row.get('sideEffects',{}).values()]
            for group_files in file_groups:
                for name,info in group_files.items():
                    assert not pathlib.PurePosixPath(name).is_absolute() and '..' not in pathlib.PurePosixPath(name).parts
                    d=info['digest']; mode=info['mode']
                    assert len(d)==128 and re.fullmatch('[0-9a-f]+',d) and not mode&0o170000, 'unsupported file kind'
                    relative='files/'+d[:2]+'/'+d[2:]+('-exec' if mode&0o111 else '')
                    actual=before[i]['files'].get(relative)
                    assert actual and actual['sha512']==d and actual['size']==info['size'] and bool(actual['mode']&0o111)==bool(mode&0o111), (key,name,'CAFS mismatch')
                    checked+=1
    union=W/'store/v11'; union.mkdir(parents=True)
    target=sqlite3.connect(union/'index.db')
    connections[0].backup(target)
    for key in sorted(rows[1].keys()-rows[0].keys()): target.execute('INSERT INTO package_index(key,data) VALUES (?,?)',(key,rows[1][key]))
    for key in sorted(aliases[1].keys()-aliases[0].keys()): target.execute('INSERT INTO package_index_alias(key,target) VALUES (?,?)',(key,aliases[1][key]))
    target.commit()
    for key,value in rows[0].items(): assert target.execute('SELECT data FROM package_index WHERE key=?',(key,)).fetchone()[0]==value
    assert target.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    count=target.execute('SELECT count(*) FROM package_index').fetchone()[0]; target.close()
    known={}
    for i,cache in enumerate(CACHES):
        for relative,info in before[i]['files'].items():
            dest=union/relative
            if relative in known:
                assert {k:v for k,v in known[relative].items() if k not in ('mtime_ns','inode')}=={k:v for k,v in info.items() if k not in ('mtime_ns','inode')}, 'body union collision'
                continue
            dest.parent.mkdir(parents=True,exist_ok=True)
            dest.symlink_to(cache/relative)
            known[relative]=info
    result={'root_rows':len(rows[0]),'sdk_rows':len(rows[1]),'shared_rows':len(shared),'sdk_only_rows':len(rows[1].keys()-rows[0].keys()),'union_rows':count,'all_root_rows_retained_verbatim':True,'shared_aliases_identical':len(aliases[0].keys()&aliases[1].keys()),'referenced_files_verified':checked,'symlink_body_files':len(known),'copied_body_bytes':0,'shared_differences_allowed_only':'files or sideEffects.added file checkedAt, per pinned pnpm primary source; no field rewritten','derived_db_sha256':digest(union/'index.db')}
    save('union-result.json',result)
    print('CACHE_UNION',json.dumps(result),flush=True)

def command(label,args,cwd,extra_env=None):
    start=time.time()
    with (E/(label+'.log')).open('w') as log:
        p=subprocess.run(args,cwd=cwd,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'HOME':str(W/'home'),'TMPDIR':str(W/'tmp'),'XDG_RUNTIME_DIR':str(W/'runtime'),'CI':'true','NO_COLOR':'1','XDG_DATA_HOME':str(W/'xdg-data'),'TSX_DISABLE_CACHE':'1',**(extra_env or {})})
    result={'command':args,'cwd':str(cwd),'exit':p.returncode,'seconds':round(time.time()-start,3),'log_sha256':digest(E/(label+'.log'))}
    save(label+'.json',result)
    print(label,json.dumps(result),flush=True)
    return p.returncode


before=None;ram_entries=None;results=[]
try:
    manifest=json.loads((E/'manifest.json').read_text())
    assert manifest['head']=='58cfb5c7a734518c715ae56d74666441f0743f5d'
    save('source-before.json',source_check(pathlib.Path('/input'),manifest))
    for name in ('home','tmp','project','runtime','xdg-data','xdg-cache'):(W/name).mkdir(mode=0o700)
    for entry in manifest['entries']:
        src=pathlib.Path('/input')/entry['path'];dst=W/'project'/entry['path'];dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
    before=cache_snapshot();baseline=pathlib.Path('/cache-audit-baseline.json');assert before==json.loads(baseline.read_text());save('cache-before.json',{'exact_prior_manifest_equality':True,'prior_manifest_sha256':digest(baseline)})
    cache_union(before);ram_entries=ram_metadata()
    assert not any(pathlib.Path('/fake').iterdir()),'fake fixture must start empty'
    save('fixture-before.json',{'fake_files':[],'fake_capacity_bytes':os.statvfs('/fake').f_blocks*os.statvfs('/fake').f_frsize})
    command('versions',['sh','-c','node --version; pnpm --version; uname -m; cat /proc/net/route; cat /sys/fs/cgroup/memory.max; cat /sys/fs/cgroup/cpu.max'],W/'project')
    install=command('frozen-bootstrap',['pnpm','install','--offline','--frozen-lockfile','--store-dir=/work/store','--package-import-method=copy','--verify-store-integrity=true','--reporter=append-only'],W/'project')
    assert install==0,'bootstrap failed; no scoped tests claimed'
    flags=['--configLoader','runner','--maxWorkers=1','--no-file-parallelism','--reporter=json']
    prior=json.loads(pathlib.Path('/prior-validated/scoped-results.json').read_text())
    passed=[x for x in prior if x['label']!='api-routes']
    assert sum(x['passed'] for x in passed)==144 and all(x['exit']==0 and x['failed']==0 for x in passed)
    assert digest(pathlib.Path('/prior-validated/manifest.json'))==digest(E/'manifest.json')
    assert json.loads(pathlib.Path('/prior-validated/parent-types.json').read_text())['exit']==0
    save('reused-validated-checks.json',{'same_frozen_source':'58cfb5c7a734518c715ae56d74666441f0743f5d','prior_namespace':'integrator-root-85e-wave2-58cf-20261115-r2','parent_types_exit':0,'passed':144,'groups':passed,'reason':'Only API selector path was wrong;0APIcases ran. Correct to actual unchanged src/server/api/routes.test.ts. No144-case or819/41 repeat, no product patch.'})
    cases=[('api-routes',5,['src/server/api/routes.test.ts'],{},0)]
    summary=[]
    for label,expected,files,env,expected_deselected in cases:
        code=command(label,['pnpm','--dir','extensions','exec','vitest','run',*files,*flags,'--outputFile='+str(E/(label+'.vitest.json'))],W/'project',env)
        report=E/(label+'.vitest.json');actual=json.loads(report.read_text()) if report.exists() else {}
        row={'label':label,'exit':code,'expected_passed':expected,'passed':actual.get('numPassedTests'),'failed':actual.get('numFailedTests'),'deselected_or_pending':actual.get('numPendingTests'),'expected_deselected':expected_deselected,'assertion_results':sum(len(x.get('assertionResults',[])) for x in actual.get('testResults',[]))}
        summary.append(row);save('scoped-results.json',summary)
        results.append(code or int(row['passed']!=expected or row['failed']!=0 or row['deselected_or_pending']!=expected_deselected))
    save('fixture-after.json',{'kind':'new owned16MiB RAM tmpfs fixture, not historical host scratch','files':[str(p.relative_to('/fake')) for p in pathlib.Path('/fake').rglob('*') if p.is_file()],'quizzDirectoryExists':pathlib.Path('/fake/quizz').exists(),'not_a_durability_proof':True})
    if any(results):raise RuntimeError('one or more combined scoped checks failed; preserve every separate exit/report')
except Exception as exc:
    save('failure.json',{'error':str(exc),'traceback':traceback.format_exc()});print(traceback.format_exc(),flush=True)
finally:
    if before is not None:
        after=cache_snapshot();save('cache-after.json',{'exact_before_equality':before==after,'prior_manifest_sha256':digest(pathlib.Path('/cache-audit-baseline.json'))});assert before==after,'ORIGINAL CACHE CHANGED'
    save('source-after.json',source_check(pathlib.Path('/input'),manifest));save('work-source-after.json',source_check(W/'project',manifest))
    if ram_entries is not None:
        changed=[name for name,x in ram_entries.items() if digest(pathlib.Path('/snapshot/metadata')/name)!=x['cache_sha256']];save('metadata-after.json',{'files':len(ram_entries),'changed':changed});assert not changed,'FROZEN METADATA CHANGED'
    sizes={}
    for name in ['/work','/snapshot','/fake']:
        v=os.statvfs(name);sizes[name]={'capacity_bytes':v.f_blocks*v.f_frsize,'used_bytes':(v.f_blocks-v.f_bfree)*v.f_frsize}
    save('resource-end.json',{'mounts':sizes,'aggregate_tmpfs_cap':sum(x['capacity_bytes'] for x in sizes.values()),'aggregate_used':sum(x['used_bytes'] for x in sizes.values()),'memory_peak':pathlib.Path('/sys/fs/cgroup/memory.peak').read_text().strip(),'memory_events':pathlib.Path('/sys/fs/cgroup/memory.events').read_text(),'shared_pages':'Allocated once; exited writer pages may be charged to ancestor, not duplicated by readonly reader.'})
if (E/'failure.json').exists():raise SystemExit(1)
