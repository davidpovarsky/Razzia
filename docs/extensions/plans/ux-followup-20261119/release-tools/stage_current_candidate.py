import base64,gzip,hashlib,json,pathlib,subprocess,time
ROOT=pathlib.Path(r"C:\Users\DAVID\Code\Razzia-worktrees\tadazz-ux-unified-20261119")
DOCS=ROOT/"docs/extensions/plans/ux-followup-20261119"
EVIDENCE=ROOT/"docs/extensions/plans/phase3-takeover-20261117"
SHA=json.loads((DOCS/"current-release-source.json").read_text(encoding="utf-8"))["sourceSha"]
assert len(SHA)==40 and all(c in "0123456789abcdef" for c in SHA)
def digest(data): return hashlib.sha256(data).hexdigest()
progress=json.loads((DOCS/"release-gates-progress.json").read_text(encoding="utf-8"))
assert progress["sourceSha"]==SHA and progress["status"]=="passed", "All exact-source gates must pass first"
assert [x["check"] for x in progress["completed"]]==["native-launch","native-consent","full-show","proxy"]
assert all(x["exit"]==0 for x in progress["completed"])
head=subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
assert head==SHA and not subprocess.check_output(["git","diff","--name-only","HEAD","--","extensions","packages"],cwd=ROOT,text=True).strip()
source_run=progress["sourceRun"]
paths={"host.json":EVIDENCE/source_run/"receipt.json"}
for label,prefix in [("launch.json","tadazz-codex-launch-"),("browser.json","tadazz-codex-browser-"),("full-show.json","tadazz-codex-fullshow-"),("proxy.json","tadazz-codex-proxy-")]:
 matches=list(EVIDENCE.glob(prefix+SHA[:12]+"-*/receipt.json"))
 assert len(matches)==1,(label,[str(x) for x in matches])
 paths[label]=matches[0]
files={}
for label,path in paths.items():
 raw=path.read_bytes(); value=json.loads(raw)
 assert value.get("sha")==SHA,(label,"wrong revision")
 if label=="host.json":
  assert value["allHashesVerifiedBeforeAfter"] and all(x["exit"]==0 for x in value["checks"])
 else: assert value["exit"]==0,label
 if label=="full-show.json":
  assert len(value["fullShow"]["entries"])==40 and all(x["status"]=="PASS" for x in value["fullShow"]["entries"])
  assert not value["resources"]["dockerOOMKilled"]
  assert all(value["resources"]["after"]["memoryEvents"][x]==0 for x in ("oom","oom_kill","oom_group_kill"))
 if label=="proxy.json": assert value["combinedImmutableGate"] and value["privacyProof"]["passed"]
 files[label]={"base64":base64.b64encode(raw).decode(),"sha256":digest(raw)}
cfg={"sha":SHA,"sourceRun":source_run,"files":files,
 "stageScriptSha256":digest(subprocess.check_output(["git","show",SHA+":extensions/deployment/stage-mcp-site.py"],cwd=ROOT)),
 "expectedContainer":"ce2deee99d7ba30717b8609a2138456d4834bee33cc2263031253d22d57c3081",
 "expectedImage":"sha256:4489e57b83be163dfa8fc312a6ed38df277e48fa0016263f807ae8266ee30344",
 "expectedGateway":"c29ea46f10ff6da76428b2f296ff1468c512ec9e2af76eba552d7a144766b202",
 "expectedConfigSha256":"6524e1e0a86be5e0ec497be239a7889f53ad4425e4d3aeec285364fc5db9e9b5",
 "baseImage":"sha256:417cc204da575626fb32c9a74435802e5222c3ef86fbce1578414bfa61ab4346"}
