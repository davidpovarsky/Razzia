"""Account owned new blocks, excluding shared hardlinked retained source bytes."""
from pathlib import Path
import json
import os
import shutil
import stat
import subprocess
root = Path('/home/ubuntu/tadazz-hq-qa-20261115')
seen = set()
allocated = 0
paths = []
owned_roots = [owned for parent in ['source', 'evidence'] for owned in (root / parent).glob('show-ui-E-*')]
owned_links = {}
for owned in owned_roots:
    for path in ([owned, *owned.rglob('*')] if owned.is_dir() else [owned]):
        info = path.lstat()
        if stat.S_ISREG(info.st_mode):
            inode = (info.st_dev, info.st_ino)
            owned_links[inode] = owned_links.get(inode, 0) + 1
for parent in ['source', 'evidence']:
    for owned in (root / parent).glob('show-ui-E-*'):
        total = 0
        candidates = [owned, *owned.rglob('*')] if owned.is_dir() else [owned]
        for path in candidates:
            info = path.lstat()
            inode = (info.st_dev, info.st_ino)
            if inode in seen:
                continue
            seen.add(inode)
            # Exclude only a file with a link outside this lane's owned roots.
            # Reused OWN overlay bytes still count once when linked into a later view.
            if stat.S_ISREG(info.st_mode) and info.st_nlink > owned_links[inode]:
                continue
            total += info.st_blocks * 512
        paths.append({'path': str(owned), 'new_allocated_blocks_bytes': total})
        allocated += total
docker_metadata = []
docker_root = Path(subprocess.check_output(['docker','info','--format','{{.DockerRootDir}}'],text=True).strip())
ids = subprocess.check_output(['docker','ps','-aq','--no-trunc','--filter','name=^/tadazz-show-ui-E-'],text=True).split()
if ids:
    for container in json.loads(subprocess.check_output(['docker','inspect','--size',*ids])):
        directory = docker_root/'containers'/container['Id']
        size = sum(path.lstat().st_blocks*512 for path in [directory,*directory.rglob('*')] if path.exists())
        writable = max(0,container.get('SizeRw',0))
        docker_metadata.append({'container':container['Name'],'metadata_allocated_bytes':size,'size_rw_logical_proxy':writable})
        allocated += size+writable
print(json.dumps({'owned_new_allocated_bytes': allocated, 'disk_available': shutil.disk_usage(root).free, 'method': 'allocated blocks plus directory blocks; inode dedup; only links outside owned roots excluded as shared retained bytes; own reused hardlinks counted once; owned E Docker metadata plus SizeRw logical proxy included; no deletions', 'paths': paths, 'docker_metadata':docker_metadata}, indent=2))
