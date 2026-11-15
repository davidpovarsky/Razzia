"""Small Git-blob overlay for an isolated, network-free QA workspace."""
import hashlib, io, json, pathlib, subprocess, tarfile, urllib.request

TREE = pathlib.Path(__file__).resolve().parents[5]
OUT = pathlib.Path(__file__).resolve().parent
SSH = ['ssh', '-i', 'C:/Users/DAVID/.ssh/tadazz_oracle_2026', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', 'ubuntu@132.145.25.168']
ROOT = '/home/ubuntu/tadazz-hq-qa-20261115'
NAME = 'integrator-root-85e-20261115'

def git(*args):
    return subprocess.check_output(['git', '-C', str(TREE), *args])

assert git('rev-parse', 'HEAD').decode().strip() == '85e8f0d2d8dfcacccf9b36bfe899d15c74c8a0a0'
old = json.loads(subprocess.check_output(SSH + ['cat', ROOT+'/evidence/integration-types-47e-20261115/integration-types-manifest-v2.json']))
old_entries = {e['path']: e for e in old['entries']}
exact = {'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'Dockerfile', 'extensions/package.json', 'extensions/tsconfig.json'}
prefixes = ('extensions/src/', 'packages/common/src/', 'packages/web/src/', 'packages/socket/src/', 'packages/e2e/utils/')
entries, overlay = [], []
with tarfile.open(OUT/'overlay.tar', 'w') as archive:
    for row in git('ls-tree', '-r', '-z', 'HEAD').split(b'\0'):
        if not row:
            continue
        meta, path_bytes = row.split(b'\t', 1)
        mode, kind, blob = meta.decode().split()
        path = path_bytes.decode()
        parts = path.split('/')
        selected = path in exact or path.startswith(prefixes) or (len(parts)==3 and parts[0]=='packages' and (parts[2]=='package.json' or parts[2].startswith('tsconfig'))) or (len(parts)==2 and parts[0]=='extensions' and parts[1].startswith('tds') and parts[1].endswith('.ts'))
        if not selected:
            continue
        assert kind == 'blob' and mode in ('100644', '100755'), (path, mode, kind)
        entry = {'path': path, 'mode': mode, 'blob': blob}
        entries.append(entry)
        if old_entries.get(path) == entry:
            continue
        data = git('cat-file', 'blob', blob)
        info = tarfile.TarInfo(path)
        info.mode, info.size, info.mtime = int(mode, 8)&0o777, len(data), 0
        archive.addfile(info, io.BytesIO(data))
        overlay.append(path)
manifest = {'head': git('rev-parse','HEAD').decode().strip(), 'previous_source': 'integration-types-47e-20261115', 'entries': entries, 'overlay': overlay, 'overlay_bytes': (OUT/'overlay.tar').stat().st_size, 'overlay_sha256': hashlib.sha256((OUT/'overlay.tar').read_bytes()).hexdigest()}
(OUT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
sources = ['store_index.rs', 'msgpackr_records.rs', 'cas_file.rs', 'check_pkg_files_integrity.rs']
receipts = []
for source in sources:
    url = 'https://raw.githubusercontent.com/pnpm/pnpm/v12.18.0/pnpm/crates/store-dir/src/'+source
    data = urllib.request.urlopen(url, timeout=20).read()
    (OUT/('pnpm-'+source)).write_bytes(data)
    receipts.append({'url': url, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
(OUT/'primary-sources.json').write_text(json.dumps(receipts, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'tree':str(TREE),'selected':len(entries),'overlay':overlay,'overlay_bytes':manifest['overlay_bytes'],'primary_sources':receipts},indent=2))
