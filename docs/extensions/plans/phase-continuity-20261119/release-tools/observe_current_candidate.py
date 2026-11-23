import hashlib,json,pathlib,subprocess
ROOT=pathlib.Path(r"C:\Users\DAVID\Code\Razzia-worktrees\tadazz-ux-unified-20261119")
DOCS=ROOT/"docs/extensions/plans/phase-continuity-20261119"
stage=json.loads((DOCS/"stage-execution.json").read_text(encoding="utf-8"))
deployed=json.loads((DOCS/"deployment-deploy-execution.json").read_text(encoding="utf-8"))
assert stage["exit"]==deployed["exit"]==0
state=json.loads(stage["stdout"])
cfg={"state":state,"scriptSha256":hashlib.sha256(subprocess.check_output(["git","show",state["sourceSha"]+":extensions/deployment/observe-mcp-site.py"],cwd=ROOT)).hexdigest()}
remote=r"""import datetime,hashlib,json,pathlib,subprocess,urllib.request,urllib.error
c=__CONFIG__
s=c["state"]

def worker_snapshot():
 unit=pathlib.Path("/etc/systemd/system/tadazz-package-builder.service")
 broker=pathlib.Path("/opt/tadazz-package-runtime/package-build-worker.py")
 unit_hash=hashlib.sha256(unit.read_bytes()).hexdigest()
 broker_hash=hashlib.sha256(broker.read_bytes()).hexdigest()
 assert unit_hash=="7bfd2b44f2409588f162e278e2b3eb5a8671f61d81f1609ad29292608231559c","Worker unit changed since baseline"
 assert broker_hash=="7b591a69dd4aca951cf0f8224670c797696979085ae23c01d596ab99159d60d6","Worker broker changed since baseline"
 image="sha256:4ef04ef752c23e5360399880f1bcf4c79c0f48900c9597bcaa68da8aa01d1411"
 assert json.loads(subprocess.check_output(["docker","image","inspect","--format","{{json .Id}}",image],timeout=20))==image
 def properties(unit,fields):
  output=subprocess.check_output(["systemctl","show",unit,"--property="+",".join(fields)],text=True,timeout=20)
  return dict(line.split("=",1) for line in output.splitlines() if "=" in line)
 timer=properties("tadazz-package-builder.timer",["Unit","ActiveState","SubState","UnitFileState"])
 service=properties("tadazz-package-builder.service",["Result","ExecMainStatus","ActiveState","SubState"])
 assert timer["Unit"]=="tadazz-package-builder.service" and timer["ActiveState"]=="active" and timer["UnitFileState"]=="enabled","Worker timer changed"
 assert service["Result"]=="success" and service["ExecMainStatus"]=="0" and service["ActiveState"]!="failed","Worker service unhealthy"
 return {"unitSha256":unit_hash,"brokerSha256":broker_hash,"image":image,"imagePresent":True,"timer":timer,"service":service,"passed":True}

worker_before=worker_snapshot()
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
worker_after=worker_snapshot()
report={"workerPreservation":{"before":worker_before,"after":worker_after,"passed":True},"sourceSha":s["sourceSha"],"sourceRun":s["sourceRun"],"container":app["Id"],"image":app["Image"],"gateway":gateway["Id"],"oldContainerRetained":inspect(s["productionContainer"])["Id"]==s["productionContainer"],"runtimeConfigHashUnchanged":True,"cacheRestoredStopped":True,"publicRouteProbes":routes,"observation":observation,"passed":True,"noCustomerMutation":True,"productionBrowserVisualInspection":False}
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
