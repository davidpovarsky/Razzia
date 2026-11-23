"""Deliver the bounded immutable candidate to one existing-cache test fixture."""
import ast
import base64
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
NAME = "mcp-runtime-F-20261115-01a1dfaa"
ROOT = "/home/ubuntu/tadazz-hq-qa-20261115"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
       "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", "ubuntu@132.145.25.168"]
files = {name: (HERE / name).read_bytes() for name in ["consumer.py", "format-and-compare.mjs", "run-phase.py",
    "launch.py", "activation.json", "remote-input-manifest.json", "format-remote.mjs"]}
for path in (HERE / "app").rglob("*"):
    if path.is_file():
        assert not path.is_symlink()
        files[path.relative_to(HERE).as_posix()] = path.read_bytes()
for name, data in files.items():
    if name.endswith(".py"): ast.parse(data)
activation = json.loads(files["activation.json"].decode("utf-8-sig"))
files["activation.json"] = (json.dumps(activation, indent=2) + "\n").encode()
payload = {name: {"base64": base64.b64encode(data).decode(), "sha256": hashlib.sha256(data).hexdigest()}
           for name, data in files.items()}
script = r'''
from pathlib import Path,PurePosixPath
import base64,hashlib,json,os,subprocess
base=Path(ROOT);source=base/'source'/NAME;evidence=base/'evidence'/NAME
assert not source.exists() and not evidence.exists()
v=os.statvfs(base);free=v.f_bavail*v.f_frsize
assert free>=RESERVE+ALLOWANCE,free
source.mkdir(mode=0o700);evidence.mkdir(mode=0o700)
for name,row in PAYLOAD.items():
    relative=PurePosixPath(name)
    assert not relative.is_absolute() and '..' not in relative.parts
    data=base64.b64decode(row['base64']);assert hashlib.sha256(data).hexdigest()==row['sha256']
    p=source/name;p.parent.mkdir(parents=True,exist_ok=True,mode=0o700);p.write_bytes(data);p.chmod(0o444)
print(json.dumps({'source':str(source),'files':len(PAYLOAD),'freeBefore':free}),flush=True)
result=subprocess.run(['python3',str(source/'launch.py')],capture_output=True,text=True)
print(result.stdout);print(result.stderr)
raise SystemExit(result.returncode)
'''.replace('ROOT', repr(ROOT)).replace('NAME', repr(NAME)).replace('RESERVE', str(activation['otherReserveBytes'])).replace('ALLOWANCE', str(activation['diskRemainingBytes'])).replace('PAYLOAD', repr(payload))
result = subprocess.run(SSH + ["python3 -"], input=script, capture_output=True, text=True)
receipt = {"exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr,
           "members": {name: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for name, data in files.items()}}
(HERE / "transport-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({k: receipt[k] for k in ["exit", "stdout", "stderr"]}, indent=2))
raise SystemExit(result.returncode)
