import hashlib,json,pathlib,subprocess
ROOT=pathlib.Path(r"C:\Users\DAVID\Code\Razzia-worktrees\tadazz-ux-unified-20261119")
DOCS=ROOT/"docs/extensions/plans/ux-followup-20261119"
stage=json.loads((DOCS/"stage-execution.json").read_text(encoding="utf-8"))
deployed=json.loads((DOCS/"deployment-deploy-execution.json").read_text(encoding="utf-8"))
assert stage["exit"]==deployed["exit"]==0
state=json.loads(stage["stdout"])
cfg={"state":state,"scriptSha256":hashlib.sha256(subprocess.check_output(["git","show",state["sourceSha"]+":extensions/deployment/observe-mcp-site.py"],cwd=ROOT)).hexdigest()}
remote=r"""import datetime,hashlib,json,pathlib,subprocess,urllib.request,urllib.error
c=__CONFIG__
s=c["state"]
owned=pathlib.Path("/home/ubuntu/tadazz-phase2-20261116/evidence")/s["sourceRun"]
assert json.loads((owned/"release-receipts/coordinator-stage-state.json").read_text())==s
def inspect(name): return json.loads(subprocess.check_output(["docker","inspect",name],timeout=20))[0]
app=inspect("tadazz");gateway=inspect("tadazz-phone-gateway")
assert app["Id"]!=s["productionContainer"] and app["Image"]==s["candidateImage"] and app["State"]["Running"] and app["RestartCount"]==0
assert gateway["Id"]==s["gatewayContainer"] and gateway["State"]["Running"]
runtime=pathlib.Path("/var/lib/tadazz-release-5312660/config/extensions/mcp-service/runtime.json")
assert hashlib.sha256(runtime.read_bytes()).hexdigest()==s["runtimeConfigSha256"]
script=owned/"source/extensions/deployment/observe-mcp-site.py"
assert hashlib.sha256(script.read_bytes()).hexdigest()==c["scriptSha256"]
result=subprocess.run(["python3",str(script),"--container",app["Id"],"--image",app["Image"],"--gateway",gateway["Id"],"--since",app["State"]["StartedAt"],"--samples","3","--interval","15"],capture_output=True,text=True,timeout=240)
assert result.returncode==0,result.stderr[-1500:]
observation=json.loads(result.stdout)
assert observation["passed"] and observation["restartsDuringWindow"]==0
routes=[]
for path in ["/","/studio/games","/studio/prepare","/studio/themes","/manager/quizz","/api/auth/mode","/api/contact/config","/api/billing/config","/api/billing/catalog"]:
 request=urllib.request.Request("https://tadazz.com"+path,headers={"User-Agent":"Tadazz-release-verification/1"})
 with urllib.request.urlopen(request,timeout=20) as response:
  data=response.read(2*1024*1024)
  item={"path":path,"status":response.status,"contentType":response.headers.get("content-type",""),"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
  assert response.status==200
  if not path.startswith("/api/"): assert "text/html" in item["contentType"]
  else: assert isinstance(json.loads(data),dict)
  routes.append(item)
ending=inspect("tadazz")
assert ending["Id"]==app["Id"] and ending["State"]["Running"] and ending["RestartCount"]==0
cache=inspect("tadazz-phase2-20261116")
assert not cache["State"]["Running"]
report={"sourceSha":s["sourceSha"],"sourceRun":s["sourceRun"],"container":app["Id"],"image":app["Image"],"gateway":gateway["Id"],"oldContainerRetained":inspect(s["productionContainer"])["Id"]==s["productionContainer"],"runtimeConfigHashUnchanged":True,"cacheRestoredStopped":True,"publicRouteProbes":routes,"observation":observation,"passed":True,"noCustomerMutation":True,"productionBrowserVisualInspection":False}
(owned/"release-receipts/post-deploy-observation.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report))
"""
remote=remote.replace("__CONFIG__",repr(cfg))
compile(remote,"postdeploy-remote","exec")
result=subprocess.run(["ssh","-i",r"C:\Users\DAVID\.ssh\tadazz_oracle_2026","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=10","ubuntu@132.145.25.168","sudo -n python3 -"],input=remote,capture_output=True,text=True,timeout=420)
envelope={"exit":result.returncode,"stdout":result.stdout,"stderr":result.stderr}
(DOCS/"post-deploy-execution.json").write_text(json.dumps(envelope,indent=2)+"\n",encoding="utf-8")
if result.returncode==0:
 report=json.loads(result.stdout)
 (DOCS/"post-deploy-observation.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print(json.dumps(envelope),flush=True)
raise SystemExit(result.returncode)
