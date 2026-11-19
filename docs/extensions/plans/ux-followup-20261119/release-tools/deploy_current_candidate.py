import hashlib,json,pathlib,re,subprocess,sys,time
ROOT=pathlib.Path(r"C:\Users\DAVID\Code\Razzia-worktrees\tadazz-ux-unified-20261119")
DOCS=ROOT/"docs/extensions/plans/ux-followup-20261119"
SHA=json.loads((DOCS/"current-release-source.json").read_text(encoding="utf-8"))["sourceSha"]
assert len(SHA)==40 and all(c in "0123456789abcdef" for c in SHA)
action=sys.argv[1]
assert action in ("preflight","qualify-backup","deploy")
assert len(sys.argv)==(4 if action=="deploy" else 2)
stage=json.loads((DOCS/"stage-execution.json").read_text(encoding="utf-8"))
assert stage["exit"]==0
state=json.loads(stage["stdout"])
assert state["sourceSha"]==SHA and state["exit"]==0
cfg={"state":state,"action":action,"deployScriptSha256":hashlib.sha256(subprocess.check_output(["git","show",SHA+":extensions/deployment/deploy-mcp-site.py"],cwd=ROOT)).hexdigest(),
 "jwkX":"tACOjBqxXwVTEOG6fEXsgmJlZbzxbbLsb-1W-cRbPoE","clientId":"tadazz-chatgpt-private-20261118","redirect":"https://chatgpt.com/connector_platform_oauth_redirect"}
if action=="deploy":
 assert sys.argv[2].startswith("/") and re.fullmatch(r"[0-9a-f]{64}",sys.argv[3])
 cfg["qualificationReceipt"]=sys.argv[2]
 cfg["qualificationSha256"]=sys.argv[3]
remote=r'''import hashlib,json,os,pathlib,subprocess,time
os.umask(0o077)
c=__CONFIG__
s=c["state"]
owned=pathlib.Path("/home/ubuntu/tadazz-phase2-20261116/evidence")/s["sourceRun"]
disk_state=json.loads((owned/"release-receipts/coordinator-stage-state.json").read_text())
assert disk_state==s
script=owned/"source/extensions/deployment/deploy-mcp-site.py"
assert hashlib.sha256(script.read_bytes()).hexdigest()==c["deployScriptSha256"]
args=["python3",str(script),"--action",c["action"],"--image",s["candidateTag"],"--image-sha256",s["candidateImage"],"--revision",s["sourceSha"],"--expected-container",s["productionContainer"],"--expected-image",s["productionImage"],"--expected-gateway",s["gatewayContainer"],"--expected-running-count",str(s["runningCount"]),"--release-dir",s["releaseDir"],"--stage-manifest-sha256",s["stageManifestSha256"],"--expected-config-sha256",s["runtimeConfigSha256"],"--expected-jwk-x",c["jwkX"],"--client-id",c["clientId"],"--redirect-uri",c["redirect"]]
if c["action"]=="qualify-backup": args.append("--qualify-candidate")
if c["action"]=="deploy": args.extend(["--qualification-receipt",c["qualificationReceipt"],"--qualification-sha256",c["qualificationSha256"]])
started=time.time()
logbase=owned/"release-receipts"/("coordinator-"+c["action"])
def text(value): return value.decode("utf-8",errors="replace") if isinstance(value,bytes) else (value or "")
process=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
deadline_exceeded=False
try:
 stdout,stderr=process.communicate(timeout=1200)
except subprocess.TimeoutExpired:
 deadline_exceeded=True
 # SIGTERM lets the existing guarded deployer execute its rollback handlers.
 if process.poll() is None: process.terminate()
 try:
  stdout,stderr=process.communicate(timeout=300)
 except subprocess.TimeoutExpired as error:
  logbase.with_suffix(".stdout.log").write_text(text(error.stdout))
  logbase.with_suffix(".stderr.log").write_text(text(error.stderr))
  output={"action":c["action"],"exit":124,"timedOut":True,"sourceSha":s["sourceSha"],"seconds":round(time.time()-started,3),"stateRequiresInspection":True,"guardedProcessStillRunning":True,"guardedProcessPid":process.pid,"hardKillSent":False}
  logbase.with_suffix(".json").write_text(json.dumps(output,indent=2)+"\n")
  print(json.dumps(output))
  raise SystemExit(124)
result=subprocess.CompletedProcess(args,124 if deadline_exceeded else process.returncode,stdout,stderr)
logbase.with_suffix(".stdout.log").write_text(result.stdout)
logbase.with_suffix(".stderr.log").write_text(result.stderr)
current={}
for name in ("tadazz","tadazz-phone-gateway"):
 try:
  detail=json.loads(subprocess.check_output(["docker","inspect",name],timeout=20))[0]
  current[name]={"id":detail["Id"],"image":detail["Image"],"running":detail["State"]["Running"],"startedAt":detail["State"]["StartedAt"],"restartCount":detail["RestartCount"]}
 except Exception as error:
  current[name]={"inspectionFailed":True,"error":type(error).__name__}
output={"action":c["action"],"exit":result.returncode,"deadlineExceeded":deadline_exceeded,"childExit":process.returncode,"stateRequiresInspection":deadline_exceeded,"sourceSha":s["sourceSha"],"seconds":round(time.time()-started,3),"stdout":result.stdout,"stderr":result.stderr,"observedContainers":current}
logbase.with_suffix(".json").write_text(json.dumps(output,indent=2)+"\n")
print(json.dumps(output))
raise SystemExit(result.returncode)
'''
remote=remote.replace("__CONFIG__",repr(cfg))
compile(remote,"deploy-action-remote","exec")
started=time.time()
try:
 result=subprocess.run(["ssh","-i",r"C:\Users\DAVID\.ssh\tadazz_oracle_2026","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=10","ubuntu@132.145.25.168","sudo -n python3 -"],input=remote,capture_output=True,text=True,timeout=1620)
 output={"action":action,"exit":result.returncode,"seconds":round(time.time()-started,3),"stdout":result.stdout,"stderr":result.stderr}
except subprocess.TimeoutExpired as error:
 def text(value): return value.decode("utf-8",errors="replace") if isinstance(value,bytes) else (value or "")
 output={"action":action,"exit":124,"timedOut":True,"stateRequiresInspection":True,"stdout":text(error.stdout),"stderr":text(error.stderr)}
(DOCS/("deployment-"+action+"-execution.json")).write_text(json.dumps(output,indent=2)+"\n",encoding="utf-8")
print(json.dumps(output),flush=True)
raise SystemExit(output["exit"])
