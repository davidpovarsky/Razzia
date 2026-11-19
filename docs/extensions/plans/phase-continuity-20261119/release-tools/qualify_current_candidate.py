import json,pathlib,subprocess,sys,time
ROOT=pathlib.Path(r"C:\Users\DAVID\Code\Razzia-worktrees\tadazz-ux-unified-20261119")
DOCS=ROOT/"docs/extensions/plans/phase-continuity-20261119"
EVIDENCE=ROOT/"docs/extensions/plans/phase3-takeover-20261117"
SHA=sys.argv[1]
assert len(SHA)==40 and all(c in "0123456789abcdef" for c in SHA)
assert subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()==SHA
assert not subprocess.check_output(["git","diff","--name-only","HEAD","--","extensions","packages"],cwd=ROOT,text=True).strip()
progress_path=DOCS/"release-gates-progress.json"
if progress_path.exists():
 previous=json.loads(progress_path.read_text(encoding="utf-8"))
 assert previous.get("status") in ("passed","failed"),"Previous pipeline must have completed"
 archive=DOCS/("release-gates-progress-"+previous["sourceSha"][:12]+".json")
 if not archive.exists(): archive.write_bytes(progress_path.read_bytes())
progress={"sourceSha":SHA,"serialCpuBudget":True,"fullShowMemoryLimitBytes":3221225472,"completed":[],"status":"running"}
def write(): progress_path.write_text(json.dumps(progress,indent=2)+"\n",encoding="utf-8")
def run(name,args,budget):
 progress.update(current=name,stepStartedAt=time.time());write()
 start=time.time();log=DOCS/("linux-"+name+"-"+SHA[:12]+".log")
 with log.open("w",encoding="utf-8") as output:
  try: result=subprocess.run([sys.executable,*args],cwd=ROOT,stdout=output,stderr=subprocess.STDOUT,text=True,timeout=budget)
  except subprocess.TimeoutExpired:
   output.write("\nCoordinator timeout exceeded; no success inferred.\n")
   code=124
  else: code=result.returncode
 item={"check":name,"exit":code,"seconds":round(time.time()-start,1),"log":str(log)}
 progress["completed"].append(item);write();print(json.dumps(item),flush=True)
 if code:
  progress["status"]="failed";progress["failedCheck"]=name;write();raise SystemExit(code)
run("native-launch",["extensions/qa/phase3-recovery/linux-verify.py","native-launch"],600)
paths=list(EVIDENCE.glob("tadazz-codex-"+SHA[:12]+"-*/receipt.json"))
assert len(paths)==1,[str(x) for x in paths]
source_run=paths[0].parent.name
receipt=json.loads(paths[0].read_text(encoding="utf-8"))
assert receipt["sha"]==SHA and receipt["allHashesVerifiedBeforeAfter"] and all(x["exit"]==0 for x in receipt["checks"])
progress["sourceRun"]=source_run;write()
run("native-consent",["extensions/qa/phase3-native-consent/browser-verify.py",source_run],720)
run("full-show",["extensions/qa/phase3-full-show/linux-browser-verify.py",source_run],1980)
run("proxy",["extensions/qa/phase3-native-consent/proxy-verify.py","--source-run",source_run,"--immutable"],120)
progress["status"]="passed";progress["finishedAt"]=time.time();progress.pop("current",None);write()
print(json.dumps(progress),flush=True)
