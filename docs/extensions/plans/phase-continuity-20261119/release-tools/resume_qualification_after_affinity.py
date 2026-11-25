"""Resume only the unfinished full-show and proxy gates for frozen source 730.
The original failure is archived intact. Passed native/launch/consent receipts are
reused by exact hash. No product edit, rebuild, pin change, stage or deploy.
Root must restore the reviewed QA overlay before executing this coordinator.
"""
import hashlib,json,pathlib,subprocess,sys,time,uuid
ROOT=pathlib.Path(r"C:\Users\DAVID\Code\Razzia-worktrees\tadazz-ux-unified-20261119")
DOCS=ROOT/"docs/extensions/plans/phase-continuity-20261119"
EVIDENCE=ROOT/"docs/extensions/plans/phase3-takeover-20261117"
SHA="730cb4579d22589e1a7fc96a6873df9cb273e479"
SOURCE_RUN="tadazz-codex-730cb4579d22-d298324d"
CONTROLLER=ROOT/"work/phase-continuity-20261119/release-tools/fullshow_affinity_corrected.py"
CONTROLLER_SHA="b1a7563155042939649f064228a5f04243d8c46a4bbf641fa5415679a58638cc"
INPUT_SHA="f2a8689c21efccc567b73c9b405c6b682aa6c1be903fb8bdf04c6d4edaf9771b"
PROGRESS_SHA="3a2e720781abc79be53d2c8f3c204d348b84c0060a40562beb285b6ba341b04f"
REUSED={
 "native":{"path":SOURCE_RUN+"/receipt.json","sha256":"9acb0e86abf6e731dff95d8ce7b09d2075f5bb5f1b49b7fdc13cbdfa292794b7"},
 "launch":{"path":"tadazz-codex-launch-730cb4579d22-b62a2567/receipt.json","sha256":"d15f931e43ac355802b16efc6cf340dcca57343766b0a44c3c4b7144db11c670"},
 "native-consent":{"path":"tadazz-codex-browser-730cb4579d22-afa1ade8/receipt.json","sha256":"f8576b7319e04e181d5b40a1b859c725120e0f2c8f36a65f89bff1f372c84198"}}
def digest(raw):return hashlib.sha256(raw).hexdigest()
assert len(sys.argv)==1,"One reviewed resume; no runtime switches"
assert subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()==SHA
assert not subprocess.check_output(["git","diff","--name-only","HEAD","--","extensions","packages"],cwd=ROOT,text=True).strip(),"Restore QA overlay; product sources must match exact final commit"
assert digest(CONTROLLER.read_bytes())==CONTROLLER_SHA
input_raw=(EVIDENCE/SOURCE_RUN/"input-manifest.json").read_bytes()
assert digest(input_raw)==INPUT_SHA
inputs=json.loads(input_raw)
assert inputs["sha"]==SHA and len(inputs["files"])==1871
assert digest(subprocess.check_output(["git","show",SHA+":extensions/qa/phase3-full-show/linux-browser-verify.py"],cwd=ROOT))=="3db9cdf9336ad435f9565d7e6368e7e0d4cf5a184d43ec8d79ed68fff5bee617"
for rel in ["extensions/qa/phase3-full-show/browser-verify.mjs","extensions/qa/phase3-native-consent/proxy-verify.py"]:
 assert digest((ROOT/rel).read_bytes())==inputs["files"][rel]
for name,item in REUSED.items():
 raw=(EVIDENCE/item["path"]).read_bytes()
 assert digest(raw)==item["sha256"],("Reused receipt changed",name)
 receipt=json.loads(raw)
 assert receipt["sha"]==SHA and receipt["network"]=="none"
 if name=="native":
  assert receipt["allHashesVerifiedBeforeAfter"] and len(receipt["checks"])==16
  assert all(x["exit"]==0 for x in receipt["checks"])
  assert receipt["hashesBefore"]==receipt["hashesAfter"]==inputs["files"]
 else:
  assert receipt["exit"]==0 and receipt["allSourceHashesVerifiedBeforeAfter"]
 if name=="native-consent":
  assert receipt["sourceRun"]==SOURCE_RUN and receipt["sourceReadOnly"]
  assert receipt["sdkCacheHashesVerifiedBeforeAfter"] and receipt["webArtifactsUnchanged"] and receipt["widgetArtifactsUnchanged"]
assert not list(EVIDENCE.glob("tadazz-codex-fullshow-"+SHA[:12]+"-*/receipt.json")),"A matching accepted full-show receipt already exists; review before any further execution"
assert not list(EVIDENCE.glob("tadazz-codex-proxy-"+SHA[:12]+"-*/receipt.json")),"A proxy receipt already exists; do not repeat"
progress_path=DOCS/"release-gates-progress.json"
previous_raw=progress_path.read_bytes()
assert digest(previous_raw)==PROGRESS_SHA,"Failure history changed; review before resuming"
previous=json.loads(previous_raw)
assert previous["sourceSha"]==SHA and previous["sourceRun"]==SOURCE_RUN
assert previous["status"]=="failed" and previous["failedCheck"]=="full-show"
assert [x["check"] for x in previous["completed"]]==["native-launch","native-consent","full-show"]
assert [x["exit"] for x in previous["completed"]]==[0,0,1]
run="release-resume-"+SHA[:12]+"-"+uuid.uuid4().hex[:8]
owned=DOCS/run
owned.mkdir(exist_ok=False)
(owned/"previous-release-gates-progress.json").write_bytes(previous_raw)
(owned/"fullshow_affinity_corrected.py").write_bytes(CONTROLLER.read_bytes())
(owned/"resume_coordinator.py").write_bytes(pathlib.Path(__file__).read_bytes())
progress={
 "sourceSha":SHA,"sourceRun":SOURCE_RUN,"status":"running",
 "serialCpuBudget":True,"fullShowMemoryLimitBytes":3221225472,
 "completed":previous["completed"][:2],"reusedReceipts":REUSED,
 "attemptHistory":[{"status":"failed","failedCheck":"full-show","originalProgressSha256":PROGRESS_SHA,
 "archivedProgress":str(owned/"previous-release-gates-progress.json"),"originalFullShowRun":"tadazz-codex-fullshow-730cb4579d22-1587d04d",
 "originalCompleted":previous["completed"]}],
 "resumeRun":run,"runnerCorrection":{"controllerSha256":CONTROLLER_SHA,
 "evidenceRun":"tadazz-phase-continuity-scheduling-730cb4579d22-56930064",
 "change":"Remove taskset -c0; retain nice19, Docker1CPU and all assertions/limits",
 "productSourceChanged":False,"widgetRebuilt":False}}
