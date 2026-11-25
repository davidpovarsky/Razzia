"""Source formatting only, on the same existing bounded offline QA image."""
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "-i", "C:/Users/DAVID/.ssh/tadazz_oracle_2026", "ubuntu@132.145.25.168"]
script = r'''
from pathlib import Path
import hashlib,json,os,subprocess
base=Path('/home/ubuntu/tadazz-hq-qa-20261115');name='mcp-m3a-e538db2b931fa6c223facffa9a7e0b0ac31b6270d8f629d8bf8e8d72245bc1f6'
e=base/'evidence'/name/'attempt-05-format';assert not e.exists()
state=json.loads(subprocess.check_output(['sudo','-n','docker','inspect','tadazz-hq-mcp-m3a-20261115-r4','--format','{{json .State}}']));assert not state['Running']
v=os.statvfs(base);assert v.f_bavail*v.f_frsize>=2400*1024**2
e.mkdir(mode=0o700)
prior=base/'evidence'/name/'attempt-04';source=base/'source'/name/'attempt-04/app/extensions/src/mcp-app/first-party/ingress.ts'
image=json.loads((prior/'launch.json').read_text())['image'];container='tadazz-hq-mcp-m3a-format-20261115'
cmd=['sudo','-n','docker','run','--name',container,'--user','1001:1001','--network','none','--cpus','.25','--memory','2g','--memory-swap','2g','--pids-limit','64','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--ulimit','core=0:0','--log-driver','json-file','--log-opt','max-size=1m','--log-opt','max-file=1','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=16777216,mode=1777','--mount',f'type=bind,src={source},dst=/ingress.ts,readonly','--mount',f'type=bind,src={prior / "format-options.json"},dst=/format-options.json,readonly','--entrypoint','node',image,'/cleanup/node_modules/prettier/bin/prettier.cjs','--config','/format-options.json','/ingress.ts']
(e/'command.json').write_text(json.dumps(cmd,indent=2)+'\n')
r=subprocess.run(cmd,capture_output=True);(e/'ingress.ts').write_bytes(r.stdout);(e/'formatter.stderr').write_bytes(r.stderr)
out={'kind':'SOURCE_FORMAT_ONLY','exit':r.returncode,'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(r.stdout).hexdigest(),'outputBytes':len(r.stdout),'applicationImported':False}
(e/'result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out));raise SystemExit(r.returncode)
'''
result = subprocess.run(SSH + ["python3 -"], input=script, text=True, capture_output=True)
(HERE / "format-transport.json").write_text(json.dumps({"exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr}, indent=2) + "\n", encoding="utf-8")
print(result.stdout)
if result.returncode: print(result.stderr)
raise SystemExit(result.returncode)
