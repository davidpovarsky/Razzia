import hashlib, json, pathlib, zipfile
base = pathlib.Path('/home/ubuntu/tadazz-hq-qa-20261115')
prep = 'mcp-corrected-prep-d178b63130292c9342ba328dcea3a550c4f51e1b958379aa5d611e2b02549676'
app = base / 'source' / prep / 'app'
evidence = base / 'evidence' / prep
manifest = json.loads((base / 'source' / prep / 'candidate-input-manifest.json').read_text())
sha = lambda b: hashlib.sha256(b).hexdigest()
rows = []
with zipfile.ZipFile(evidence / 'formatted-source.zip', 'x', zipfile.ZIP_DEFLATED) as z:
    for row in manifest['files']:
        if not row['path'].startswith('extensions/src/mcp-app/'): continue
        target = app / row['path']
        assert not target.is_symlink()
        content = target.read_bytes()
        z.writestr(row['path'], content)
        rows.append({'path':row['path'], 'bytes':len(content), 'sha256':sha(content)})
(evidence / 'formatted-source.json').write_text(json.dumps({'files':rows,
    'zipSha256':sha((evidence / 'formatted-source.zip').read_bytes())}, indent=2)+'\n')
sdk = app / 'extensions/src/mcp-app/node_modules/@modelcontextprotocol/server'
sources = []
for name, ranges in [('dist/mcp-BCJHyo7l.d.mts', [(1924,1989),(3098,3118),(3246,3252)]),
                     ('dist/mcp-oHn3ureC.mjs', [(1242,1258),(1589,1623)])]:
    content = (sdk / name).read_bytes()
    lines = content.decode().splitlines()
    sources.append({'path':name, 'sha256':sha(content), 'excerpts':[
        {'startLine':a, 'endLine':b, 'text':'\n'.join(lines[a-1:b])} for a,b in ranges]})
(evidence / 'sdk-public-api-provenance.json').write_text(json.dumps({
    'package':'@modelcontextprotocol/server', 'version':json.loads((sdk/'package.json').read_text())['version'],
    'basis':'Actual isolated installed package, frozen public-registry lock. Uses public Transport composition and projectCallToolResult, not private APIs or SDK mutations.',
    'sources':sources},indent=2)+'\n')
files = []
for f in manifest['files']:
    content = (app / f['path']).read_bytes()
    files.append({'path':f['path'], 'bytes':len(content), 'sha256':sha(content)})
final = {'status':'FINAL_CORRECTED_INPUTS_PENDING_VALIDATION', 'reviewedBase':manifest['reviewedBase'],
    'sdk':'server/client/core2.4.0 ext-apps2.1.0', 'files':files}
encoded = (json.dumps(final,indent=2)+'\n').encode()
pin = sha(encoded)
delivery = base / 'source' / ('mcp-corrected-' + pin)
out = delivery / 'app'
out.mkdir(parents=True, mode=0o700)
for f in files:
    src = app / f['path']
    dst = out / f['path']
    assert dst.resolve().is_relative_to(out.resolve())
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open('xb') as writer: writer.write(src.read_bytes())
(delivery / 'final-input-manifest.json').write_bytes(encoded)
(evidence / 'final-input-manifest.json').write_bytes(encoded)
for kind in ['fixtures','evidence']: (base / kind / ('mcp-corrected-' + pin)).mkdir(mode=0o700)
(evidence / 'final-namespace.json').write_text(json.dumps({'pin':pin,'files':len(files)},indent=2)+'\n')
print(json.dumps({'pin':pin,'files':len(files),'moduleFiles':len(rows)}))
