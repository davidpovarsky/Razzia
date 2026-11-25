#!/usr/bin/env python3
"""Phase 1a only: build a pinned metadata/source derivative. No service actions."""
import argparse,datetime,hashlib,json,os
from pathlib import Path
import subprocess,sys
NAMESPACE=Path("/home/ubuntu/tadazz-theme-worker-ux-followup-20261119")
BASE="sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647"
CONTEXT_SHA="8873df14cdff05994fae0d3e67d8401de58f52a7fc6fb3866056240907d8962b"
SOURCE_SHA="751fa33e6591657fa40d14f99eb0f6eca775787e7ff5f0b18989bb69c73a89dd"
VERIFIER_SHA="18e47aa70d824c306713c0aeba199d400c0a6f1f191944b1c1d8097dd87ec22f"
TAG="tadazz:package-builder-ux-followup-20261119"
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def docker(args,timeout=10,env=None):
 return subprocess.run(["/usr/bin/docker",*args],capture_output=True,text=True,timeout=timeout,env=env)
def main():
 p=argparse.ArgumentParser(description=__doc__); p.add_argument("--execute",action="store_true"); a=p.parse_args()
 if not a.execute:
  print(json.dumps({"status":"PREPARED_NOT_EXECUTED","baseImage":BASE,"tag":TAG,"serviceActions":False})); return 0
 if sys.platform!="linux" or os.geteuid()!=0: raise RuntimeError("Linux Docker operator required")
 here=Path(__file__).resolve().parent
 if here!=NAMESPACE/"inputs/replacement" or NAMESPACE.resolve()!=NAMESPACE: raise RuntimeError("Reviewed namespace required")
 manifest_file=here/"context-manifest.json"
 if manifest_file.is_symlink() or sha(manifest_file)!=CONTEXT_SHA: raise RuntimeError("Context manifest pin mismatch")
 manifest=json.loads(manifest_file.read_text())
 context=here/"context"
 actual=set()
 for file in context.rglob("*"):
  if file.is_symlink(): raise RuntimeError("Context symlink denied")
  if file.is_file(): actual.add(file.relative_to(context).as_posix())
 if actual!=set(manifest["files"]): raise RuntimeError("Context file inventory mismatch")
 for relative,pin in manifest["files"].items():
  file=context/relative
  if not file.resolve().is_relative_to(context) or file.stat().st_size!=pin["bytes"] or sha(file)!=pin["sha256"]: raise RuntimeError("Context input changed: "+relative)
 for line in (context/"Dockerfile").read_text().splitlines():
  if line.strip() and line.split()[0] not in {"FROM","COPY","LABEL","WORKDIR","USER"}: raise RuntimeError("Executable build instruction denied")
 baseline=docker(["image","inspect","--format","{{.Id}}",BASE])
 if baseline.returncode or baseline.stdout.strip()!=BASE: raise RuntimeError("Pinned existing base unavailable; never pull")
 existing=docker(["image","inspect","--format","{{.Id}}",TAG])
 if existing.returncode==0 or "No such image" not in existing.stderr: raise RuntimeError("Fresh derivative tag required")
 receipt_file=here/"image-build-receipt.json"
 if receipt_file.exists(): raise RuntimeError("Build receipt already exists")
 env=dict(os.environ); env["DOCKER_BUILDKIT"]="0"
 command=["build","--pull=false","--network=none","--no-cache","--rm","--tag",TAG,"--file",str(context/"Dockerfile"),str(context)]
 result=docker(command,120,env)
 (here/"image-build.stdout.log").write_text(result.stdout)
 (here/"image-build.stderr.log").write_text(result.stderr)
 if result.returncode: raise RuntimeError("Derivative build failed; service unchanged")
 image=docker(["image","inspect","--format","{{.Id}}",TAG]).stdout.strip()
 if not image.startswith("sha256:") or len(image)!=71: raise RuntimeError("Exact built image ID required")
 fmt='{{ index .Config.Labels "org.tadazz.package-worker.base" }}|{{ index .Config.Labels "org.tadazz.package-worker.source-manifest-sha256" }}|{{ index .Config.Labels "org.tadazz.package-worker.verifier-sha256" }}|{{ index .Config.Labels "org.tadazz.package-worker.asana" }}'
 labels=docker(["image","inspect","--format",fmt,image])
 if labels.returncode or labels.stdout.strip()!="|".join([BASE,SOURCE_SHA,VERIFIER_SHA,"1220708526935641"]): raise RuntimeError("Built image labels mismatch")
 parent_layers=json.loads(docker(["image","inspect","--format","{{json .RootFS.Layers}}",BASE]).stdout)
 layers=json.loads(docker(["image","inspect","--format","{{json .RootFS.Layers}}",image]).stdout)
 if layers[:len(parent_layers)]!=parent_layers: raise RuntimeError("Image does not retain pinned base layers")
 receipt={"status":"BUILT_NOT_ACTIVATED","imageId":image,"baseImage":BASE,"tag":TAG,"contextManifestSha256":CONTEXT_SHA,"sourceManifestSha256":SOURCE_SHA,"verifierSha256":VERIFIER_SHA,"baseLayersRetained":True,"sourceFiles":manifest["sourceFiles"],"buildNetwork":"none","dependencyInstall":False,"runInstructions":False,"mutableCacheBindUsed":False,"serviceChanged":False,"timerChanged":False,"asanaTaskId":"1220708526935641","builtAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"command":["/usr/bin/docker",*command]}
 receipt_file.write_text(json.dumps(receipt,indent=2)+"\n")
 print(json.dumps({"status":receipt["status"],"imageId":image,"receipt":str(receipt_file),"serviceChanged":False})); return 0
if __name__=="__main__":
 try: raise SystemExit(main())
 except (RuntimeError,OSError,ValueError,KeyError,subprocess.TimeoutExpired) as e:
  print(json.dumps({"status":"BLOCKED_OR_FAILED","error":str(e)[:800],"serviceChanged":False,"timerChanged":False})); raise SystemExit(2)
