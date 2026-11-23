"""Prepare only changed tracked source plus exact existing fixture hardlinks."""
import hashlib,io,json,pathlib,subprocess,tarfile
P=pathlib.Path(__file__).resolve().parent
git=lambda *a:subprocess.check_output(['git',*a])
head=git('rev-parse','HEAD').decode().strip()
assert head=='58cfb5c7a734518c715ae56d74666441f0743f5d'
old=json.loads((P.parent/'integrator-root-85e/manifest-complete.json').read_text())
before={x['path']:x for x in old['entries']}
extra={'extensions/vitest.config.ts','vitest.config.ts','packages/web/public/tadazz-show/v4/tadazz-brand-logo.png','packages/web/public/sounds/answersMusic.mp3'}
entries=[];overlay=[]
with tarfile.open(P/'overlay.tar','w') as tar:
    for row in git('ls-tree','-r','-z',head).split(b'\0'):
        if not row:continue
        meta,rawname=row.split(b'\t',1);mode,kind,blob=meta.decode().split();name=rawname.decode()
        if not(name in before or name in extra or name.startswith('extensions/src/')):continue
        assert kind=='blob' and mode in ('100644','100755')
        x={'path':name,'mode':mode,'blob':blob}
        if before.get(name)==x:x['input']='prior-complete'
        elif name in extra:x['input']='prior47e'
        else:
            x['input']='overlay';data=git('cat-file','blob',blob);info=tarfile.TarInfo(name);info.size=len(data);info.mode=int(mode,8)&0o777;tar.addfile(info,io.BytesIO(data));overlay.append(name)
        entries.append(x)
manifest={'head':head,'parent_frozen_product':'85e8f0d2d8dfcacccf9b36bfe899d15c74c8a0a0','entries':entries,'overlay':overlay,'overlay_bytes':(P/'overlay.tar').stat().st_size,'overlay_sha256':hashlib.sha256((P/'overlay.tar').read_bytes()).hexdigest(),'asset_and_config_inputs':sorted(extra),'scope':'No docs/.git/deps/store clone. Only exact tracked source/config/test assets; immutable old inputs hardlinked, changed files own overlay.'}
(P/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps({'head':head,'entries':len(entries),'overlay_files':len(overlay),'overlay_bytes':manifest['overlay_bytes']},indent=2))
