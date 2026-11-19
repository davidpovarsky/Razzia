from pathlib import Path
import subprocess,sys,json,shlex,datetime,time
ROOT=Path(r"C:\Users\DAVID\Code\Razzia-worktrees\tadazz-ux-unified-20261119")
DOCS=ROOT/"docs/extensions/plans/phase-continuity-20261119"
SHA="dccfd9d22a4673130704fea02bd80a8399498467"
mode=sys.argv[1]
assert mode in ("standard","transport")
assert subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()==SHA
assert not subprocess.check_output(["git","status","--porcelain","--untracked-files=no"],cwd=ROOT,text=True).strip()
if mode=="standard":
 command=[sys.executable,str(ROOT/"work/phase-continuity-20261119/release-tools/qualify_current_candidate.py"),SHA]
 budget=3480
else:
 progress=json.loads((DOCS/"release-gates-progress.json").read_text(encoding="utf-8"))
 assert progress["sourceSha"]==SHA and progress["status"]=="passed"
 command=[sys.executable,"extensions/qa/phase3-full-show/linux-browser-verify.py",progress["sourceRun"],"transport-race"]
 budget=1200
record=DOCS/("shared-qa-lock-"+mode+"-"+SHA[:12]+".json")
assert not record.exists(),"An earlier invocation must be inspected before any repeat"
state={"sourceSha":SHA,"mode":mode,"startedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"status":"acquiring","productionChanged":False}
def save(): record.write_text(json.dumps(state,indent=2)+"\n",encoding="utf-8")
save()
remote=r"""
import fcntl,sys,json,subprocess,select,os
f=open("/run/lock/tadazz-mcp-deploy.lock","a")
try:
 fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:
 print(json.dumps({"held":False,"reason":"shared-lock-busy"}),flush=True)
 raise SystemExit(73)
try:
 names=subprocess.check_output(["docker","ps","--format","{{.Names}}"],text=True,timeout=20).splitlines()
 heavy=[name for name in names if name.startswith(("tadazz-codex-","tadazz-gallery-","tadazz-editor-pins-","tadazz-mcp-stage-","tadazz-mcp-restore-proof-"))]
 assert not heavy,heavy
 app=json.loads(subprocess.check_output(["docker","inspect","tadazz"],text=True,timeout=20))[0]
 assert app["Id"]=="090d26a2fe7dd98a43226288932b7387bb9ec847cee5e5e2ff6ef48b6444bf40"
 assert app["Image"]=="sha256:56de89dd9ca496595980af84a7187b49fbff8c0cb563c3393c269d2b7c09d82a"
 assert app["State"]["Running"]
 print(json.dumps({"held":True,"pid":os.getpid(),"path":"/run/lock/tadazz-mcp-deploy.lock","heavyQa":[],"productionContainer":app["Id"],"productionImage":app["Image"]}),flush=True)
 ready,_,_=select.select([sys.stdin],[],[],3540)
 reason=sys.stdin.readline().strip() if ready else "lease-timeout"
 print(json.dumps({"released":True,"reason":reason or "connection-eof"}),flush=True)
finally:
 fcntl.flock(f,fcntl.LOCK_UN)
 f.close()
"""
ssh=["ssh","-i",r"C:\Users\DAVID\.ssh\tadazz_oracle_2026","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=10","ubuntu@132.145.25.168","sudo -n python3 -u -c "+shlex.quote(remote)]
holder=subprocess.Popen(ssh,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
code=1
try:
 line=holder.stdout.readline()
 assert line,holder.stderr.read(2000)
 admitted=json.loads(line)
 state["admission"]=admitted
 assert admitted.get("held") is True,admitted
 state["status"]="running";save()
 print(json.dumps({"sharedLock":admitted,"commandMode":mode}),flush=True)
 started=time.time()
 try:
  result=subprocess.run(command,cwd=ROOT,timeout=budget)
  code=result.returncode
 except subprocess.TimeoutExpired:
  code=124
 state.update(exit=code,seconds=round(time.time()-started,3),status="passed" if code==0 else "failed")
 save()
finally:
 if holder.poll() is None:
  try:
   holder.stdin.write("release\n");holder.stdin.flush();holder.stdin.close()
  except (BrokenPipeError,OSError): pass
 try: holder.wait(timeout=25)
 except subprocess.TimeoutExpired:
  holder.terminate();holder.wait(timeout=10)
 state["lockHolderExit"]=holder.returncode
 state["lockReleaseOutput"]=holder.stdout.read(4000)
 state["lockStderr"]=holder.stderr.read(4000)
 state["finishedAt"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
 save()
print(json.dumps(state),flush=True)
raise SystemExit(code)
