"""Test the final scoped correction in a distinct RAM source root, reusing deps.

The first attempt and its source remain immutable. No install or container restart.
"""
import base64
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / ".git").exists())
NAME = "mcp-runtime-F-20261115-01a1dfaa"
CONTAINER = "tadazz-hq-" + NAME
MODULE = "extensions/src/mcp-app/"
manifest = json.loads((HERE / "runtime-01/remote-input-manifest.json").read_text(encoding="utf-8-sig"))
overlay = {}
for row in manifest["files"]:
    raw = (ROOT / row["path"]).read_bytes()
    row.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
    if row["path"] in manifest["overlayPaths"]:
        overlay[row["path"]] = base64.b64encode(raw).decode()
manifest.update(kind="FINAL_CORRECTED_REMOTE_CANDIDATE", previousAttempt="52PASS_1FAIL_abort_status", committed=False)
formatter = (HERE / "runtime-01/format-remote.mjs").read_text()
formatter = formatter.replace("/ram/work", "/ram/work-final")
formatter = formatter.replace("/delivery/remote-input-manifest.json", "/evidence/final-raw-input-manifest.json")
formatter = formatter.replace("/evidence/remote-formatted", "/evidence/final-formatted")
formatter = formatter.replace("/evidence/remote-semantic-equivalence.json", "/evidence/final-semantic-equivalence.json")
script = r'''
import hashlib,json,os,subprocess
from pathlib import Path
E=Path('/evidence');base=Path('/ram/work');root=Path('/ram/work-final');module='extensions/src/mcp-app/'
assert os.getuid()==1001 and (E/'awaiting-owned-finish.json').exists() and not root.exists()
old=json.loads((E/'remote-formatted-input-manifest.json').read_text())
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
for row in old['files']:
    p=base/row['path'];assert p.is_file() and not p.is_symlink() and sha(p)==row['sha256'],row['path']
manifest=MANIFEST
import base64
overlay={name:base64.b64decode(value) for name,value in OVERLAY.items()}
for row in manifest['files']:
    name=row['path'];p=root/name;p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    data=overlay[name] if name in overlay else (base/name).read_bytes()
    assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'],name
    p.write_bytes(data);p.chmod(0o444)
(root/module/'node_modules').symlink_to(base/module/'node_modules',target_is_directory=True)
(root/'node_modules').symlink_to(base/module/'node_modules',target_is_directory=True)
(E/'final-raw-input-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(E/'format-final.mjs').write_text(FORMATTER)
env=dict(os.environ,HOME='/ram/home',TMPDIR='/ram/tmp',XDG_CACHE_HOME='/ram/home/.cache',
    XDG_DATA_HOME='/ram/home/.local/share',XDG_STATE_HOME='/ram/home/.local/state',XDG_RUNTIME_DIR='/ram/runtime',
    PNPM_HOME='/ram/pnpm',npm_config_cache='/ram/npm-cache',NPM_CONFIG_USERCONFIG='/ram/empty-user.npmrc',
    NPM_CONFIG_GLOBALCONFIG='/ram/empty-global.npmrc',NODE_OPTIONS='',NODE_PATH='',NO_UPDATE_NOTIFIER='1')
phases={}
for name,command in [('09-final-format',['node','/evidence/format-final.mjs']),
    ('10-final-typecheck',['pnpm','run','typecheck']),('11-final-sdk-tests',['pnpm','run','test'])]:
    result=subprocess.run(['python3','/delivery/run-phase.py',name,*command],cwd=root/module,env=env)
    phases[name]=result.returncode
    if result.returncode:break
final=json.loads((E/'final-formatted-input-manifest.json').read_text())
for row in final['files']:
    p=root/row['path'];assert sha(p)==row['sha256'] and p.stat().st_size==row['bytes'],row['path']
for row in old['files']:
    assert sha(base/row['path'])==row['sha256'],row['path']
(E/'final-candidate-summary.json').write_text(json.dumps({'phases':phases,'sourceInputs':len(final['files']),
    'finalManifestSha256':sha(E/'final-formatted-input-manifest.json'),'originalAttemptSourcePreserved':True,
    'dependencyInstallRepeated':False,'actualHostOrOAuthPkce':False},indent=2)+'\n')
print(json.dumps({'phases':phases,'sourceInputs':len(final['files'])}),flush=True)
raise SystemExit(0 if len(phases)==3 and not any(phases.values()) else 1)
'''.replace('MANIFEST', repr(manifest)).replace('OVERLAY', repr(overlay)).replace('FORMATTER', repr(formatter))
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
       "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", "ubuntu@132.145.25.168"]
result = subprocess.run(SSH + ["sudo -n docker exec -i " + CONTAINER + " python3 -"],
    input=script, text=True, capture_output=True)
receipt={"exit":result.returncode,"stdout":result.stdout,"stderr":result.stderr,
    "rawManifestSha256":hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()}
(HERE/'runtime-01/final-candidate-dispatch.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
raise SystemExit(result.returncode)