def write():
 progress_path.write_text(json.dumps(progress,indent=2)+"\n",encoding="utf-8",newline="\n")
 (owned/"progress.json").write_bytes(progress_path.read_bytes())
def check_reused():
 for name,item in REUSED.items():
  assert digest((EVIDENCE/item["path"]).read_bytes())==item["sha256"],("Reused receipt changed during resume",name)
def read_unique(prefix):
 matches=list(EVIDENCE.glob(prefix+SHA[:12]+"-*/receipt.json"))
 assert len(matches)==1,[str(x) for x in matches]
 raw=matches[0].read_bytes()
 value=json.loads(raw)
 assert value["sha"]==SHA and value["exit"]==0
 return matches[0],raw,value
def validate_fullshow():
 path,raw,value=read_unique("tadazz-codex-fullshow-")
 assert value["network"]=="none" and value["sourceReadOnly"]
 assert value["allSourceHashesVerifiedBeforeAfter"] and value["allWidgetHashesVerifiedBeforeAfter"] and value["sdkCacheHashesVerifiedBeforeAfter"]
 assert value["widgetHtmlSha256"]=="b104367d1f9742e3e8b6f12d24391648b8bf92a72dee4f6d1c074a193c6397f6"
 assert value["widgetManifestSha256"]=="b5016791c480d583a84f1bcb4076ef5bc7054ebac8fdaa417ce30962c4aee4d4"
 inner=value["fullShow"]
 assert inner["failureCount"]==0 and len(inner["entries"])==40 and all(x["status"]=="PASS" for x in inner["entries"])
 assert {x["name"] for x in inner["engines"]}=={"chromium","webkit"}
 assert len(inner["rendererFixtures"])==44 and all(x["observed"]["status"]=="PASS" for x in inner["rendererFixtures"])
 assert not inner["errors"] and not inner["outboundDenied"] and inner["sourceHashesUnchanged"]
 resources=value["resources"]
 assert not resources["dockerOOMKilled"] and resources["configuredNanoCpus"]==1000000000
 assert resources["after"]["memoryLimitBytes"]==3221225472 and resources["after"]["memorySwapLimitBytes"]==0
 assert all(resources["after"]["memoryEvents"][key]==0 for key in ["oom","oom_kill","oom_group_kill"])
 assert "taskset" not in value["command"] and value["runnerCorrection"]["externalControllerSha256"]==CONTROLLER_SHA
 return path,raw
def validate_proxy():
 path,raw,value=read_unique("tadazz-codex-proxy-")
 assert value["sourceRun"]==SOURCE_RUN and value["immutable"] and value["combinedImmutableGate"]
 assert value["privacyProof"]["passed"] and value["network"]=="none"
 return path,raw
def run_gate(name,args,budget,validate):
 progress.update(current=name,stepStartedAt=time.time());write()
 log=owned/(name+".log")
 started=time.time()
 with log.open("w",encoding="utf-8") as stream:
  try:result=subprocess.run([sys.executable,*args],cwd=ROOT,stdout=stream,stderr=subprocess.STDOUT,text=True,timeout=budget)
  except subprocess.TimeoutExpired:
   stream.write("\nCoordinator timeout; no success inferred.\n")
   code=124
  else:code=result.returncode
 item={"check":name,"exit":code,"seconds":round(time.time()-started,3),"log":str(log),"attempt":2}
 if code:
  progress["completed"].append(item)
  raise RuntimeError(name+" failed with exit "+str(code))
 path,raw=validate()
 item.update(receipt=str(path),receiptSha256=digest(raw))
 check_reused()
 progress["completed"].append(item);write();print(json.dumps(item),flush=True)
try:
 write()
 run_gate("full-show",[str(CONTROLLER),SOURCE_RUN],1980,validate_fullshow)
 run_gate("proxy",["extensions/qa/phase3-native-consent/proxy-verify.py","--source-run",SOURCE_RUN,"--immutable"],120,validate_proxy)
 assert digest(CONTROLLER.read_bytes())==CONTROLLER_SHA
 assert subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()==SHA
 assert not subprocess.check_output(["git","diff","--name-only","HEAD","--","extensions","packages"],cwd=ROOT,text=True).strip()
 check_reused()
 progress["status"]="passed";progress["finishedAt"]=time.time()
 progress.pop("current",None);write()
 print(json.dumps(progress),flush=True)
except Exception as error:
 progress.update(status="failed",failedCheck=progress.get("current","resume-validation"),finishedAt=time.time(),
  resumeError={"type":type(error).__name__,"message":str(error)})
 write()
 print(json.dumps({"status":"failed","run":run,"error":progress["resumeError"]}),flush=True)
 raise SystemExit(1)