payload=base64.b64encode(gzip.compress(json.dumps(cfg).encode(),mtime=0)).decode()
remote=r'''import base64,gzip,hashlib,json,os,pathlib,re,shutil,subprocess,time
os.umask(0o077)
c=json.loads(gzip.decompress(base64.b64decode(__PAYLOAD__)))
assert re.fullmatch(r"[0-9a-f]{40}",c["sha"])
assert re.fullmatch(r"tadazz-codex-"+c["sha"][:12]+r"-[0-9a-f]{8}",c["sourceRun"])
def digest(data): return hashlib.sha256(data).hexdigest()
def inspect(name): return json.loads(subprocess.check_output(["docker","inspect",name]))[0]
def running(): return sorted(subprocess.check_output(["docker","ps","-q","--no-trunc"]).decode().splitlines())
app=inspect("tadazz"); gateway=inspect("tadazz-phone-gateway")
assert app["Id"]==c["expectedContainer"] and app["Image"]==c["expectedImage"] and app["State"]["Running"]
assert gateway["Id"]==c["expectedGateway"] and gateway["State"]["Running"]
runtime=pathlib.Path("/var/lib/tadazz-release-5312660/config/extensions/mcp-service/runtime.json")
assert digest(runtime.read_bytes())==c["expectedConfigSha256"]
owned=pathlib.Path("/home/ubuntu/tadazz-phase2-20261116/evidence")/c["sourceRun"]
assert owned.is_dir() and not owned.is_symlink()
receipts=owned/"release-receipts"
receipts.mkdir(mode=0o700,exist_ok=True)
assert not receipts.is_symlink() and receipts.stat().st_uid==0
assert set(c["files"])=={"host.json","launch.json","browser.json","full-show.json","proxy.json"}
receipt_hashes={}
for name,item in c["files"].items():
 data=base64.b64decode(item["base64"])
 assert len(data)<10000000 and digest(data)==item["sha256"]
 assert json.loads(data)["sha"]==c["sha"]
 path=receipts/name
 if path.exists():
  assert not path.is_symlink() and path.stat().st_uid==0 and digest(path.read_bytes())==item["sha256"]
 else:
  with path.open("xb") as out: out.write(data)
  path.chmod(0o600)
 receipt_hashes[name]=item["sha256"]
script=owned/"source/extensions/deployment/stage-mcp-site.py"
assert digest(script.read_bytes())==c["stageScriptSha256"]
cache=inspect("tadazz-phase2-20261116")
assert cache["Id"]=="07b64bb4f99518e306a2e3f5a693266a6ca543fdd1676627161af7077e818872"
assert cache["HostConfig"]["NetworkMode"]=="none" and not any((cache["NetworkSettings"].get("Ports") or {}).values())
cache_was_running=cache["State"]["Running"]
if cache_was_running:
 subprocess.run(["docker","stop","--time","10",cache["Id"]],capture_output=True,check=True,timeout=30)
assert not inspect(cache["Id"])["State"]["Running"]
before=running()
assert shutil.disk_usage("/var/lib/docker").free>2*1024**3
release=pathlib.Path("/home/ubuntu/tadazz-mcp-release-"+c["sha"][:12]+"-20261119")
assert not release.exists(),"Release directory must be fresh"
tag="tadazz:mcp-"+c["sha"][:12]+"-20261119"
args=["python3",str(script),"--source-run",c["sourceRun"],"--web-source-run",c["sourceRun"],"--revision",c["sha"],"--release-dir",str(release),"--image",tag,"--base-image",c["baseImage"]]
for flag,name in [("--host-receipt","host.json"),("--launch-receipt","launch.json"),("--web-receipt","host.json"),("--browser-receipt","browser.json"),("--full-show-receipt","full-show.json"),("--proxy-receipt","proxy.json")]:
 args.extend([flag,str(receipts/name)])
started=time.time()
try:
 result=subprocess.run(args,capture_output=True,text=True,timeout=1300)
except subprocess.TimeoutExpired as error:
 def text(value): return value.decode("utf-8",errors="replace") if isinstance(value,bytes) else (value or "")
 (receipts/"stage.stdout.log").write_text(text(error.stdout))
 (receipts/"stage.stderr.log").write_text(text(error.stderr))
 print(json.dumps({"exit":124,"stageTimedOut":True,"releaseDir":str(release),"sourceSha":c["sha"],"cacheRestoredStopped":True,"productionChanged":False}))
 raise SystemExit(124)
(receipts/"stage.stdout.log").write_text(result.stdout)
(receipts/"stage.stderr.log").write_text(result.stderr)
if result.returncode:
 print(json.dumps({"exit":result.returncode,"stdout":result.stdout[-10000:],"stderr":result.stderr[-5000:],"cacheRestoredStopped":True}))
 raise SystemExit(result.returncode)
manifest_file=release/"stage-manifest.json"
manifest=json.loads(manifest_file.read_text())
image_id=json.loads(subprocess.check_output(["docker","image","inspect",tag]))[0]["Id"]
assert manifest["sourceSha"]==c["sha"] and manifest["imageId"]==image_id and manifest["baseImage"]==c["baseImage"]
after=running()
assert after==before,"Other running containers changed during staging"
state={"sourceSha":c["sha"],"sourceRun":c["sourceRun"],"releaseDir":str(release),"candidateTag":tag,"candidateImage":image_id,"stageManifestSha256":digest(manifest_file.read_bytes()),"receiptHashes":receipt_hashes,"runningCount":len(after),"cacheRestoredStopped":True,"cacheWasRunning":cache_was_running,"productionContainer":app["Id"],"productionImage":app["Image"],"gatewayContainer":gateway["Id"],"runtimeConfigSha256":c["expectedConfigSha256"],"seconds":round(time.time()-started,3),"exit":0,"productionChanged":False}
(receipts/"coordinator-stage-state.json").write_text(json.dumps(state,indent=2)+"\n")
print(json.dumps(state))
'''
remote=remote.replace("__PAYLOAD__",repr(payload))
compile(remote,"stage-remote","exec")
result=subprocess.run(["ssh","-i",r"C:\Users\DAVID\.ssh\tadazz_oracle_2026","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=10","ubuntu@132.145.25.168","sudo -n python3 -"],input=remote,capture_output=True,text=True,timeout=1420)
(DOCS/"stage-execution.json").write_text(json.dumps({"exit":result.returncode,"stdout":result.stdout,"stderr":result.stderr},indent=2)+"\n",encoding="utf-8")
print(json.dumps({"exit":result.returncode,"stdout":result.stdout,"stderr":result.stderr}),flush=True)
raise SystemExit(result.returncode)
